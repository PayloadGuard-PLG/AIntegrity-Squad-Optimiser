from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
changes: dict[str, str] = {}


def load(path: str) -> str:
    return (ROOT / path).read_text()


def rep(path: str, old: str, new: str, count: int = 1) -> None:
    s = changes.get(path, load(path))
    actual = s.count(old)
    if actual < count:
        raise SystemExit(f"{path}: expected at least {count} occurrence(s), found {actual}: {old[:100]!r}")
    changes[path] = s.replace(old, new, count)


# 1. Source-family provenance is independent from transfer class.
changes['src/logic/coachTransfer.ts'] = '''/**
 * Transfer classification is an observed fact, not a boolean default.
 *
 * Standard / Focused / Extensive describe the coach's targeting shape. Reward
 * Coaches use those same labels, so none of them is evidence that the ordinary
 * Academy transfer function applies.
 */
export type CoachTransferClass = 'ordinary' | 'reward' | 'unresolved';
export type CoachSourceFamily = 'resource-coach' | 'training-camp' | 'unresolved';

function canonicalCoachLabels(fullText: string): string {
  return (fullText ?? '').replace(/\\bC0ACH\\b/gi, 'COACH');
}

/** Source/programme family is a separate observation from transfer class. */
export function classifyCoachSource(fullText: string): CoachSourceFamily {
  const text = canonicalCoachLabels(fullText);
  if (/\\btraining\\s*camp\\b/i.test(text)) return 'training-camp';
  if (/\\b(?:reward|academy|ordinary)\\s*coach\\b|\\bcoach\\s*academy\\b/i.test(text)) return 'resource-coach';
  return 'unresolved';
}

export function classifyCoachTransfer(fullText: string): CoachTransferClass {
  const text = canonicalCoachLabels(fullText);
  if (/\\breward\\s*coach\\b/i.test(text)) return 'reward';
  if (/\\b(?:academy|ordinary)\\s*coach\\b|\\bcoach\\s*academy\\b/i.test(text)) return 'ordinary';
  return 'unresolved';
}

/** Legacy/malformed rows cannot acquire ordinary status from a fallback value. */
export function normalisePersistedCoachTransferClass(
  value: unknown,
  source: unknown,
): CoachTransferClass {
  if (source !== 'observed') return 'unresolved';
  if (value === 'reward' || value === 'ordinary') return value;
  return 'unresolved';
}

/** Legacy rows have no trustworthy programme/source-family provenance. */
export function normalisePersistedCoachSourceFamily(
  value: unknown,
  source: unknown,
): CoachSourceFamily {
  if (source !== 'observed') return 'unresolved';
  if (value === 'resource-coach' || value === 'training-camp') return value;
  return 'unresolved';
}
'''

# 2. Parser records source family and makes Training Camp pre-empt transfer classification.
rep('src/logic/coachPreviewParse.ts',
    "import { classifyCoachTransfer, type CoachTransferClass } from './coachTransfer';",
    "import { classifyCoachSource, classifyCoachTransfer, type CoachSourceFamily, type CoachTransferClass } from './coachTransfer';")
rep('src/logic/coachPreviewParse.ts',
    "  transferClass: CoachTransferClass;\n",
    "  sourceFamily: CoachSourceFamily;\n  transferClass: CoachTransferClass;\n")
rep('src/logic/coachPreviewParse.ts',
    "  const transferClass = classifyCoachTransfer(fullText);",
    "  const sourceFamily = classifyCoachSource(fullText);\n  const transferClass = sourceFamily === 'training-camp' ? 'unresolved' : classifyCoachTransfer(fullText);")
rep('src/logic/coachPreviewParse.ts',
    "    transferClass,\n    isRewardCoach: transferClass === 'reward',\n    isTrainingCamp: /\\btraining\\s*camp\\b/i.test(fullText),",
    "    sourceFamily,\n    transferClass,\n    isRewardCoach: transferClass === 'reward',\n    isTrainingCamp: sourceFamily === 'training-camp',")

