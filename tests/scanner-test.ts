/**
 * Scanner / glyph-reader acceptance suite — the six tests specified in §6 of the
 * OCR Upgrade + State-Model Refactor spec.
 *
 *   npm run test:scanner
 *
 * Fixtures live in tests/fixtures:
 *   mlkit-<card>.json  serialised ML Kit output for a reference card
 *   scan-golden.json   output of the PRE-REFACTOR text pass — the frozen baseline
 *
 * Pixels come from two sources — see SOURCES below. No game imagery is committed.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parsePlayerCardText, parsePlayerCard, OcrResult } from '../src/logic/playerCardParse';
import {
  roleChips, playstyleBadge, specialAbilities, classifyChip, CALIBRATION,
  extractIconSamples, iconDistance, RgbaImage, GlyphContext, GlyphToken, rgbToHsv,
} from '../src/logic/glyphReader';
import calibration from '../src/logic/glyphCalibration.json';
import { getWhiteStatKeys, ROLE_CONSTRAINTS } from '../src/utils/roleWeights';
import { decodePng, blankImage, hsvToRgb } from './helpers/png';
import { buildSyntheticCard } from './helpers/syntheticCard';

const FIX = join(__dirname, 'fixtures');
const CAPTURES = join(__dirname, '..', 'calibration-captures');
const CARDS = ['lurinsky', 'moore', 'blakie', 'finlayson', 'gilmartin'] as const;
type Card = typeof CARDS[number];

let passed = 0, failed = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else {
    failed++; failures.push(label);
    console.log(`  ✗ FAIL: ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(a === e, label, a === e ? undefined : `expected ${e}\n      actual   ${a}`);
}

const ocr = (c: Card): OcrResult => JSON.parse(readFileSync(join(FIX, `mlkit-${c}.json`), 'utf8'));
const golden = JSON.parse(readFileSync(join(FIX, 'scan-golden.json'), 'utf8')) as Record<string, unknown>;

/**
 * Two pixel sources.
 *
 * `synthetic` is rebuilt from the committed measurements and always runs. It
 * proves the anchoring, classification and abstention machinery is wired
 * correctly, but it is painted from the same corpus the class boundaries derive
 * from, so it cannot independently confirm those boundaries.
 *
 * `capture` is the real screenshots. They are deliberately NOT in the repo (no
 * source-game imagery — see CLAUDE.md), so this pass runs only when labelled
 * captures are present in calibration-captures/. That is the non-circular check.
 */
const hasCaptures = CARDS.every(c => existsSync(join(CAPTURES, `card-${c}.png`)));
const synthetic = (c: Card): RgbaImage => buildSyntheticCard(c, ocr(c));
const capture = (c: Card): RgbaImage => decodePng(join(CAPTURES, `card-${c}.png`));
const SOURCES: Array<[string, (c: Card) => RgbaImage]> = hasCaptures
  ? [['synthetic', synthetic], ['capture', capture]]
  : [['synthetic', synthetic]];
const png = synthetic;

console.log('\n═'.repeat(1) + '═'.repeat(59));
console.log('  SCANNER + GLYPH READER — spec §6 acceptance suite');
console.log('═'.repeat(60));

// ---------------------------------------------------------------------------
// Test 1 — Regression fixture (MANDATORY). Constraint #1: the existing ML Kit
// text/number behaviour is preserved byte-for-byte.
// ---------------------------------------------------------------------------
console.log('\n[1] Regression fixture — existing text pass is byte-identical');
for (const c of CARDS) {
  const before = golden[c];
  // (a) the frozen text pass, whole object, byte-for-byte
  eq(parsePlayerCardText(ocr(c)), before, `${c}: text pass identical to pre-refactor golden`);
  // (b) the full new pipeline must not perturb the four fields §6.1 names
  const after = parsePlayerCard(ocr(c), png(c));
  const b = before as Record<string, unknown>;
  eq(
    { stats: after.stats, overall: after.overall, age: after.age, name: after.name },
    { stats: b.stats, overall: b.overall, age: b.age, name: b.name },
    `${c}: stats/overall/age/name unchanged through the glyph pass`
  );
}

