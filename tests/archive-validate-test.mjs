import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadSchema, loadRoleMap, loadClubLevels, normaliseTables, validateArchive, runArchive, buildSnapshot, writeSnapshot, checkSnapshot,
  parseCsv, canonicalCsv, seasonCandidates, captureFromName, TAB_NAMES,
} from '../tools/drive-data-exchange/archive-validate.mjs';

const schema = loadSchema();
const roleMap = loadRoleMap();

// Transcriptions (numbers only) of two archive screens, read 24 Sep 2026 from the Drive folder.
// Scott Ritchie, Screenshot_20260418-092812.png: identical to canonical-corpus HIST record PRV-0015.
const RITCHIE = {
  name: 'Scott Ritchie', age: 18, ovr: 100.3, roles: 'DC DMC', coach: ['Standard', 'Defending', 40], boost: [9, 12],
  stats: [['Tackling', 88, 49, 58, 'UNREAD'], ['Marking', 92, 47, 55, 'UNREAD'], ['Positioning', 145, 15, 21, 'UNREAD'],
    ['Heading', 148, 15, 21, 'UNREAD'], ['Bravery', 141, 15, 22, 'UNREAD'], ['Passing', 78, '', '', 'WHITE'],
    ['Dribbling', 73, '', '', 'MID_GREY'], ['Crossing', 67, '', '', 'MID_GREY'], ['Shooting', 74, '', '', 'MID_GREY'],
    ['Finishing', 76, '', '', 'MID_GREY'], ['Fitness', 130, '', '', 'WHITE'], ['Strength', 98, '', '', 'WHITE'],
    ['Aggression', 95, '', '', 'WHITE'], ['Speed', 70, '', '', 'MID_GREY'], ['Creativity', 124, '', '', 'WHITE']],
  cats: [['DEFENSE', 123, 70.8, 28, 35], ['ATTACK', 73, 58.4, '', ''], ['PHYSICAL_AND_MENTAL', 103, 65.9, '', '']],
};
// Michael Benwell, Screenshot_20260516-125335.png (MC chip dark = learning).
const BENWELL = {
  name: 'Michael Benwell', age: 22, ovr: 108.7, roles: 'AMC', learning: 'MC', coach: ['Focused', 'Defending', 2], boost: [1, 1],
  stats: [['Tackling', 79, '', '', 'MID_GREY'], ['Marking', 87, 6, 9, 'UNREAD'], ['Positioning', 89, 6, 9, 'UNREAD'],
    ['Heading', 141, '', '', 'WHITE'], ['Bravery', 86, '', '', 'MID_GREY'], ['Passing', 117, '', '', 'WHITE'],
    ['Dribbling', 126, '', '', 'WHITE'], ['Crossing', 85, '', '', 'MID_GREY'], ['Shooting', 131, '', '', 'WHITE'],
    ['Finishing', 127, '', '', 'WHITE'], ['Fitness', 132, '', '', 'WHITE'], ['Strength', 67, '', '', 'MID_GREY'],
    ['Aggression', 91, '', '', 'MID_GREY'], ['Speed', 118, '', '', 'WHITE'], ['Creativity', 150, '', '', 'WHITE']],
  cats: [['DEFENSE', 96, 69.1, 2, 4], ['ATTACK', 117, 74.4, '', ''], ['PHYSICAL_AND_MENTAL', 111, 72.9, '', '']],
};