# 3. Training Camp uses only directly detected affected stats; category shape never expands it.
rep('src/logic/coachPipeline.ts',
    "  // Standard / Extensive: return the full confirmed category list regardless of OCR count.\n  // Reward Coaches and Focused coaches are excluded — OCR (or manual picker) drives those.\n  if (",
    "  const detected = Array.from(new Set(scan.stats.map(s => s.statName)));\n\n  // Training Camp is a different programme family. Preserve only observed targets;\n  // never expand it to a Resource Coach category shape.\n  if (scan.sourceFamily === 'training-camp') return detected;\n\n  // Standard / Extensive: return the full confirmed category list regardless of OCR count.\n  // Reward Coaches and Focused coaches are excluded — OCR (or manual picker) drives those.\n  if (")
rep('src/logic/coachPipeline.ts',
    "\n  const detected = Array.from(new Set(scan.stats.map(s => s.statName)));\n  return detected;\n}",
    "\n  return detected;\n}")

# 4. Resource Coach model domain includes source family explicitly.
rep('src/logic/resourceCoachV2.ts',
    "import type { CoachTransferClass } from './coachTransfer';",
    "import type { CoachSourceFamily, CoachTransferClass } from './coachTransfer';")
rep('src/logic/resourceCoachV2.ts',
    "  transferClass: CoachTransferClass; coachLabel: string; multiplier: number;",
    "  sourceFamily: CoachSourceFamily; transferClass: CoachTransferClass; coachLabel: string; multiplier: number;")
rep('src/logic/resourceCoachV2.ts',
    "    transferClass:input.transferClass, multiplier:input.multiplier,",
    "    sourceFamily:input.sourceFamily, transferClass:input.transferClass, multiplier:input.multiplier,")
rep('src/logic/resourceCoachV2.ts',
    "  if (input.transferClass !== 'ordinary') reasons.push(input.transferClass === 'reward'\n    ? 'Reward transfer is not calibrated. Observed ranges can still be saved.'\n    : 'Confirm the transfer class from game evidence.');",
    "  if (input.sourceFamily !== 'resource-coach') {\n    reasons.push(input.sourceFamily === 'training-camp'\n      ? 'Training Camp is outside Resource Coach V2. Observed ranges can still be saved as Training Camp evidence.'\n      : 'Confirm the programme/source family from game evidence.');\n  } else if (input.transferClass !== 'ordinary') reasons.push(input.transferClass === 'reward'\n    ? 'Reward transfer is not calibrated. Observed ranges can still be saved.'\n    : 'Confirm the transfer class from game evidence.');")

# 5. ResourceCoachLab stores Training Camp observations but cannot predict/calibrate them.
rep('src/components/ResourceCoachLab.tsx',
    "import type { CoachTransferClass } from '../logic/coachTransfer';",
    "import type { CoachSourceFamily, CoachTransferClass } from '../logic/coachTransfer';")
rep('src/components/ResourceCoachLab.tsx',
    "type Props = { player: Player; stats: string[]; multiplier: number; coachLabel: string; transferClass: CoachTransferClass; observed: CoachPreviewInterval[]; identityConflict: boolean };",
    "type Props = { player: Player; stats: string[]; multiplier: number; coachLabel: string; sourceFamily: CoachSourceFamily; transferClass: CoachTransferClass; observed: CoachPreviewInterval[]; identityConflict: boolean };")
rep('src/components/ResourceCoachLab.tsx',
    "props.multiplier,props.coachLabel,props.transferClass,props.observed",
    "props.multiplier,props.coachLabel,props.sourceFamily,props.transferClass,props.observed")
rep('src/components/ResourceCoachLab.tsx',
    "function LabSession({player,stats,multiplier,coachLabel,transferClass,observed,identityConflict}: Props) {",
    "function LabSession({player,stats,multiplier,coachLabel,sourceFamily,transferClass,observed,identityConflict}: Props) {")
rep('src/components/ResourceCoachLab.tsx',
    "    transferClass,coachLabel,multiplier,",
    "    sourceFamily,transferClass,coachLabel,multiplier,")
rep('src/components/ResourceCoachLab.tsx',
    "  }),[player,stats,multiplier,coachLabel,transferClass,classes]);",
    "  }),[player,stats,multiplier,coachLabel,sourceFamily,transferClass,classes]);")
