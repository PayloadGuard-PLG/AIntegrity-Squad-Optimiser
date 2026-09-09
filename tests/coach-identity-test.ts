/**
 * coach-identity-test — the coach-preview identity observations, end to end.
 *
 * Two separable claims are pinned here:
 *
 *   A. The resolvers RESOLVE. Both `playerName` and `talentTier` were produced
 *      by predicates that matched the wrong thing on realistic input, so a scan
 *      "observing" a name was frequently observing a stat row. A field that is
 *      wrong is worse than a field that is absent, so the fitness of the read is
 *      tested before anything that consumes it.
 *
 *   B. The observations SURVIVE into screen state, without inventing anything.
 *      Present values populate; absent values leave prior state alone; and the
 *      identity is never silently written onto the selected player's record —
 *      a coach preview shows whichever card the GAME attached to the coach.
 *
 * The resolvers live in coachIdentityParse.ts rather than coachScanner.ts for
 * exactly one reason: coachScanner imports @react-native-ml-kit/text-recognition,
 * which imports react-native, which Node cannot load. Without the split this file
 * could not exist. Same problem, same remedy as playerCardParse.ts.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolvePlayerName, resolveTalentTier, resolvePlayerAge,
  ingestScannedIdentity, identityMismatches, type NameBlock,
} from '../src/logic/coachIdentityParse';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

/**
 * A coach preview as ML Kit reports it: the card header at the top, the
 * three-column stat grid below. Block ORDER is varied deliberately — ML Kit does
 * not guarantee document order matches layout order, and the predicate this
 * replaces took the first match in document order.
 */
const header: NameBlock[] = [
  { text: 'Ricky Grant',        frame: { top: 62 } },
  { text: 'Age: 20',            frame: { top: 92 } },
  { text: 'Normal',             frame: { top: 118 } },
  { text: 'Standard Defending', frame: { top: 150 } },
  { text: '×40',                frame: { top: 150 } },
];
const statRows: NameBlock[] = [
  { text: 'Tackling 157 +5-7',  frame: { top: 300 } },
  { text: 'Marking 160',        frame: { top: 330 } },
  { text: 'Passing 172 +4-6',   frame: { top: 300 } },
  { text: 'Finishing 134 +5-7', frame: { top: 330 } },
];
/**
 * Bare stat-name blocks. ML Kit splits a stat's label from its value routinely —
 * coachScanner's whole row-pairing pass exists because "stat names and their gain
 * ranges are always in different blocks". A label alone carries no digit, so the
 * digit filter cannot reject it and the stat-name filter is the only thing that
 * can. These sit ABOVE the card in the frame to make the test adversarial: the
 * topmost-block rule would hand them back if the filter were removed.
 */
const bareStatLabels: NameBlock[] = [
  { text: 'Tackling',     frame: { top: 20 } },
  { text: 'Marking',      frame: { top: 24 } },
  { text: 'Finishing',    frame: { top: 28 } },
  { text: 'Rushing Out',  frame: { top: 32 } },
];

// ---------------------------------------------------------------------------
// A. the reads themselves
// ---------------------------------------------------------------------------

test('player name resolves to the card name in every block ordering', () => {
  const orderings: Array<[string, NameBlock[]]> = [
    ['header first',    [...header, ...statRows]],
    ['stats first',     [...statRows, ...header]],
    ['interleaved',     [statRows[0], header[0], statRows[1], header[1], header[2], statRows[2]]],
    ['stats bracketed', [statRows[3], statRows[0], header[3], header[0], statRows[1]]],
    ['bare labels above the card', [...bareStatLabels, ...header, ...statRows]],
  ];
  for (const [label, blocks] of orderings) {
    assert.equal(resolvePlayerName(blocks), 'Ricky Grant', `ordering: ${label}`);
  }
});

test('a stat row is never returned as a player name', () => {
  // The regression itself. Every one of these passes the old predicate
  // ("^[A-Z][a-z]", length >= 3, not all digits, not in the old blocklist), and
  // with no card present the old code returned the first of them as the name.
  for (const row of [...statRows, ...bareStatLabels]) {
    assert.equal(resolvePlayerName([row]), undefined,
      `stat row read as a name: ${row.text}`);
  }
  assert.equal(resolvePlayerName(statRows), undefined);
  assert.equal(resolvePlayerName(bareStatLabels), undefined);
});

test('UI chrome is never returned as a player name', () => {
  const chrome = ['Standard', 'Focused Attacking', 'Reward Coach', 'Training Camp',
                  'Select Player', 'Condition', 'Start Session', 'All-Round Boost'];
  for (const text of chrome) {
    assert.equal(resolvePlayerName([{ text, frame: { top: 10 } }]), undefined,
      `chrome read as a name: ${text}`);
  }
});

test('an unobservable name abstains rather than substituting something else', () => {
  assert.equal(resolvePlayerName([]), undefined);
  assert.equal(resolvePlayerName([...statRows, header[3]]), undefined);
});