// ---------------------------------------------------------------------------
// Test 2 — Role ontology. Moore: DC/DMC established, MC learning at 1/50, and
// MC's essentials must NOT reach the white list.
// ---------------------------------------------------------------------------
console.log('\n[2] Role ontology — established vs learning');
for (const [src, image] of SOURCES) {
  const r = parsePlayerCard(ocr('moore'), image('moore'));
  eq(r.establishedRoles, ['DC', 'DMC'], `moore [${src}]: establishedRoles == [DC, DMC]`);
  eq(r.learningRole, { role: 'MC', points: 1 }, `moore [${src}]: learningRole == {MC, 1}`);
  if (src !== SOURCES[0][0]) continue;

  const whites = getWhiteStatKeys(r.establishedRoles ?? []);
  const mcOnly = ROLE_CONSTRAINTS['MC'].essential.filter(
    s => !ROLE_CONSTRAINTS['DC'].essential.includes(s) && !ROLE_CONSTRAINTS['DMC'].essential.includes(s)
  );
  ok(mcOnly.length > 0, `moore: MC contributes stats DC/DMC do not (${mcOnly.join(', ')})`);
  const leaked = mcOnly.filter(s => whites.includes(s));
  eq(leaked, [], 'moore: no MC-only essential leaked into the white list');

  // And the legacy flat read would have leaked them — proving the fix does work.
  const naive = getWhiteStatKeys(['DC', 'DMC', 'MC']);
  ok(mcOnly.some(s => naive.includes(s)), 'moore: the pre-fix flat role list DID leak them');
}

// ---------------------------------------------------------------------------
// Test 3 — Boost separation. Base never absorbs the overlay.
// ---------------------------------------------------------------------------
console.log('\n[3] Boost separation — base stays base');
for (const [src, image] of SOURCES) {
  const f = parsePlayerCard(ocr('finlayson'), image('finlayson'));
  ok(f.stats['DRIBBLING'] === 289, `finlayson [${src}]: stats.DRIBBLING == 289 (base, not 314)`,
    `actual ${f.stats['DRIBBLING']}`);
  eq(f.boosts?.['DRIBBLING'], { amount: 25, source: 'personalTrainer', active: true },
    `finlayson [${src}]: boosts.DRIBBLING == {25, personalTrainer, active}`);

  const b = parsePlayerCard(ocr('blakie'), image('blakie'));
  ok(b.stats['DRIBBLING'] === 242, `blakie [${src}]: stats.DRIBBLING == 242 (base)`, `actual ${b.stats['DRIBBLING']}`);
  ok(b.boosts?.['DRIBBLING']?.active === false, `blakie [${src}]: greyed boost => active:false`,
    `actual ${JSON.stringify(b.boosts?.['DRIBBLING'])}`);

  const m = parsePlayerCard(ocr('moore'), image('moore'));
  ok(m.stats['BRAVERY'] === 254, `moore [${src}]: stats.BRAVERY == 254 (base)`, `actual ${m.stats['BRAVERY']}`);
  ok(m.boosts?.['BRAVERY']?.active === false, `moore [${src}]: greyed boost => active:false`);

  // The boost must not have leaked onto a neighbouring column's stat sharing the row.
  ok(!('MARKING' in (b.boosts ?? {})), `blakie [${src}]: no boost leaked onto the same-row DEF stat`);
}

// ---------------------------------------------------------------------------
// Test 4 — Abstention. A chip at the gold/black midpoint must abstain.
// ---------------------------------------------------------------------------
console.log('\n[4] Abstention — synthetic chip at the gold/black midpoint');
{
  // Midpoint between the two derived chip bands, in the value axis they separate on.
  const midV = (CALIBRATION.chip.darkValueMax + CALIBRATION.chip.establishedValueMin) / 2;
  const fill = rgbToHsv(...hsvToRgb(49, 0.52, midV));
  const bg = rgbToHsv(...hsvToRgb(127, 0.30, 0.98));
  eq(classifyChip(fill, bg), 'unclear', 'classifyChip: midpoint fill classifies as unclear');

  // Same thing through the full reader, on a synthetic card.
  const { img, fill: paint } = blankImage(400, 200, hsvToRgb(127, 0.30, 0.98));
  paint(100, 40, 180, 90, hsvToRgb(49, 0.52, midV));   // the ambiguous chip
  const tokens: GlyphToken[] = [
    { text: 'Roles:', frame: { left: 20, top: 60, width: 50, height: 18 } },
    { text: 'MC', frame: { left: 120, top: 60, width: 30, height: 18 } },
  ];
  const ctx: GlyphContext = { tokens, knownRoles: ['MC', 'DC', 'DMC'] };
  const r = roleChips(img, ctx);
  eq(r.establishedRoles, [], 'roleChips: no role assigned from an ambiguous chip');
  eq(r.learningRole, null, 'roleChips: no learning role assigned either');
  ok(r.review.some(f => f.reason === 'chip_state_unclear'),
    'roleChips: raises chip_state_unclear',
    `flags: ${JSON.stringify(r.review)}`);
}