rep('src/components/ResourceCoachLab.tsx',
    "    <Text style={{...textStyle,color:theme.steelLight,fontWeight:'700'}}>RESOURCE COACH V2 · EXPERIMENTAL</Text>\n    <Text style={textStyle}>Exposure ×{Number.isFinite(multiplier)?multiplier:'—'} / {stats.length} affected stats. Training Rate is not used.</Text>",
    "    <Text style={{...textStyle,color:theme.steelLight,fontWeight:'700'}}>{sourceFamily==='training-camp'?'TRAINING CAMP EVIDENCE · RESOURCE COACH V2 NOT APPLIED':'RESOURCE COACH V2 · EXPERIMENTAL'}</Text>\n    <Text style={textStyle}>{sourceFamily==='training-camp'\n      ? `Displayed multiplier ×${Number.isFinite(multiplier)?multiplier:'—'} · ${stats.length} affected stats. Training Camp is evidence-only.`\n      : transferClass==='ordinary'\n        ? `Exposure ×${Number.isFinite(multiplier)?multiplier:'—'} / ${stats.length} affected stats. Training Rate is not used.`\n        : `Displayed multiplier ×${Number.isFinite(multiplier)?multiplier:'—'} · ${stats.length} affected stats. Ordinary-model exposure is not evaluated for ${transferClass==='reward'?'Reward transfer':'an unresolved transfer class'}.`}</Text>")
rep('src/components/ResourceCoachLab.tsx',
    "    <Button label=\"PROJECT & SAVE PREDICTION\" onPress={project} disabled={!stats.length||!Number.isFinite(multiplier)||multiplier<=0||mismatch||hasZero}/>",
    "    {sourceFamily==='training-camp'&&<Text style={{...textStyle,color:theme.hot}}>Training Camp is a separate programme family. Save its observed intervals, but do not fit or project Resource Coach V2.</Text>}\n    <Button label=\"PROJECT & SAVE PREDICTION\" onPress={project} disabled={sourceFamily==='training-camp'||!stats.length||!Number.isFinite(multiplier)||multiplier<=0||mismatch||hasZero}/>")
rep('src/components/ResourceCoachLab.tsx',
    "    <Button label=\"USE SAVED PREVIEW AS SEPARATE ANCHOR\" disabled={!savedObservation||transferClass!=='ordinary'}",
    "    <Button label=\"USE SAVED PREVIEW AS SEPARATE ANCHOR\" disabled={!savedObservation||sourceFamily!=='resource-coach'||transferClass!=='ordinary'}")

# 6. Coaches screen keeps source family through scan/history and blocks relabelling Training Camp.
rep('app/(tabs)/coaches.tsx',
    "import type { CoachPreviewInterval, CoachTransferClass } from '../../src/logic/recommendation';",
    "import type { CoachPreviewInterval, CoachTransferClass } from '../../src/logic/recommendation';\nimport type { CoachSourceFamily } from '../../src/logic/coachTransfer';")
rep('app/(tabs)/coaches.tsx',
    "  const [transferClass, setTransferClass] = useState<CoachTransferClass>('unresolved');",
    "  const [transferClass, setTransferClass] = useState<CoachTransferClass>('unresolved');\n  const [sourceFamily, setSourceFamily] = useState<CoachSourceFamily>('unresolved');")
rep('app/(tabs)/coaches.tsx',
    "    setTransferClass('unresolved');\n    setObservedGainIntervals([]);",
    "    setTransferClass('unresolved');\n    setSourceFamily('unresolved');\n    setObservedGainIntervals([]);")
rep('app/(tabs)/coaches.tsx',
    "  function selectTransferClass(next: Exclude<CoachTransferClass, 'unresolved'>) {\n    setTransferClass(next);\n  }",
    "  function selectTransferClass(next: Exclude<CoachTransferClass, 'unresolved'>) {\n    if (sourceFamily === 'training-camp') return;\n    setSourceFamily('resource-coach');\n    setTransferClass(next);\n  }")
rep('app/(tabs)/coaches.tsx',
    "    savedTransferClass: CoachTransferClass,\n    savedIntervals: CoachPreviewInterval[] = [],",
    "    savedTransferClass: CoachTransferClass, savedSourceFamily: CoachSourceFamily,\n    savedIntervals: CoachPreviewInterval[] = [],")
rep('app/(tabs)/coaches.tsx',
    "      transferClass: savedTransferClass,\n      observedGainIntervals: savedIntervals,",
    "      transferClass: savedTransferClass,\n      sourceFamily: savedSourceFamily,\n      observedGainIntervals: savedIntervals,")