test('talent tier is read from the value block, not from incidental prose', () => {
  assert.equal(resolveTalentTier(header), 'Normal');
  assert.equal(resolveTalentTier([{ text: 'Training Rate: FT2', frame: { top: 20 } }]), 'Fast');
  assert.equal(resolveTalentTier([{ text: 'FT1', frame: { top: 20 } }]), 'Fastest');
  assert.equal(resolveTalentTier([{ text: 'FT3', frame: { top: 20 } }]), 'Average');
  assert.equal(resolveTalentTier([{ text: 'Slow', frame: { top: 20 } }]), 'Slow');

  // The regression: /\b(FT1|FT2|FT3|Normal|Slow)\b/ over the whole OCR text.
  // "Normal" is an ordinary English word and "Slow" appears in UI copy.
  const prose = [
    { text: 'Normal training resumes next season', frame: { top: 20 } },
    { text: 'Slow down to review this preview',    frame: { top: 40 } },
  ];
  assert.equal(resolveTalentTier(prose), undefined,
    'a tier must not be manufactured from prose containing the word');
});

test('player age reads the labelled value and abstains otherwise', () => {
  assert.equal(resolvePlayerAge('Ricky Grant  Age: 20  OVR 176'), 20);
  assert.equal(resolvePlayerAge('Age 27'), 27);
  assert.equal(resolvePlayerAge('Tackling 157 +5-7'), undefined);
  assert.equal(resolvePlayerAge(''), undefined);
});

// ---------------------------------------------------------------------------
// B. ingestion — populate when observed, never invent
// ---------------------------------------------------------------------------

test('a scanned player name populates identity state', () => {
  const next = ingestScannedIdentity({ name: resolvePlayerName([...statRows, ...header]) }, {});
  assert.equal(next.name, 'Ricky Grant');
});

test('a scanned age populates identity state', () => {
  const next = ingestScannedIdentity({ age: resolvePlayerAge('Age: 20') }, {});
  assert.equal(next.age, 20);
});

test('a scanned talent tier populates identity state', () => {
  const next = ingestScannedIdentity({ talent: resolveTalentTier(header) }, {});
  assert.equal(next.talent, 'Normal');
});

test('all three populate together from one scan', () => {
  const blocks = [...statRows, ...header];
  const next = ingestScannedIdentity({
    name:   resolvePlayerName(blocks),
    age:    resolvePlayerAge(blocks.map(b => b.text).join('\n')),
    talent: resolveTalentTier(blocks),
  }, {});
  assert.deepEqual(next, { name: 'Ricky Grant', age: 20, talent: 'Normal' });
});

test('a missing observation does not overwrite an existing or manual value', () => {
  const manual = { name: 'Cptn Dallas', age: 23, talent: 'Normal' };

  // A scan that observed nothing at all changes nothing.
  assert.deepEqual(ingestScannedIdentity({}, manual), manual);
  assert.deepEqual(
    ingestScannedIdentity({ name: undefined, age: undefined, talent: undefined }, manual),
    manual);

  // A scan that observed ONE field changes only that field.
  assert.deepEqual(ingestScannedIdentity({ age: 24 }, manual),
    { name: 'Cptn Dallas', age: 24, talent: 'Normal' });

  // Empty string and NaN are failures to read, not observations of emptiness.
  assert.deepEqual(ingestScannedIdentity({ name: '', talent: '' }, manual), manual);
  assert.deepEqual(ingestScannedIdentity({ age: NaN }, manual), manual);
});

test('ingestion does not mutate the previous state object', () => {
  const prev = { name: 'Cptn Dallas', age: 23 };
  const next = ingestScannedIdentity({ age: 24 }, prev);
  assert.equal(prev.age, 23, 'prior state must be replaced, not edited in place');
  assert.notEqual(next, prev);
});

test('age 0 is not treated as absent', () => {
  // Guarding on truthiness rather than presence would silently drop it. Age 0 is
  // not a real football age, but the distinction being tested is presence.
  assert.equal(ingestScannedIdentity({ age: 0 }, {}).age, 0);
});

// ---------------------------------------------------------------------------
// B2. the identity is compared against the selected player, never written to it
// ---------------------------------------------------------------------------

test('a scanned card matching the selected player raises no conflict', () => {
  assert.deepEqual(
    identityMismatches({ name: 'Ricky  grant', age: 20, talent: 'Normal' },
                       { name: 'Ricky Grant', age: 20, talent: 'Normal' }),
    [], 'comparison is case- and whitespace-insensitive');
});

test('a scanned card from a different player is flagged on every disagreeing field', () => {
  const conflicts = identityMismatches(
    { name: 'Cptn Dallas', age: 23, talent: 'Fast' },
    { name: 'Ricky Grant', age: 20, talent: 'Normal' });
  assert.deepEqual(conflicts.map(c => c.field), ['name', 'age', 'talent']);
  assert.deepEqual(conflicts[0], { field: 'name', observed: 'Cptn Dallas', selected: 'Ricky Grant' });
});