// ---------------------------------------------------------------------------
// Test 5 — Playstyle families.
// ---------------------------------------------------------------------------
console.log('\n[5] Playstyle families');
{
  const cases: Array<[Card, string]> = [
    ['moore', 'defensive'], ['blakie', 'attacking'], ['lurinsky', 'none'],
    ['finlayson', 'attacking'], ['gilmartin', 'possession'],
  ];
  for (const [src, image] of SOURCES) {
    for (const [card, expected] of cases) {
      const r = parsePlayerCard(ocr(card), image(card));
      ok(r.playstyle === expected, `${card} [${src}]: playstyle == ${expected}`, `actual ${r.playstyle}`);
    }
  }
  // The amber/red boundary is the known-hard one: a hue in the gap must abstain.
  const gapHue = (CALIBRATION.badge.attacking.hi + CALIBRATION.badge.possession.lo) / 2;
  const { img, fill: paint } = blankImage(400, 200, hsvToRgb(166, 0.95, 0.56));
  paint(120, 40, 160, 90, hsvToRgb(gapHue, 0.67, 0.86));
  const tokens: GlyphToken[] = [{ text: 'Name', frame: { left: 20, top: 50, width: 90, height: 30 } }];
  const r = playstyleBadge(img, { tokens, knownRoles: [], nameBox: tokens[0].frame });
  ok(r.playstyle === undefined, `badge hue ${gapHue.toFixed(1)}deg in the red/amber gap yields no value`);
  ok(r.review.some(f => f.reason === 'ambiguous_color'), 'that hue raises ambiguous_color');
}

// ---------------------------------------------------------------------------
// Test 6 — Observed-empty is NOT the same state as unread (MANDATORY).
// Table-driven; asserts in both directions for every row.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Special-ability icons.
//
// On synthetic pixels the icon is rebuilt from a lossy 8x8 feature grid, so it
// lands ~0.06 from its own template — above the match ceiling. That is a
// renderer artefact, and loosening the ceiling to accommodate it would weaken
// the real classifier, so the committed assertion is rank-1 correctness: the
// NEAREST template must still be the right one. Full id matching is asserted
// only on real captures.
// ---------------------------------------------------------------------------
console.log('\n[3b] Special-ability icons');
{
  const templates = calibration.abilityTemplates as Array<{ id: string; observedOn: string[] } & {
    occupancy: number[]; chromaRB: number[]; chromaGB: number[];
  }>;
  const expectedCount: Record<Card, number> = {
    lurinsky: 1, moore: 2, blakie: 2, finlayson: 3, gilmartin: 2,
  };

  for (const c of CARDS) {
    const o = ocr(c);
    const labelTok = o.blocks.flatMap(b => b.lines).flatMap(l => l.elements)
      .find(e => /^abilit(y|ies)\s*:?$/i.test(e.text.trim()));
    const samples = labelTok?.frame ? extractIconSamples(synthetic(c), labelTok.frame as never) : null;
    ok(samples !== null && samples.length === expectedCount[c],
      `${c} [synthetic]: segments ${expectedCount[c]} ability icon(s)`,
      `actual ${samples ? samples.length : 'null'}`);
    samples?.forEach((sm, i) => {
      const want = templates.find(t => t.observedOn.includes(`${c}#${i}`));
      const nearest = templates
        .map(t => ({ id: t.id, d: iconDistance(sm.feature, t) }))
        .sort((a, b) => a.d - b.d)[0];
      ok(want !== undefined && nearest.id === want.id,
        `${c} [synthetic]: icon ${i} nearest template is ${want?.id}`,
        `nearest ${nearest.id} d=${nearest.d.toFixed(4)}`);
    });
  }

  if (hasCaptures) {
    for (const c of CARDS) {
      const r = parsePlayerCard(ocr(c), capture(c));
      ok(r.specialAbilities?.length === expectedCount[c],
        `${c} [capture]: ${expectedCount[c]} ability id(s) matched within threshold`,
        `actual ${JSON.stringify(r.specialAbilities)}`);
      ok(!r.review.some(f => f.reason === 'unmatched_icon'),
        `${c} [capture]: no unmatched_icon flag`);
    }
    // The same icon on a green card and a grey one must resolve to one template.
    const shared = (calibration.abilityTemplates as Array<{ id: string; observedOn: string[] }>)
      .filter(t => new Set(t.observedOn.map(k => k.split('#')[0])).size > 1);
    ok(shared.length > 0,
      `[capture] at least one template matched across different cards (${shared.map(t => t.id).join(', ')})`);
  } else {
    console.log('  · capture pass skipped — no labelled screenshots in calibration-captures/');
  }
}