rep('app/(tabs)/coaches.tsx',
    "        setTransferClass('unresolved'); setObservedGainIntervals([]);",
    "        setTransferClass('unresolved'); setSourceFamily('unresolved'); setObservedGainIntervals([]);")
rep('app/(tabs)/coaches.tsx',
    "      const scannedTransferClass = scan.transferClass;\n      setTransferClass(scannedTransferClass);",
    "      const scannedTransferClass = scan.transferClass;\n      const scannedSourceFamily = scan.sourceFamily;\n      setTransferClass(scannedTransferClass);\n      setSourceFamily(scannedSourceFamily);")
rep('app/(tabs)/coaches.tsx',
    "          scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, intervals);",
    "          scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, scannedSourceFamily, intervals);",
    count=2)
rep('app/(tabs)/coaches.tsx',
    "      if (scannedTransferClass === 'reward') parts.push('REWARD COACH');\n      if (scannedTransferClass === 'ordinary') parts.push('ACADEMY COACH');\n      if (scannedTransferClass === 'unresolved') parts.push('TRANSFER UNRESOLVED');",
    "      if (scannedSourceFamily === 'training-camp') parts.push('TRAINING CAMP');\n      else if (scannedTransferClass === 'reward') parts.push('REWARD COACH');\n      else if (scannedTransferClass === 'ordinary') parts.push('ACADEMY COACH');\n      else parts.push('TRANSFER UNRESOLVED');")
rep('app/(tabs)/coaches.tsx',
    "                      <Pressable key={value} onPress={() => selectTransferClass(value)}\n                        style={{ paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1,",
    "                      <Pressable key={value} onPress={() => selectTransferClass(value)} disabled={sourceFamily==='training-camp'}\n                        style={{ paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, opacity: sourceFamily==='training-camp' ? 0.35 : 1,")
rep('app/(tabs)/coaches.tsx',
    "              {transferClass === 'reward' && (",
    "              {sourceFamily === 'training-camp' && (\n                <MonoLabel size={8} color={theme.hot} style={{ marginTop: 4 }}>\n                  TRAINING CAMP · EVIDENCE ONLY · RESOURCE COACH V2 BLOCKED\n                </MonoLabel>\n              )}\n              {transferClass === 'reward' && (")
rep('app/(tabs)/coaches.tsx',
    "              {transferClass === 'unresolved' && (",
    "              {sourceFamily !== 'training-camp' && transferClass === 'unresolved' && (")
rep('app/(tabs)/coaches.tsx',
    "            <ResourceCoachLab player={player} stats={scannedStats} multiplier={Number(sessions)}\n              coachLabel={[coachType,coachCategory].filter(Boolean).join(' ')} transferClass={transferClass}",
    "            <ResourceCoachLab player={player} stats={scannedStats} multiplier={Number(sessions)}\n              coachLabel={[coachType,coachCategory].filter(Boolean).join(' ')} sourceFamily={sourceFamily} transferClass={transferClass}")
rep('app/(tabs)/coaches.tsx',
    "                  setTransferClass(entry.transferClass);\n                  setObservedGainIntervals(entry.observedGainIntervals);",
    "                  setTransferClass(entry.transferClass);\n                  setSourceFamily(entry.sourceFamily);\n                  setObservedGainIntervals(entry.observedGainIntervals);")

# 7. Persist source-family provenance in scan history; legacy rows abstain.
rep('src/db/index.ts',
    "      stats TEXT NOT NULL DEFAULT '[]',\n      transfer_class TEXT NOT NULL DEFAULT 'unresolved',",
    "      stats TEXT NOT NULL DEFAULT '[]',\n      source_family TEXT NOT NULL DEFAULT 'unresolved',\n      source_family_source TEXT NOT NULL DEFAULT 'legacy-default',\n      transfer_class TEXT NOT NULL DEFAULT 'unresolved',")