function blank() { return Object.fromEntries(TAB_NAMES(schema).map(t => [t, []])); }
function source(t, id, name, type = 'coach-preview', extra = {}) {
  t.Archive_Sources.push({ source_id: id, drive_file_id: `F-${id}`, drive_name: name, drive_md5: extra.md5 ?? '', width_px: '', height_px: '',
    capture_local: captureFromName(name) ?? extra.capture, capture_basis: captureFromName(name) ? 'filename' : 'user-stated',
    screen_type: type, duplicate_of_source_id: extra.dupOf ?? '', notes: '' });
}
function preview(t, id, src, P, read = 'A', patch = {}) {
  t.Archive_Previews.push({ preview_id: id, source_id: src, read_id: read, player_name: P.name, age: P.age, roles_established: P.roles,
    roles_learning: P.learning ?? '', ovr_displayed: P.ovr, coach_type: P.coach[0], coach_category: P.coach[1], multiplier: P.coach[2],
    programme_label: 'DRILL SESSION', duration_label: '1h', reward_badge: 'FALSE', eligibility_text: '', ovr_boost_lo: P.boost[0],
    ovr_boost_hi: P.boost[1], tier_card_id: '', notes: '', ...patch });
  for (const [stat, start_value, gain_lo, gain_hi, display_class] of P.stats) t.Archive_Preview_Stats.push({ preview_id: id, read_id: read, stat, start_value, gain_lo, gain_hi, display_class });
  for (const [category, avg_displayed, quality, gain_lo, gain_hi] of P.cats) t.Archive_Preview_Categories.push({ preview_id: id, read_id: read, category, avg_displayed, quality, gain_lo, gain_hi });
}
function card(t, id, src, P, tier, read = 'A', unreadAs = 'MID_GREY') {
  t.Archive_Cards.push({ card_id: id, source_id: src, read_id: read, player_name: P.name, age: P.age, tier_label: tier, roles_established: P.roles,
    roles_learning: P.learning ?? '', ovr_displayed: Math.floor(P.ovr), notes: '' });
  for (const [stat, value, , , cls] of P.stats) t.Archive_Card_Stats.push({ card_id: id, read_id: read, stat, value, display_class: cls === 'UNREAD' ? unreadAs : cls });
}
function toRaw(t) {
  return Object.fromEntries(Object.entries(t).map(([tab, rows]) => {
    const cols = schema.tabs[tab].columns.map(c => c[0]);
    return [tab, [cols, ...rows.map(r => cols.map(c => r[c] ?? ''))]];
  }));
}
function run(t, opts = {}) {
  const n = normaliseTables(toRaw(t), schema);
  assert.deepEqual(n.errors, []);
  return validateArchive(n.tables, { schema, roleMap, ...opts });
}
const pv = (r, id) => r.previews.find(p => p.preview_id === id);

test('calendar: boundary days are ambiguous, filenames give capture time', () => {
  assert.deepEqual(seasonCandidates('2026-04-18T09:28:12').candidates, [208, 209]);
  assert.deepEqual(seasonCandidates('2026-05-08T00:04:56').candidates, [209]);
  assert.equal(captureFromName('Screenshot_20260418-092812.png'), '2026-04-18T09:28:12');
  assert.equal(captureFromName('image.jpg'), null);
});

test('real archive screens satisfy the game arithmetic and read club levels 9 and 10', () => {
  const t = blank();
  source(t, 'ARC-1', 'Screenshot_20260418-092812.png'); preview(t, 'PV-1', 'ARC-1', RITCHIE); preview(t, 'PV-1', 'ARC-1', RITCHIE, 'B');
  source(t, 'ARC-2', 'Screenshot_20260508-100000.png'); preview(t, 'PV-2', 'ARC-2', BENWELL); preview(t, 'PV-2', 'ARC-2', BENWELL, 'B');
  const r = run(t);
  const hard = ['CATEGORY_SUM', 'OVR_BOOST_ENVELOPE', 'OVR_DISPLAY', 'AVG_DISPLAY', 'OFFSET_INCONSISTENT', 'READ_DISAGREE', 'CLASS_ROLE_CONFLICT'];
  for (const id of ['PV-1', 'PV-2']) for (const c of hard) assert.ok(!pv(r, id).codes.includes(c), `${id} ${c}`);
  assert.equal(pv(r, 'PV-1').p, 5); assert.equal(pv(r, 'PV-2').p, 2);
  assert.ok(Math.abs(pv(r, 'PV-1').qualityOffset - 40.05) < 0.1); assert.equal(pv(r, 'PV-1').clubLevelHypothesis, 9);
  assert.ok(Math.abs(pv(r, 'PV-2').qualityOffset - 45.0) < 0.1); assert.equal(pv(r, 'PV-2').clubLevelHypothesis, 10);
  // Boundary day and no other record of Ritchie: season cannot be decided.
  assert.ok(pv(r, 'PV-1').codes.includes('SEASON_UNRESOLVED'));
  assert.equal(pv(r, 'PV-1').grade, 'QUARANTINED');
  // Benwell: arithmetic clean, but no tier card, so the preview cannot be complete evidence.
  assert.ok(pv(r, 'PV-2').codes.includes('TIER_UNOBSERVED'));
  assert.equal(pv(r, 'PV-2').grade, 'PROVISIONAL');
});