console.log('\n[6] Observed-empty vs unread');
{
  type Row = {
    field: string;
    state: string;
    expectValue: unknown;      // undefined => no value may be produced
    expectFlag: boolean;       // region_unread expected?
    run: () => { value: unknown; flags: string[] };
  };

  const headerRgb = hsvToRgb(166, 0.95, 0.56);
  const nameBox = { left: 20, top: 50, width: 90, height: 30 };
  const badgeTokens: GlyphToken[] = [{ text: 'Name', frame: nameBox }];

  const abilityLabel: GlyphToken = { text: 'ability:', frame: { left: 20, top: 40, width: 70, height: 22 } };

  const rows: Row[] = [
    {
      field: 'playstyle', state: 'observed, no badge', expectValue: 'none', expectFlag: false,
      run: () => {
        const { img } = blankImage(400, 200, headerRgb);
        const r = playstyleBadge(img, { tokens: badgeTokens, knownRoles: [], nameBox });
        return { value: r.playstyle, flags: r.review.map(f => f.reason) };
      },
    },
    {
      field: 'playstyle', state: 'unread (anchor missing)', expectValue: undefined, expectFlag: true,
      run: () => {
        const { img } = blankImage(400, 200, headerRgb);
        const r = playstyleBadge(img, { tokens: [], knownRoles: [] }); // no nameBox anchor
        return { value: r.playstyle, flags: r.review.map(f => f.reason) };
      },
    },
    {
      field: 'tier', state: 'observed, no tier name', expectValue: 'T0', expectFlag: false,
      run: () => {
        const r = parsePlayerCard(ocr('lurinsky'), png('lurinsky'));
        return { value: r.tier, flags: r.review.filter(f => f.field === 'tier').map(f => f.reason) };
      },
    },
    {
      field: 'tier', state: 'unread (banner not read)', expectValue: undefined, expectFlag: true,
      run: () => {
        const r = parsePlayerCard(ocr('lurinsky'), null); // no image => banner never observed
        return { value: r.tier, flags: r.review.filter(f => f.field === 'tier').map(f => f.reason) };
      },
    },
    {
      field: 'abilities', state: 'observed, empty strip', expectValue: [], expectFlag: false,
      run: () => {
        const { img } = blankImage(600, 200, [180, 250, 190]); // uniform strip, no icons
        const r = specialAbilities(img, { tokens: [abilityLabel], knownRoles: [] });
        return { value: r.specialAbilities, flags: r.review.map(f => f.reason) };
      },
    },
    {
      field: 'abilities', state: 'unread (label not found)', expectValue: undefined, expectFlag: true,
      run: () => {
        const { img } = blankImage(600, 200, [180, 250, 190]);
        const r = specialAbilities(img, { tokens: [], knownRoles: [] }); // no anchor
        return { value: r.specialAbilities, flags: r.review.map(f => f.reason) };
      },
    },
  ];

  for (const row of rows) {
    const { value, flags } = row.run();
    const hasUnread = flags.includes('region_unread');
    const label = `${row.field} / ${row.state}`;
    if (row.expectFlag) {
      // Unread rows: a flag, and NO defaulted value (none / T0 / []).
      ok(hasUnread, `${label}: raises region_unread`);
      ok(value === undefined, `${label}: produces NO defaulted value`, `actual ${JSON.stringify(value)}`);
    } else {
      // Observed-empty rows: the absence value, and NO region_unread flag.
      eq(value, row.expectValue, `${label}: value == ${JSON.stringify(row.expectValue)}`);
      ok(!hasUnread, `${label}: carries no region_unread flag`, `flags ${JSON.stringify(flags)}`);
    }
  }
}

console.log('\n' + '═'.repeat(60));
console.log(`  Results:  ${passed} passed  ·  ${failed} failed`);
console.log(`  Pixel sources: ${SOURCES.map(([n]) => n).join(' + ')}` +
  (hasCaptures ? '' : '  (real captures absent — boundaries not independently confirmed)'));
console.log('═'.repeat(60) + '\n');
if (failed > 0) {
  console.log('Failed assertions:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