rep('src/db/index.ts',
    "    try { expoDb.execSync(\"ALTER TABLE coach_scan_history ADD COLUMN transfer_class TEXT NOT NULL DEFAULT 'unresolved';\"); } catch {}",
    "    try { expoDb.execSync(\"ALTER TABLE coach_scan_history ADD COLUMN source_family TEXT NOT NULL DEFAULT 'unresolved';\"); } catch {}\n    try { expoDb.execSync(\"ALTER TABLE coach_scan_history ADD COLUMN source_family_source TEXT NOT NULL DEFAULT 'legacy-default';\"); } catch {}\n    try { expoDb.execSync(\"ALTER TABLE coach_scan_history ADD COLUMN transfer_class TEXT NOT NULL DEFAULT 'unresolved';\"); } catch {}")

rep('src/services/coachHistoryService.ts',
    "import { normalisePersistedCoachTransferClass } from '../logic/coachTransfer';",
    "import { normalisePersistedCoachSourceFamily, normalisePersistedCoachTransferClass, type CoachSourceFamily } from '../logic/coachTransfer';")
rep('src/services/coachHistoryService.ts',
    "  transferClass: CoachTransferClass;\n  observedGainIntervals:",
    "  transferClass: CoachTransferClass;\n  sourceFamily: CoachSourceFamily;\n  observedGainIntervals:")
rep('src/services/coachHistoryService.ts',
    "  if (e.transferClass === 'reward') parts.push('REWARD');\n  if (e.transferClass === 'unresolved') parts.push('UNCLASSIFIED');",
    "  if (e.sourceFamily === 'training-camp') parts.push('TRAINING CAMP');\n  else if (e.sourceFamily === 'unresolved') parts.push('SOURCE UNCLASSIFIED');\n  if (e.sourceFamily !== 'training-camp' && e.transferClass === 'reward') parts.push('REWARD');\n  if (e.sourceFamily === 'resource-coach' && e.transferClass === 'unresolved') parts.push('TRANSFER UNCLASSIFIED');")
rep('src/services/coachHistoryService.ts',
    "           (id, player_id, timestamp, coach_type, coach_category, sessions, stats,\n            transfer_class, preview_intervals, transfer_class_source, is_manual, label)\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,",
    "           (id, player_id, timestamp, coach_type, coach_category, sessions, stats,\n            source_family, source_family_source, transfer_class, preview_intervals, transfer_class_source, is_manual, label)\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,")
rep('src/services/coachHistoryService.ts',
    "         entry.sessions, JSON.stringify(entry.stats), entry.transferClass,\n         JSON.stringify(entry.observedGainIntervals),",
    "         entry.sessions, JSON.stringify(entry.stats), entry.sourceFamily,\n         entry.sourceFamily === 'unresolved' ? 'legacy-default' : 'observed',\n         entry.transferClass, JSON.stringify(entry.observedGainIntervals),")
rep('src/services/coachHistoryService.ts',
    "        transferClass: normalisePersistedCoachTransferClass(\n          r.transfer_class,\n          r.transfer_class_source,\n        ),\n        observedGainIntervals:",
    "        sourceFamily: normalisePersistedCoachSourceFamily(\n          r.source_family,\n          r.source_family_source,\n        ),\n        transferClass: normalisePersistedCoachTransferClass(\n          r.transfer_class,\n          r.transfer_class_source,\n        ),\n        observedGainIntervals:")

# 8. Resource Coach tests pin source family; Training Camp must abstain and cannot anchor.
rep('tests/resource-coach-v2-test.ts',
    "const input: ResourceInput = { playerId:'synthetic-player',age:28,tier:'T0',stateKey:'synthetic-state',transferClass:'ordinary',coachLabel:'Synthetic anchor',multiplier:26,",
    "const input: ResourceInput = { playerId:'synthetic-player',age:28,tier:'T0',stateKey:'synthetic-state',sourceFamily:'resource-coach',transferClass:'ordinary',coachLabel:'Synthetic anchor',multiplier:26,")
rep('tests/resource-coach-v2-test.ts',
    "  for(const patch of [{transferClass:'reward'},{transferClass:'unresolved'},",
    "  for(const patch of [{sourceFamily:'training-camp'},{sourceFamily:'unresolved'},{transferClass:'reward'},{transferClass:'unresolved'},")
rep('tests/resource-coach-v2-test.ts',
    "  assert.throws(()=>fitPlayerCalibration({...o,input:{...o.input,transferClass:'reward'}}));",
    "  assert.throws(()=>fitPlayerCalibration({...o,input:{...o.input,transferClass:'reward'}}));\n  assert.throws(()=>fitPlayerCalibration({...o,input:{...o.input,sourceFamily:'training-camp',transferClass:'unresolved'}}));")