test('a boundary-day screen resolves its season through the player age elsewhere', () => {
  const t = blank();
  source(t, 'ARC-1', 'Screenshot_20260418-092812.png'); preview(t, 'PV-1', 'ARC-1', RITCHIE);
  source(t, 'ARC-2', 'Screenshot_20260423-114209.png'); preview(t, 'PV-2', 'ARC-2', { ...RITCHIE, age: 19 });
  const r = run(t);
  assert.equal(pv(r, 'PV-1').season, 'S208'); assert.ok(pv(r, 'PV-1').flags.includes('SEASON_BY_AGE'));
  const t2 = blank();
  source(t2, 'ARC-1', 'Screenshot_20260418-092812.png'); preview(t2, 'PV-1', 'ARC-1', RITCHIE);
  source(t2, 'ARC-2', 'Screenshot_20260423-114209.png'); preview(t2, 'PV-2', 'ARC-2', RITCHIE);   // still 18 in S209
  assert.equal(pv(run(t2), 'PV-1').season, 'S209');
  const t3 = blank();
  source(t3, 'ARC-2', 'Screenshot_20260423-114209.png'); preview(t3, 'PV-2', 'ARC-2', RITCHIE);
  source(t3, 'ARC-3', 'Screenshot_20260508-114209.png'); preview(t3, 'PV-3', 'ARC-3', { ...RITCHIE, age: 19 });
  assert.ok(pv(run(t3), 'PV-3').codes.includes('AGE_SEASON'));
});

test('double reads must agree; disagreement names the cell; adjudication wins', () => {
  const t = blank();
  source(t, 'ARC-2', 'Screenshot_20260508-100000.png'); preview(t, 'PV-2', 'ARC-2', BENWELL);
  const misread = structuredClone(BENWELL); misread.stats[1][3] = 8;
  preview(t, 'PV-2', 'ARC-2', misread, 'B');
  let r = run(t);
  assert.ok(pv(r, 'PV-2').codes.includes('READ_DISAGREE'));
  assert.deepEqual(pv(r, 'PV-2').readDiffs.map(d => d.row), ['MARKING']);
  preview(t, 'PV-2', 'ARC-2', BENWELL, 'U');
  r = run(t);
  assert.ok(!pv(r, 'PV-2').codes.includes('READ_DISAGREE')); assert.ok(pv(r, 'PV-2').flags.includes('ADJUDICATED'));
  const single = blank(); source(single, 'ARC-2', 'Screenshot_20260508-100000.png'); preview(single, 'PV-2', 'ARC-2', BENWELL);
  assert.ok(pv(run(single), 'PV-2').codes.includes('SINGLE_READ'));
});

