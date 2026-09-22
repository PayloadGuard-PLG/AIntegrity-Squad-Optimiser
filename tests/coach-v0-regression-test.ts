import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OcrBlock, OcrLine, OcrResult } from '../src/logic/playerCardParse';
import { parseCoachPreview } from '../src/logic/coachPreviewParse';
import { resolveCoachStats } from '../src/logic/coachPipeline';
import { detectCoachArrowTargets } from '../src/logic/coachTargetGlyphReader';
import { blankImage } from './helpers/png';
import { projectCoachAction, resolveTalentPolicy } from '../src/logic/recommendation';
import { withManualStatSelection } from '../src/logic/coachObservationState';
import { normalisePersistedCoachTransferClass } from '../src/logic/coachTransfer';
import type { Player } from '../src/database/playerSchema';
import type { GameProfile } from '../src/types/resources';
import profileJson from '../profiles/game_2025.json';

const profile = profileJson as unknown as GameProfile;
const frame = (top: number, left = 0) => ({ top, left, width: 300, height: 20 });
const block = (text: string, top: number, left = 0): OcrBlock => {
  const line: OcrLine = { text, frame: frame(top, left), elements: [] };
  return { text, frame: frame(top, left), lines: [line] };
};
const ocr = (...blocks: OcrBlock[]): OcrResult => ({
  text: blocks.map(b => b.text).join('\n'),
  blocks,
});

const player = (talent: Player['talent'] = 'Unknown', talentSource: Player['talentSource'] = 'manual'): Player => ({
  id: 'mehlem', name: 'Kevin Mehlem', age: 26, role: ['ST'], overall: 115.3,
  tier: 'T0', talent, talentSource,
  stats: { FINISHING: 125 }, isMutantCandidate: false,
});

test('V0: merged Reward row recovers class, targeting, baseline and the exact interval', () => {
  // This is the topology that defeated the old exact-token matcher: ML Kit kept
  // label, baseline and range in one line instead of emitting FINISHING alone.
  const scan = parseCoachPreview(ocr(
    block('Kevin Mehlem', 20),
    block('Age: 26', 45),
    block('OVR 115.3', 70),
    block('FOCUSED ATTACKING ×2', 100),
    block('REWARD C0ACH', 125), // representative all-caps OCR confusable
    block('FINISHING 125 +5–7', 220, 350),
  ));

  assert.equal(scan.coachType, 'Focused');
  assert.equal(scan.coachCategory, 'Attacking');
  assert.equal(scan.multiplier, 2);
  assert.equal(scan.transferClass, 'reward');
  assert.equal(scan.ovrBefore, 115.3);
  assert.deepEqual(scan.stats, [{ statName: 'FINISHING', statBefore: 125, gainLo: 5, gainHi: 7 }]);
  assert.deepEqual(scan.affectedStats, ['FINISHING']);
  assert.deepEqual(resolveCoachStats(scan, player().stats, player().role), ['FINISHING']);
  assert.equal(scan.ovrBoostLo, undefined, 'a stat interval must not be relabelled as an OVR boost');
});

test('V0: Reward projection abstains with no stat, XP or OVR numeric result', () => {
  const result = projectCoachAction({
    player: player(), stats: ['FINISHING'], sessions: 2, profile, transferClass: 'reward',
  });
  assert.equal(result.projectionStatus, 'unavailable');
  assert.equal(result.transferClass, 'reward');
  assert.ok(result.reasons.some(r => r.code === 'coach.rewardTransferUnresolved'));
  for (const forbidden of ['statDeltas', 'projectedStats', 'ovrDelta', 'ovrAfterExact', 'starBand', 'talent']) {
    assert.equal(forbidden in result, false, `${forbidden} must not exist on an abstention`);
  }
  assert.equal(JSON.stringify(result).includes('16.5'), false);
  assert.equal(JSON.stringify(result).includes('1.9'), false);
});

test('classification absence is unresolved and cannot enter the ordinary model', () => {
  const scan = parseCoachPreview(ocr(
    block('FOCUSED ATTACKING ×2', 100),
    block('FINISHING 125 +5-7', 220),
  ));
  assert.equal(scan.transferClass, 'unresolved');

  const explicit = projectCoachAction({
    player: player(), stats: ['FINISHING'], sessions: 2, profile, transferClass: scan.transferClass,
  });
  assert.equal(explicit.projectionStatus, 'unavailable');
  const unresolvedReason = explicit.reasons.find(r => r.code === 'coach.transferClassUnresolved');
  assert.ok(unresolvedReason);
  assert.doesNotMatch(unresolvedReason.detail, /predates|before coaches were classified/i);
  assert.match(unresolvedReason.detail, /available evidence/i);

  // Runtime guard: JavaScript, persisted legacy data, or an `any` cast cannot
  // bypass the required field and silently select ordinary transfer.
  const omitted = projectCoachAction({
    player: player(), stats: ['FINISHING'], sessions: 2, profile,
  } as never);
  assert.equal(omitted.projectionStatus, 'unavailable');

  assert.equal(normalisePersistedCoachTransferClass('ordinary', 'legacy-default'), 'unresolved');
  assert.equal(normalisePersistedCoachTransferClass('garbled', 'observed'), 'unresolved');
  assert.equal(normalisePersistedCoachTransferClass('ordinary', 'observed'), 'ordinary');
});