# 9. Dedicated end-to-end regression for Training Camp scanner/pipeline/domain boundary.
changes['tests/training-camp-boundary-test.ts'] = '''import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCoachPreview } from '../src/logic/coachPreviewParse';
import { resolveCoachStats } from '../src/logic/coachPipeline';
import { predictResourceCoach, type ResourceInput } from '../src/logic/resourceCoachV2';

const result = {
  text: 'TRAINING CAMP\\nSTANDARD ATTACKING ×13\\nPASSING 134 +24-32\\nCREATIVITY 117 +25-35',
  blocks: [{
    text: 'TRAINING CAMP\\nSTANDARD ATTACKING ×13\\nPASSING 134 +24-32\\nCREATIVITY 117 +25-35',
    lines: [
      { text: 'TRAINING CAMP', frame: { top: 10, left: 0 } },
      { text: 'STANDARD ATTACKING ×13', frame: { top: 30, left: 0 } },
      { text: 'PASSING 134 +24-32', frame: { top: 100, left: 0 } },
      { text: 'CREATIVITY 117 +25-35', frame: { top: 130, left: 0 } },
    ],
  }],
} as any;

test('Training Camp is a source-family observation, never a Resource Coach transfer class', () => {
  const scan = parseCoachPreview(result);
  assert.equal(scan.sourceFamily, 'training-camp');
  assert.equal(scan.transferClass, 'unresolved');
  assert.equal(scan.isTrainingCamp, true);
  assert.equal(scan.multiplier, 13);
  assert.deepEqual(scan.stats.map(s => [s.statName, s.gainLo, s.gainHi]), [
    ['PASSING', 24, 32],
    ['CREATIVITY', 25, 35],
  ]);
});

test('Training Camp never expands Standard/Extensive category shape', () => {
  const scan = parseCoachPreview(result);
  assert.deepEqual(resolveCoachStats(scan, {}, ['ST']).sort(), ['CREATIVITY', 'PASSING']);
});

test('Training Camp cannot enter Resource Coach V2 prediction or calibration domain', () => {
  const input: ResourceInput = {
    playerId: 'training-camp-fixture', age: 26, tier: 'T0', stateKey: 'state',
    sourceFamily: 'training-camp', transferClass: 'unresolved',
    coachLabel: 'Standard Attacking', multiplier: 13,
    stats: [
      { stat: 'PASSING', displayedStat: 134, displayClass: 'WHITE', classSource: 'role-map' },
      { stat: 'CREATIVITY', displayedStat: 117, displayClass: 'WHITE', classSource: 'role-map' },
    ],
  };
  const prediction = predictResourceCoach(input);
  assert.equal(prediction.status, 'unavailable');
  assert.match(prediction.reasons.join(' '), /Training Camp is outside Resource Coach V2/);
});

test('screen wiring preserves Training Camp source and disables transfer relabelling', () => {
  const src = readFileSync('app/(tabs)/coaches.tsx', 'utf8');
  assert.match(src, /setSourceFamily\(scannedSourceFamily\)/);
  assert.match(src, /sourceFamily === 'training-camp'\) return/);
  assert.match(src, /sourceFamily=\{sourceFamily\}/);
  assert.match(src, /TRAINING CAMP · EVIDENCE ONLY · RESOURCE COACH V2 BLOCKED/);
});
'''

rep('package.json',
    '"test:scanner": "npx tsx tests/scanner-test.ts && node --import tsx --test tests/player-scan-state-test.ts tests/coach-identity-test.ts tests/coach-v0-regression-test.ts",',
    '"test:scanner": "npx tsx tests/scanner-test.ts && node --import tsx --test tests/player-scan-state-test.ts tests/coach-identity-test.ts tests/coach-v0-regression-test.ts tests/training-camp-boundary-test.ts",')

# Only write after every assertion above has passed.
for path, text in changes.items():
    (ROOT / path).write_text(text)

# This helper is staging-only; remove it so the PR diff contains only product/tests.
Path(__file__).unlink()

print('OK: Training Camp source boundary patch applied')
print('Changed source/tests; helper removed itself from the working tree.')