test('transcription errors are caught by the screen arithmetic', () => {
  const cases = [
    [P => { P.cats[0][4] = 5; }, 'CATEGORY_SUM'],
    [P => { P.boost = [1, 3]; }, 'OVR_BOOST_ENVELOPE'],
    [P => { P.stats[1][2] = 10; }, 'INTERVAL_INVERTED'],
    [P => { P.stats[5][1] = 147; }, 'OVR_DISPLAY'],                 // 117 misread as 147: sum moves by 30
    [P => { P.cats[1][2] = 76.4; }, 'OFFSET_INCONSISTENT'],
    [P => { P.stats.pop(); }, 'STAT_SET'],
    [P => { P.stats[3][4] = 'MID_GREY'; }, 'CLASS_ROLE_CONFLICT'],   // HEADING is essential for AMC
  ];
  for (const [mutate, code] of cases) {
    const P = structuredClone(BENWELL); mutate(P);
    const t = blank(); source(t, 'ARC-2', 'Screenshot_20260508-100000.png'); preview(t, 'PV-2', 'ARC-2', P); preview(t, 'PV-2', 'ARC-2', P, 'B');
    assert.ok(pv(run(t), 'PV-2').codes.includes(code), code);
  }
});

test('tier comes only from a card of the identical state in the same season (the PRV-0015 failure mode)', () => {
  const t = blank();
  source(t, 'ARC-2', 'Screenshot_20260508-100000.png'); preview(t, 'PV-2', 'ARC-2', BENWELL, 'A', { tier_card_id: 'CD-1' }); preview(t, 'PV-2', 'ARC-2', BENWELL, 'B', { tier_card_id: 'CD-1' });
  source(t, 'ARC-3', 'Screenshot_20260508-100100.png', 'player-card'); card(t, 'CD-1', 'ARC-3', BENWELL, 'None'); card(t, 'CD-1', 'ARC-3', BENWELL, 'None', 'B');
  let r = run(t);
  assert.equal(pv(r, 'PV-2').tier, 'T0'); assert.equal(pv(r, 'PV-2').grade, 'VERIFIED');
  assert.equal(r.evidenceCandidates.length, 1); assert.equal(r.evidenceCandidates[0].partition, 'archive-s209');
  assert.equal(r.evidenceCandidates[0].stats.find(s => s.stat === 'MARKING').displayClass, 'MID_GREY');
  // A later-season card with a different state (the HIST Ritchie construction) is refused.
  const t2 = blank();
  source(t2, 'ARC-2', 'Screenshot_20260508-100000.png'); preview(t2, 'PV-2', 'ARC-2', BENWELL, 'A', { tier_card_id: 'CD-9' });
  source(t2, 'ARC-9', 'Screenshot_20260911-100000.png', 'player-card');
  const later = structuredClone(BENWELL); later.age = 27; later.stats[0][1] = 150; card(t2, 'CD-9', 'ARC-9', later, 'Elite');
  r = run(t2);
  assert.ok(pv(r, 'PV-2').codes.includes('TIER_CARD_SEASON')); assert.ok(pv(r, 'PV-2').codes.includes('TIER_CARD_STATE'));
  assert.equal(pv(r, 'PV-2').grade, 'QUARANTINED'); assert.equal(r.evidenceCandidates.length, 0);
});

test('reward and unread badges never become ordinary evidence', () => {
  for (const [badge, cls] of [['TRUE', 'reward'], ['UNREAD', 'unresolved']]) {
    const t = blank(); source(t, 'ARC-2', 'Screenshot_20260508-100000.png');
    preview(t, 'PV-2', 'ARC-2', BENWELL, 'A', { reward_badge: badge }); preview(t, 'PV-2', 'ARC-2', BENWELL, 'B', { reward_badge: badge });
    const r = run(t); assert.equal(pv(r, 'PV-2').transferClass, cls); assert.equal(r.evidenceCandidates.length, 0);
  }
});