test('explicit Academy evidence keeps the ordinary geometric path functional', () => {
  const scan = parseCoachPreview(ocr(
    block('ACADEMY COACH', 70),
    block('FOCUSED ATTACKING ×2', 100),
    block('FINISHING 125 +5-7', 220),
  ));
  assert.equal(scan.transferClass, 'ordinary');
  const result = projectCoachAction({
    player: player('Normal', 'card'), stats: ['FINISHING'], sessions: 2, profile,
    transferClass: scan.transferClass,
  });
  assert.equal(result.projectionStatus, 'projected');
  assert.equal(result.statDeltas.length, 1);
  assert.ok(result.statDeltas[0].delta > 0);
});

test('Reward interval survives without a readable baseline', () => {
  const scan = parseCoachPreview(ocr(
    block('REWARD COACH', 80),
    block('FOCUSED ATTACKING ×2', 100),
    block('FINISHING +5-7', 220),
  ));
  assert.deepEqual(scan.stats, [{ statName: 'FINISHING', statBefore: 0, gainLo: 5, gainHi: 7 }]);
});

test('Focused targeting filters shared-row DEF and PHY columns identically for Reward and ordinary', () => {
  const scanThreeColumns = (classLabel: string) => parseCoachPreview(ocr(
    block(classLabel, 70),
    block('FOCUSED ATTACKING ×2', 100),
    block('BRAVERY', 220, 100),
    block('FINISHING 125 +5–7', 220, 350),
    block('FITNESS', 220, 700),
  ));

  const reward = scanThreeColumns('REWARD COACH');
  const ordinary = scanThreeColumns('ACADEMY COACH');
  const expected = [{ statName: 'FINISHING', statBefore: 125, gainLo: 5, gainHi: 7 }];

  assert.equal(reward.transferClass, 'reward');
  assert.equal(ordinary.transferClass, 'ordinary');
  assert.deepEqual(reward.stats, expected);
  assert.deepEqual(ordinary.stats, expected);
  assert.deepEqual(reward.stats, ordinary.stats,
    'transfer classification must not change the Focused targeting shape');
});


test('Standard Attacking Drill Session uses observed targets, not the five-stat category shortcut', () => {
  const scan = parseCoachPreview(ocr(
    block('DRILL SESSION', 60),
    block('STANDARD ATTACKING ×5', 90),
    block('PASSING 253 +1-2', 220, 350),
    block('DRIBBLING 245 +4-5', 270, 350),
    block('CROSSING 151', 320, 350),
    block('SHOOTING 232', 370, 350),
    block('FINISHING 153 +5-7', 420, 350),
  ));

  assert.equal(scan.programmeFamily, 'drill-session');
  assert.equal(scan.sourceFamily, 'resource-coach');
  assert.equal(scan.transferClass, 'unresolved');
  assert.deepEqual(scan.stats.map(s => s.statName), ['PASSING', 'DRIBBLING', 'FINISHING']);
  assert.deepEqual(scan.affectedStats, ['PASSING', 'DRIBBLING', 'FINISHING']);
  assert.deepEqual(
    resolveCoachStats(scan, {}, ['MC']),
    ['PASSING', 'DRIBBLING', 'FINISHING'],
    'coach category must not invent CROSSING or SHOOTING as affected targets',
  );
});

test('arrow-only coach screenshot resolves target rows from pixels without fabricating zero-gain intervals', () => {
  const rows = [
    ['TACKLING','PASSING','FITNESS'],
    ['MARKING','DRIBBLING','STRENGTH'],
    ['POSITIONING','CROSSING','AGGRESSION'],
    ['HEADING','SHOOTING','SPEED'],
    ['BRAVERY','FINISHING','CREATIVITY'],
  ] as const;
  const blocks: OcrBlock[] = [
    block('DRILL SESSION', 40, 350),
    block('STANDARD ATTACKING ×5', 65, 350),
  ];
  const lefts = [100,350,600];
  rows.forEach((row,ri)=>row.forEach((stat,ci)=>blocks.push(block(stat,100+ri*60,lefts[ci]))));
  const result=ocr(...blocks);
  const {img,fill}=blankImage(900,460,[110,110,110]);
  for(const [stat,ri] of [['PASSING',0],['DRIBBLING',1],['FINISHING',4]] as const) {
    const x=350+Math.round(250*.86);
    const y=100+ri*60+6;
    fill(x,y,x+12,y+12,[255,255,255]);
  }
  const glyphTargets=detectCoachArrowTargets(result,img);
  assert.deepEqual([...glyphTargets].sort(),['DRIBBLING','FINISHING','PASSING']);

  const scan=parseCoachPreview(result);
  assert.deepEqual(scan.stats,[], 'arrow-only evidence must not become a synthetic [0,0] gain interval');
  assert.deepEqual(scan.affectedStats,[]);
});