test('an unobserved field is not evidence of disagreement', () => {
  assert.deepEqual(identityMismatches({ age: 20 }, { name: 'Ricky Grant', age: 20 }), []);
  assert.deepEqual(identityMismatches({}, { name: 'Ricky Grant', age: 20 }), []);
  assert.deepEqual(identityMismatches({ name: 'Ricky Grant' }, null), []);
});

// ---------------------------------------------------------------------------
// C. screen wiring
// ---------------------------------------------------------------------------

test('the coach scanner delegates identity to the react-native-free module', () => {
  const scanner  = read('src/logic/coachScanner.ts');
  const identity = read('src/logic/coachIdentityParse.ts');

  assert.match(scanner, /from '\.\/coachIdentityParse'/,
    'coachScanner must import the resolvers, not re-implement them');
  assert.equal(/const nameBlock = result\.blocks\.find/.test(scanner), false,
    'the document-order name predicate must not come back');
  assert.equal(/\/\\b\(FT1\|FT2\|FT3\|Normal\|Slow\)\\b\/i\.exec\(fullText\)/.test(scanner), false,
    'the whole-text talent regex must not come back');
  assert.equal(/react-native|ml-kit/i.test(identity), /* prose mentions only */ true);
  assert.equal(/^import .*(react-native|ml-kit)/m.test(identity), false,
    'coachIdentityParse must stay loadable by Node — no react-native imports');
});

test('the capture screen ingests every identity field the scanner observes', () => {
  const src = read('app/coach/capture.tsx');
  for (const [field, setter] of [
    ['playerName', 'setPlayerName'],
    ['playerAge',  'setAgeInput'],
    ['talentTier', 'setTalent'],
  ] as const) {
    // One statement, both guards: the selected-player guard and the field's own
    // presence guard must precede the setter with nothing else between them.
    const guarded = new RegExp(
      `if \\(!selectedPlayerId && scan\\.${field}\\b[\\s\\S]{0,220}?${setter}\\(`);
    assert.match(src, guarded,
      `scan.${field} must reach ${setter} only under !selectedPlayerId and its own presence check`);
  }
});

test('the coaches screen holds scanned identity as an observation, not a record write', () => {
  const src = read('app/(tabs)/coaches.tsx');
  assert.match(src, /ingestScannedIdentity\(/,
    'coaches.tsx must ingest the scanned identity');
  assert.match(src, /name: scan\.playerName[\s\S]{0,80}age: scan\.playerAge[\s\S]{0,80}talent: scan\.talentTier/,
    'all three observed fields must be passed to ingestion');
  assert.match(src, /identityMismatches\(/,
    'the scanned card must be compared against the selected player');

  // The hazard this guards: writing the scanned identity onto the selected
  // player would assert facts about player B from an image of player A.
  for (const forbidden of [
    /playerService\.[A-Za-z]+\([^)]*scannedIdentity/,
    /playerService\.[A-Za-z]+\([^)]*scan\.playerName/,
    /playerService\.[A-Za-z]+\([^)]*scan\.talentTier/,
  ]) {
    assert.equal(forbidden.test(src), false,
      `scanned identity must never be persisted onto the selected player (${forbidden})`);
  }
});

test('scanned identity is cleared whenever the coach context is', () => {
  const src = read('app/(tabs)/coaches.tsx');
  const clears = src.match(/setScannedIdentity\(\{\}\)/g) ?? [];
  assert.ok(clears.length >= 3,
    'a rejected scan, a player change and an applied projection must all clear it');
});

test('the Normal-talent projection policy is untouched by a scanned tier', () => {
  // A tier read off a coach preview is not Personal-Trainer confirmation, and
  // the projection applies Normal regardless of what is stored. Reading a tier
  // must not become a route into the engine.
  const src = read('app/(tabs)/coaches.tsx');
  assert.equal(/talent:\s*scannedIdentity/.test(src), false,
    'scanned talent must not be fed into a projection call');
  assert.equal(/projectCoachAction\([\s\S]{0,400}scannedIdentity/.test(src), false,
    'scanned identity must not reach projectCoachAction');
});

test('Reward Coach interval handling uses the explicit scanner classification', () => {
  const src = read('app/(tabs)/coaches.tsx');
  // The three facts bd5bc96 established, re-pinned here so an identity change
  // cannot quietly disturb them. tests/recommendation-seam-test.ts owns the
  // full contract; this is the adjacency check.
  assert.match(src, /scannedTransferClass\s*=\s*scan\.transferClass/,
    'the three-state transfer class must come from the scanner without a boolean default');
  assert.equal(/scan\.isRewardCoach\s*\?\s*'reward'\s*:\s*'ordinary'/.test(src), false,
    'a missed Reward label must not be promoted to ordinary');
  assert.match(src, /setObservedGainIntervals\(intervals\)/,
    'observed intervals must still be preserved');
  assert.equal(/gainLo \+ .*gainHi\) *\/ *2|\(lo \+ hi\) *\/ *2/.test(src), false,
    'no midpoint may be reintroduced on this screen');
});