test('duplicates: identical files must be declared, declared copies grade DUPLICATE, repeated captures are not double-counted', () => {
  const t = blank();
  source(t, 'ARC-2', 'Screenshot_20260516-125335.png', 'coach-preview', { md5: 'aa' });
  source(t, 'ARC-X', 'image.jpg', 'coach-preview', { md5: 'aa', capture: '2026-05-16T12:53:35' });
  assert.ok(run(t).summary.errors.some(e => e.code === 'DUPLICATE_UNDECLARED'));
  t.Archive_Sources[1].duplicate_of_source_id = 'ARC-2';
  preview(t, 'PV-X', 'ARC-X', BENWELL);
  const r = run(t);
  assert.equal(r.summary.errors.length, 0); assert.equal(pv(r, 'PV-X').grade, 'DUPLICATE');
  const t2 = blank();
  source(t2, 'ARC-1', 'Screenshot_20260508-134609.png'); preview(t2, 'PV-1', 'ARC-1', BENWELL);
  source(t2, 'ARC-2', 'Screenshot_20260508-134625.png'); preview(t2, 'PV-2', 'ARC-2', BENWELL);
  const r2 = run(t2); assert.ok(pv(r2, 'PV-2').flags.includes('DUPLICATE_EVIDENCE')); assert.ok(!pv(r2, 'PV-1').flags.includes('DUPLICATE_EVIDENCE'));
});

test('source rows must match the Drive folder and filename timestamps', () => {
  const t = blank(); source(t, 'ARC-2', 'Screenshot_20260516-125335.png');
  let r = run(t, { driveFiles: [{ id: 'F-ARC-2', name: 'Screenshot_20260516-125335.png', md5Checksum: 'm' }, { id: 'F-NEW', name: 'x.png' }] });
  assert.deepEqual(r.summary.errors.map(e => e.code), ['SOURCE_ROW_MISSING']);
  t.Archive_Sources[0].capture_local = '2026-05-16T12:53:36';
  r = run(t); assert.ok(r.summary.errors.some(e => e.code === 'CAPTURE_MISMATCH'));
  assert.ok(run(blank(), { driveFiles: [] }).summary.errors.length === 0);
});

test('an ACKNOWLEDGE decision clears only acknowledgeable flags', () => {
  const P = structuredClone(BENWELL); P.stats[3][4] = 'MID_GREY'; P.boost = [1, 3];
  const t = blank(); source(t, 'ARC-2', 'Screenshot_20260508-100000.png'); preview(t, 'PV-2', 'ARC-2', P);
  t.Archive_Decisions.push({ entity_id: 'PV-2', decided_at: '2026-09-24T10:00:00Z', decided_by: 'user', decision: 'ACKNOWLEDGE', codes: 'CLASS_ROLE_CONFLICT OVR_BOOST_ENVELOPE', rationale: 'test' });
  const e = pv(run(t), 'PV-2');
  assert.ok(!e.codes.includes('CLASS_ROLE_CONFLICT')); assert.ok(e.codes.includes('OVR_BOOST_ENVELOPE')); assert.equal(e.grade, 'QUARANTINED');
});

test('schema enforcement: headers, enums, required cells, duplicate keys', () => {
  const raw = toRaw(blank());
  raw.Archive_Sources[0] = [...raw.Archive_Sources[0]].reverse();
  assert.ok(normaliseTables(raw, schema).errors.some(e => e.code === 'HEADER_MISMATCH'));
  const t = blank(); source(t, 'ARC-2', 'Screenshot_20260508-100000.png'); preview(t, 'PV-2', 'ARC-2', BENWELL, 'A', { reward_badge: 'maybe' });
  t.Archive_Preview_Stats[0].start_value = '79.5';
  const errs = normaliseTables(toRaw(t), schema).errors.map(e => e.code);
  assert.ok(errs.includes('CELL_ENUM')); assert.ok(errs.includes('CELL_TYPE'));
  const t2 = blank(); source(t2, 'ARC-2', 'Screenshot_20260508-100000.png'); source(t2, 'ARC-2', 'Screenshot_20260508-100001.png');
  assert.ok(normaliseTables(toRaw(t2), schema).errors.some(e => e.code === 'KEY_DUPLICATE'));
  assert.equal(runArchive({ rawTables: {}, schema, roleMap, snapshotDir: null }).summary.status, 'ABSENT');
});