test('Standard category with no observed target rows remains unresolved instead of inventing five stats', () => {
  const scan = parseCoachPreview(ocr(
    block('SKILL SEMINAR', 60),
    block('STANDARD ATTACKING ×5', 90),
    block('PASSING 253', 220, 350),
    block('DRIBBLING 245', 270, 350),
    block('CROSSING 151', 320, 350),
    block('SHOOTING 232', 370, 350),
    block('FINISHING 153', 420, 350),
  ));

  assert.equal(scan.programmeFamily, 'skill-seminar');
  assert.equal(scan.sourceFamily, 'resource-coach');
  assert.deepEqual(scan.stats, []);
  assert.deepEqual(resolveCoachStats(scan, {}, ['MC']), []);
});

test('two-word goalkeeper stats survive split ML Kit line tokens', () => {
  const scan = parseCoachPreview(ocr(
    block('ACADEMY COACH', 70),
    block('FOCUSED GOALKEEPING ×2', 100),
    block('RUSHING', 220, 100),
    block('OUT', 222, 190),
    block('120', 220, 300),
    block('+5–7', 220, 370),
    block('AERIAL', 270, 100),
    block('REACH', 272, 190),
    block('130', 270, 300),
    block('+3–5', 270, 370),
  ));
  assert.deepEqual(scan.stats, [
    { statName: 'RUSHING OUT', statBefore: 120, gainLo: 5, gainHi: 7 },
    { statName: 'AERIAL REACH', statBefore: 130, gainLo: 3, gainHi: 5 },
  ]);
});

test('OCR stat corrections apply inside merged preview rows', () => {
  const scan = parseCoachPreview(ocr(
    block('REWARD COACH', 70),
    block('FOCUSED GOALKEEPING ×2', 100),
    block('ANTICIPAT1ON 120 +5–7', 220, 100),
  ));
  assert.deepEqual(scan.stats, [
    { statName: 'ANTICIPATION', statBefore: 120, gainLo: 5, gainHi: 7 },
  ]);
});

test('an explicitly co-row OVR boost remains observable without borrowing a stat range', () => {
  const scan = parseCoachPreview(ocr(
    block('REWARD COACH', 80),
    block('OVR 115.3', 120, 0),
    block('+1-2', 120, 250),
    block('FINISHING 125 +5-7', 220),
  ));
  assert.equal(scan.ovrBoostLo, 1);
  assert.equal(scan.ovrBoostHi, 2);
  assert.deepEqual(scan.stats[0], { statName: 'FINISHING', statBefore: 125, gainLo: 5, gainHi: 7 });
});

test('manual stat correction preserves Reward class and observed interval by value', () => {
  const interval = { stat: 'FINISHING', statBefore: 125, gainLo: 5, gainHi: 7 };
  const next = withManualStatSelection({
    transferClass: 'reward', observedGainIntervals: [interval], selectedStats: [],
  }, ['FINISHING']);
  assert.deepEqual(next, {
    transferClass: 'reward', observedGainIntervals: [interval], selectedStats: ['FINISHING'],
  });
});

test('stored training rate and applied projection rate remain separate facts', () => {
  assert.deepEqual(resolveTalentPolicy(player('Unknown', 'manual')), {
    stored: 'Unknown', storedSource: 'manual', applied: 'Normal',
    source: 'normal-substitution-policy',
  });
  assert.deepEqual(resolveTalentPolicy(player('Fast', 'card')), {
    stored: 'Fast', storedSource: 'card', applied: 'Normal',
    source: 'normal-substitution-policy',
  });
  assert.deepEqual(resolveTalentPolicy(player('Normal', 'card')), {
    stored: 'Normal', storedSource: 'card', applied: 'Normal',
    source: 'stored-normal-observation',
  });
});

test('web persistence round-trip retains Unknown and non-Normal observation provenance', async () => {
  const values = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  (globalThis as any).window = { dispatchEvent: () => true };
  const { playerService } = await import('../src/services/playerService.web');

  const { id: _unknownId, ...unknownInput } = player('Unknown', 'manual');
  const unknownId = playerService.create(unknownInput);
  const unknown = playerService.getById(unknownId)!;
  assert.equal(unknown.talent, 'Unknown');
  assert.equal(unknown.talentSource, 'manual');

  const { id: _fastId, ...fastInput } = player('Fast', 'card');
  const fastId = playerService.create(fastInput);
  const fast = playerService.getById(fastId)!;
  assert.equal(fast.talent, 'Fast');
  assert.equal(fast.talentSource, 'card');
});