test('snapshot identity is order-independent, round-trips through CSV and detects drift', () => {
  const t = blank(); source(t, 'ARC-2', 'Screenshot_20260508-100000.png'); preview(t, 'PV-2', 'ARC-2', BENWELL); preview(t, 'PV-2', 'ARC-2', BENWELL, 'B');
  const a = normaliseTables(toRaw(t), schema).tables;
  const shuffled = structuredClone(t); shuffled.Archive_Preview_Stats.reverse();
  const b = normaliseTables(toRaw(shuffled), schema).tables;
  assert.equal(buildSnapshot(a, schema).manifest.combinedSha256, buildSnapshot(b, schema).manifest.combinedSha256);
  const csv = canonicalCsv(a.Archive_Preview_Stats, schema.tabs.Archive_Preview_Stats);
  assert.equal(canonicalCsv(normaliseTables({ ...toRaw(blank()), Archive_Preview_Stats: parseCsv(csv) }, schema).tables.Archive_Preview_Stats, schema.tabs.Archive_Preview_Stats), csv);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-snap-'));
  try {
    writeSnapshot(dir, buildSnapshot(a, schema), { sealed: true });
    assert.equal(checkSnapshot(dir, schema, roleMap).status, 'VALID');
    const same = runArchive({ rawTables: toRaw(t), schema, roleMap, snapshotDir: dir });
    assert.equal(same.identity.status, 'IDENTICAL');
    const edited = structuredClone(t); edited.Archive_Preview_Stats[1].gain_hi = 10; edited.Archive_Preview_Stats[16].gain_hi = 10;
    const drift = runArchive({ rawTables: toRaw(edited), schema, roleMap, snapshotDir: dir });
    assert.equal(drift.identity.status, 'DRIFT'); assert.equal(drift.identity.sealed, true);
    assert.deepEqual(drift.identity.tabs.Archive_Preview_Stats.changed.sort(), ['PV-2|A|Marking', 'PV-2|B|Marking']);
    fs.appendFileSync(path.join(dir, 'Archive_Cards.csv'), 'CD-1,ARC-2,A,x,1,None,AMC,,1,\n');
    assert.ok(checkSnapshot(dir, schema, roleMap).errors.some(e => e.code === 'SNAPSHOT_HASH_MISMATCH'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(checkSnapshot(path.join(os.tmpdir(), 'no-such-archive-snapshot'), schema, roleMap).status, 'NO_SNAPSHOT');
});

test('the observed club-level timeline resolves boundary days and the 16 May preview agrees with it', () => {
  const levels = loadClubLevels();
  assert.deepEqual(levels, { 208: 9, 209: 10, 210: 11, 214: 15 });
  const t = blank();
  source(t, 'ARC-1', 'Screenshot_20260418-092812.png'); preview(t, 'PV-1', 'ARC-1', RITCHIE);
  source(t, 'ARC-2', 'Screenshot_20260516-125335.png'); preview(t, 'PV-2', 'ARC-2', BENWELL);
  const r = run(t, { clubLevels: levels });
  // 18 Apr: level 9 = observed S208, excludes S209 (10). 16 May: level 10 excludes S210 (observed 11).
  assert.equal(pv(r, 'PV-1').season, 'S208'); assert.ok(pv(r, 'PV-1').flags.includes('SEASON_BY_LEVEL'));
  assert.equal(pv(r, 'PV-2').season, 'S209'); assert.ok(pv(r, 'PV-2').flags.includes('SEASON_BY_LEVEL'));
  // Age and level disagreeing on a boundary day is a hard conflict, never a silent pick.
  const t2 = blank();
  source(t2, 'ARC-1', 'Screenshot_20260418-092812.png'); preview(t2, 'PV-1', 'ARC-1', RITCHIE);
  source(t2, 'ARC-2', 'Screenshot_20260423-114209.png'); preview(t2, 'PV-2', 'ARC-2', RITCHIE);   // age says S209
  assert.ok(pv(run(t2, { clubLevels: levels }), 'PV-1').codes.includes('SEASON_CONFLICT'));
});
