// Validator for the S208-S209 screenshot archive transcription.
//
// The archive is transcribed by hand (or by an assistant) into Archive_* tabs of the Resource Coach
// spreadsheet. Nothing typed there is trusted: this module recomputes seasons, grades, pairing verdicts
// and the club-level reading from the transcribed numbers, and checks each screen against the game's
// own arithmetic. It never promotes anything into the calibration log; it only lists candidates.
//
// Usage:
//   node tools/drive-data-exchange/archive-validate.mjs --xlsx sheet.xlsx [--drive-inventory files.json]
//        [--snapshot-dir calibration/archive-s208-s209/snapshot] [--out-dir DIR] [--write-snapshot]
//   node tools/drive-data-exchange/archive-validate.mjs --csv-dir DIR ...        (same, from CSV tabs)
//   node tools/drive-data-exchange/archive-validate.mjs --check-snapshot calibration/archive-s208-s209/snapshot
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
export const SCHEMA_PATH = path.join(ROOT, 'calibration', 'archive-s208-s209', 'archive-schema.json');
export const DEFAULT_SNAPSHOT_DIR = path.join(ROOT, 'calibration', 'archive-s208-s209', 'snapshot');
const ROLE_WEIGHTS_TS = path.join(ROOT, 'src', 'utils', 'roleWeights.ts');

// ── Calendar ──────────────────────────────────────────────────────────────────────────────────────
export const SEASONS = [
  ['S208', '2026-03-22', '2026-04-18'], ['S209', '2026-04-19', '2026-05-16'], ['S210', '2026-05-17', '2026-06-13'],
  ['S211', '2026-06-14', '2026-07-11'], ['S212', '2026-07-12', '2026-08-08'], ['S213', '2026-08-09', '2026-09-05'],
  ['S214', '2026-09-06', '2026-10-03'],
];
export const ARCHIVE_WINDOW = ['S208', 'S209'];
const seasonIndex = s => Number(String(s).slice(1));
const seasonName = i => `S${i}`;

/** Season of a device-local date. The rollover time of day and the device time zone are unknown, so the
 *  first and last day of every season are ambiguous between the two adjacent seasons. */
export function seasonCandidates(isoDateTime) {
  const day = String(isoDateTime).slice(0, 10);
  const hit = SEASONS.find(([, a, b]) => day >= a && day <= b);
  if (!hit) return { season: null, candidates: [], boundary: false };
  const idx = seasonIndex(hit[0]);
  if (day === hit[2]) return { season: hit[0], candidates: [idx, idx + 1], boundary: true };
  if (day === hit[1]) return { season: hit[0], candidates: [idx - 1, idx], boundary: true };
  return { season: hit[0], candidates: [idx], boundary: false };
}

export function captureFromName(name) {
  const m = String(name).match(/Screenshot_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

// ── Game vocabulary ───────────────────────────────────────────────────────────────────────────────
export const OUTFIELD = ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'PASSING', 'DRIBBLING', 'CROSSING',
  'SHOOTING', 'FINISHING', 'FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY'];
export const GK_ALL = ['REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION', 'THROWING', 'KICKING',
  'PUNCHING', 'AERIAL REACH', 'CONCENTRATION', 'FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY'];
export const CATEGORY_OF = {
  TACKLING: 'DEFENSE', MARKING: 'DEFENSE', POSITIONING: 'DEFENSE', HEADING: 'DEFENSE', BRAVERY: 'DEFENSE',
  REFLEXES: 'DEFENSE', AGILITY: 'DEFENSE', ANTICIPATION: 'DEFENSE', 'RUSHING OUT': 'DEFENSE', COMMUNICATION: 'DEFENSE',
  PASSING: 'ATTACK', DRIBBLING: 'ATTACK', CROSSING: 'ATTACK', SHOOTING: 'ATTACK', FINISHING: 'ATTACK',
  THROWING: 'ATTACK', KICKING: 'ATTACK', PUNCHING: 'ATTACK', 'AERIAL REACH': 'ATTACK', CONCENTRATION: 'ATTACK',
  FITNESS: 'PHYSICAL_AND_MENTAL', STRENGTH: 'PHYSICAL_AND_MENTAL', AGGRESSION: 'PHYSICAL_AND_MENTAL',
  SPEED: 'PHYSICAL_AND_MENTAL', CREATIVITY: 'PHYSICAL_AND_MENTAL',
};
export const TIER_INDEX = { None: 0, Rare: 1, Elite: 2, Stellar: 3, Master: 4, Epic: 5, Legendary: 6 };
export const normStat = s => String(s).trim().toUpperCase().replace(/\s+/g, ' ');
export const normName = s => String(s).normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[.\s]+/g, ' ').trim();
const roleList = s => String(s || '').toUpperCase().split(/[\s,./|]+/).map(r => r.replace(/:.*$/, '')).filter(Boolean);

/** Role table read from the app source, so the comparison cannot drift from the app. Comparison only:
 *  the class read from the screen is the observation; the table is itself evidence-derived. */
export function loadRoleMap(file = ROLE_WEIGHTS_TS) {
  const src = fs.readFileSync(file, 'utf8');
  const essential = {};
  for (const m of src.matchAll(/^\s*(GK|ST|AMC|AML|AMR|ML|MR|MC|DMC|DC|DL|DR):\s*\{\s*essential:\s*\[([^\]]*)\]/gm)) {
    essential[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
  }
  const overrides = {};
  const ov = src.match(/ROLE_SET_WHITE_OVERRIDES[^=]*=\s*\{([\s\S]*?)\};/);
  if (ov) for (const m of ov[1].matchAll(/'([^']+)':\s*\[([^\]]*)\]/g)) overrides[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
  return { essential, overrides };
}
export function whiteSet(roles, roleMap) {
  const out = new Set();
  for (const r of roles) for (const s of roleMap.essential[r] ?? []) out.add(s);
  for (const s of roleMap.overrides[[...roles].slice(0, 3).sort().join('|')] ?? []) out.add(s);
  return out;
}

// ── Codes ─────────────────────────────────────────────────────────────────────────────────────────
// HARD codes quarantine an entity: a transcription or the screen itself contradicts the game's arithmetic.
export const HARD = new Set(['READ_DISAGREE', 'STAT_SET', 'INTERVAL_HALF', 'INTERVAL_INVERTED', 'INTERVAL_NEGATIVE',
  'NO_AFFECTED_STATS', 'OVR_DISPLAY', 'OVR_BOOST_HALF', 'OVR_BOOST_ENVELOPE', 'CATEGORY_SUM', 'AVG_DISPLAY',
  'OFFSET_INCONSISTENT', 'ROLES_EMPTY', 'SEASON_UNRESOLVED', 'AGE_SEASON', 'TIER_REGRESS', 'SOURCE_UNKNOWN', 'SOURCE_TYPE',
  'TIER_CARD_UNKNOWN', 'TIER_CARD_PLAYER', 'TIER_CARD_SEASON', 'TIER_CARD_STATE', 'CLASS_CARD_CONFLICT', 'NO_READ']);
// PROVISIONAL codes hold an entity below VERIFIED: nothing is contradicted, but something is missing.
export const PROVISIONAL = new Set(['SINGLE_READ', 'TIER_UNOBSERVED', 'TIER_CARD_NOT_VERIFIED', 'TIER_UNREAD',
  'CLASS_UNREAD', 'CLASS_ROLE_CONFLICT', 'REWARD_UNREAD', 'CATEGORY_GAIN_MISSING']);
// Only these may be cleared by an ACKNOWLEDGE decision; a decision can never clear a HARD code.
export const ACKNOWLEDGEABLE = new Set(['CLASS_ROLE_CONFLICT', 'CATEGORY_GAIN_MISSING']);

// ── Tables ────────────────────────────────────────────────────────────────────────────────────────
export function loadSchema(file = SCHEMA_PATH) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export const TAB_NAMES = schema => Object.keys(schema.tabs);

function normCell(type, raw, schema) {
  if (raw === null || raw === undefined) return { v: '' };
  let s = typeof raw === 'boolean' ? (raw ? 'TRUE' : 'FALSE') : String(raw).trim();
  if (s === '') return { v: '' };
  if (type === 'int') { const n = Number(s); return Number.isInteger(n) ? { v: String(n) } : { err: 'CELL_TYPE' }; }
  if (type === 'num') { const n = Number(s); return Number.isFinite(n) ? { v: String(n) } : { err: 'CELL_TYPE' }; }
  if (type.startsWith('enum:')) {
    const allowed = schema.enums[type.slice(5)];
    if (type === 'enum:rewardBadge') s = s.toUpperCase();
    return allowed.includes(s) ? { v: s } : { err: 'CELL_ENUM' };
  }
  return { v: s };
}

/** rawTables: { tabName: [[header...], [row...], ...] } (missing tab = absent). */
export function normaliseTables(rawTables, schema) {
  const errors = [], tables = {};
  const present = TAB_NAMES(schema).filter(t => rawTables[t]);
  if (present.length === 0) return { tables: null, errors, present };
  for (const tab of TAB_NAMES(schema)) {
    const spec = schema.tabs[tab], cols = spec.columns.map(c => c[0]);
    const values = rawTables[tab];
    if (!values) { errors.push({ code: 'TAB_MISSING', tab }); tables[tab] = []; continue; }
    const header = (values[0] ?? []).map(h => String(h).trim());
    while (header.length && header[header.length - 1] === '') header.pop();
    if (JSON.stringify(header) !== JSON.stringify(cols)) { errors.push({ code: 'HEADER_MISMATCH', tab, expected: cols, actual: header }); tables[tab] = []; continue; }
    const rows = [], seen = new Set();
    values.slice(1).forEach((r, i) => {
      if (!r || !r.some(v => v !== '' && v !== null && v !== undefined)) return;
      const o = {};
      spec.columns.forEach(([name, type, required], j) => {
        const { v, err } = normCell(type, r[j], schema);
        if (err) errors.push({ code: err, tab, row: i + 2, column: name, value: r[j] });
        o[name] = v ?? '';
        if (required && (v ?? '') === '' && !err) errors.push({ code: 'CELL_REQUIRED', tab, row: i + 2, column: name });
      });
      const k = spec.key.map(c => o[c]).join('\u0001');
      if (seen.has(k)) errors.push({ code: 'KEY_DUPLICATE', tab, row: i + 2, key: spec.key.map(c => o[c]) });
      seen.add(k); rows.push(o);
    });
    tables[tab] = rows;
  }
  return { tables, errors, present };
}

// ── Canonical snapshot (repo <-> Drive identity) ──────────────────────────────────────────────────
const csvCell = v => /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
export function canonicalCsv(rows, spec) {
  const cols = spec.columns.map(c => c[0]);
  const sorted = [...rows].sort((a, b) => {
    for (const k of spec.key) { const c = String(a[k]).localeCompare(String(b[k]), 'en'); if (c) return c; }
    return 0;
  });
  return [cols, ...sorted.map(r => cols.map(c => r[c] ?? ''))].map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export function buildSnapshot(tables, schema, meta = {}) {
  const files = {}, tabs = {};
  for (const tab of TAB_NAMES(schema)) {
    const csv = canonicalCsv(tables[tab] ?? [], schema.tabs[tab]);
    files[`${tab}.csv`] = csv;
    tabs[tab] = { rows: (tables[tab] ?? []).length, sha256: sha(csv) };
  }
  const combinedSha256 = sha(TAB_NAMES(schema).map(t => `${t}:${tabs[t].sha256}`).join('\n'));
  return { files, manifest: { schemaVersion: 'resource-coach-archive-snapshot-v1', ...meta, tabs, combinedSha256 } };
}
export function readSnapshotDir(dir, schema) {
  const raw = {};
  for (const tab of TAB_NAMES(schema)) { const f = path.join(dir, `${tab}.csv`); if (fs.existsSync(f)) raw[tab] = parseCsv(fs.readFileSync(f, 'utf8')); }
  const mf = path.join(dir, 'manifest.json');
  return { raw, manifest: fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : null };
}
/** Row-level difference between the Drive-derived snapshot and the committed one. */
export function compareSnapshots(drive, repo, driveTables, repoTables, schema) {
  if (!repo) return { status: 'NO_REPO_SNAPSHOT', identical: false, tabs: {} };
  const tabs = {};
  for (const tab of TAB_NAMES(schema)) {
    if (drive.tabs[tab]?.sha256 === repo.tabs?.[tab]?.sha256) continue;
    const key = r => schema.tabs[tab].key.map(k => r[k]).join('|');
    const a = new Map((driveTables?.[tab] ?? []).map(r => [key(r), JSON.stringify(r)]));
    const b = new Map((repoTables?.[tab] ?? []).map(r => [key(r), JSON.stringify(r)]));
    tabs[tab] = {
      onlyInDrive: [...a.keys()].filter(k => !b.has(k)),
      onlyInRepo: [...b.keys()].filter(k => !a.has(k)),
      changed: [...a.keys()].filter(k => b.has(k) && a.get(k) !== b.get(k)),
    };
  }
  const identical = drive.combinedSha256 === repo.combinedSha256;
  return { status: identical ? 'IDENTICAL' : 'DRIFT', identical, sealed: !!repo.sealed, tabs };
}

// ── Reads ─────────────────────────────────────────────────────────────────────────────────────────
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = stable(v[k]); return o; }
  return v;
}
/** One document per (entity, read): header fields plus child rows. A==B → double read; U wins. */
export function reconcileReads(headers, idField, children) {
  const byId = new Map();
  for (const h of headers) {
    const id = h[idField];
    if (!byId.has(id)) byId.set(id, {});
    const { read_id, notes, ...fields } = h;
    const doc = { fields, children: {} };
    for (const [tab, rows, keyField] of children) {
      doc.children[tab] = Object.fromEntries(rows.filter(r => r[idField] === id && r.read_id === read_id)
        .map(({ read_id: _r, [idField]: _i, ...rest }) => [normStat(rest[keyField]), rest]));
    }
    byId.get(id)[read_id] = doc;
  }
  const out = new Map();
  for (const [id, reads] of byId) {
    let state, canonical = reads.U ?? reads.A ?? reads.B ?? null, diffs = [];
    if (reads.U) state = 'adjudicated';
    else if (reads.A && reads.B) {
      const same = JSON.stringify(stable(reads.A)) === JSON.stringify(stable(reads.B));
      state = same ? 'double' : 'disagree';
      if (!same) diffs = diffDocs(reads.A, reads.B);
    } else state = canonical ? 'single' : 'none';
    out.set(id, { reads, canonical, state, diffs });
  }
  return out;
}
function diffDocs(a, b) {
  const d = [];
  for (const k of new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])) if (a.fields[k] !== b.fields[k]) d.push({ field: k, A: a.fields[k], B: b.fields[k] });
  for (const tab of Object.keys(a.children)) {
    const ka = a.children[tab], kb = b.children[tab] ?? {};
    for (const k of new Set([...Object.keys(ka), ...Object.keys(kb)])) {
      if (JSON.stringify(stable(ka[k] ?? null)) !== JSON.stringify(stable(kb[k] ?? null))) d.push({ tab, row: k, A: ka[k] ?? null, B: kb[k] ?? null });
    }
  }
  return d;
}

// ── Validation ────────────────────────────────────────────────────────────────────────────────────
const int = v => (v === '' || v === undefined ? null : Number(v));
const statSetOk = stats => {
  const s = [...stats].sort().join('|');
  return s === [...OUTFIELD].sort().join('|') || s === [...GK_ALL].sort().join('|');
};

/**
 * @param tables normalised tables (normaliseTables().tables)
 * @param opts.driveFiles optional Drive listing [{id,name,md5Checksum}] of the archive folder
 */
export function validateArchive(tables, { schema, roleMap, driveFiles = null } = {}) {
  const errors = [];
  const sources = new Map(tables.Archive_Sources.map(s => [s.source_id, { ...s, codes: [], flags: [] }]));

  // Sources: identity, capture time, duplicates.
  const listing = driveFiles ? new Map(driveFiles.map(f => [f.id, f])) : null;
  if (listing) {
    const rowByFile = new Map(); for (const s of sources.values()) rowByFile.set(s.drive_file_id, s);
    for (const f of driveFiles) if (!rowByFile.has(f.id)) errors.push({ code: 'SOURCE_ROW_MISSING', drive_file_id: f.id, drive_name: f.name });
    for (const s of sources.values()) if (!listing.has(s.drive_file_id)) errors.push({ code: 'SOURCE_FILE_MISSING', source_id: s.source_id, drive_file_id: s.drive_file_id });
    if (driveFiles.length === 0 && sources.size > 0) errors.push({ code: 'ARCHIVE_FOLDER_NOT_VISIBLE' });
  }
  for (const s of sources.values()) {
    const md5 = listing?.get(s.drive_file_id)?.md5Checksum ?? s.drive_md5;
    s.md5 = md5 || null;
    if (listing && s.drive_md5 && md5 && s.drive_md5 !== md5) errors.push({ code: 'MD5_MISMATCH', source_id: s.source_id });
    const fromName = captureFromName(s.drive_name);
    if (fromName && s.capture_local !== fromName) errors.push({ code: 'CAPTURE_MISMATCH', source_id: s.source_id, typed: s.capture_local, fromName });
    if (!fromName && s.capture_basis === 'filename') errors.push({ code: 'CAPTURE_BASIS', source_id: s.source_id });
    if (s.duplicate_of_source_id && !sources.has(s.duplicate_of_source_id)) errors.push({ code: 'DUPLICATE_TARGET_UNKNOWN', source_id: s.source_id });
    const sc = seasonCandidates(s.capture_local);
    s.season = sc.season; s.seasonCandidates = sc.candidates; s.seasonBoundary = sc.boundary;
    if (!sc.season) errors.push({ code: 'CAPTURE_OUT_OF_CALENDAR', source_id: s.source_id });
    else if (!ARCHIVE_WINDOW.includes(sc.season)) s.flags.push('OUT_OF_ARCHIVE_WINDOW');
  }
  const byMd5 = new Map();
  for (const s of sources.values()) if (s.md5) { if (!byMd5.has(s.md5)) byMd5.set(s.md5, []); byMd5.get(s.md5).push(s); }
  for (const group of byMd5.values()) {
    if (group.length < 2) continue;
    const kept = group.filter(s => !s.duplicate_of_source_id);
    if (kept.length !== 1 || group.some(s => s.duplicate_of_source_id && s.duplicate_of_source_id !== kept[0].source_id)) {
      errors.push({ code: 'DUPLICATE_UNDECLARED', source_ids: group.map(s => s.source_id) });
    }
  }
  for (const s of sources.values()) {
    if (!s.duplicate_of_source_id) continue;
    const t = sources.get(s.duplicate_of_source_id);
    if (t && s.md5 && t.md5 && s.md5 !== t.md5) errors.push({ code: 'DUPLICATE_NOT_IDENTICAL', source_id: s.source_id });
  }

  // Reads.
  const cardReads = reconcileReads(tables.Archive_Cards, 'card_id', [['stats', tables.Archive_Card_Stats, 'stat']]);
  const pvReads = reconcileReads(tables.Archive_Previews, 'preview_id',
    [['stats', tables.Archive_Preview_Stats, 'stat'], ['categories', tables.Archive_Preview_Categories, 'category']]);
  for (const [tab, idf, reads] of [['Archive_Card_Stats', 'card_id', cardReads], ['Archive_Preview_Stats', 'preview_id', pvReads], ['Archive_Preview_Categories', 'preview_id', pvReads]]) {
    for (const r of tables[tab]) if (!reads.get(r[idf])?.reads[r.read_id]) errors.push({ code: 'ORPHAN_ROW', tab, id: r[idf], read_id: r.read_id });
  }
  const readCodes = (e, rec) => {
    if (rec.state === 'disagree') { e.codes.push('READ_DISAGREE'); e.readDiffs = rec.diffs; }
    else if (rec.state === 'single') e.codes.push('SINGLE_READ');
    else if (rec.state === 'adjudicated') e.flags.push('ADJUDICATED');
    else if (rec.state === 'none') e.codes.push('NO_READ');
    e.readState = rec.state;
  };
  const sourceOf = (e, wantType) => {
    const s = sources.get(e.source_id);
    if (!s) { e.codes.push('SOURCE_UNKNOWN'); return null; }
    if (s.screen_type !== wantType) e.codes.push('SOURCE_TYPE');
    if (s.duplicate_of_source_id) e.duplicateSource = true;
    e.capture_local = s.capture_local; e.seasonCandidates = s.seasonCandidates; e.seasonBoundary = s.seasonBoundary;
    return s;
  };
  const classChecks = (e, stats, roles) => {
    const white = whiteSet(roles, roleMap);
    e.roleConflicts = [];
    for (const [stat, r] of Object.entries(stats)) {
      if (r.display_class === 'WHITE' && !white.has(stat)) e.roleConflicts.push({ stat, read: 'WHITE', roleMap: 'grey' });
      if ((r.display_class === 'MID_GREY' || r.display_class === 'DARK_GREY') && white.has(stat)) e.roleConflicts.push({ stat, read: r.display_class, roleMap: 'WHITE' });
    }
    if (e.roleConflicts.length) e.codes.push('CLASS_ROLE_CONFLICT');
  };

  // Cards.
  const cards = [];
  for (const [card_id, rec] of cardReads) {
    const e = { card_id, codes: [], flags: [] };
    readCodes(e, rec);
    const c = rec.canonical; if (!c) { cards.push(e); continue; }
    Object.assign(e, { source_id: c.fields.source_id, player: c.fields.player_name, playerKey: normName(c.fields.player_name), age: int(c.fields.age) });
    sourceOf(e, 'player-card');
    const stats = c.children.stats;
    if (!statSetOk(Object.keys(stats))) e.codes.push('STAT_SET');
    const S = Object.values(stats).reduce((a, r) => a + Number(r.value), 0), ovr = Number(c.fields.ovr_displayed);
    if (!(S > 15 * ovr - 15 && S < 15 * ovr + 15)) e.codes.push('OVR_DISPLAY');
    e.tierIndex = TIER_INDEX[c.fields.tier_label] ?? null;
    if (e.tierIndex === null) e.codes.push('TIER_UNREAD');
    e.rolesEstablished = roleList(c.fields.roles_established);
    if (!e.rolesEstablished.length) e.codes.push('ROLES_EMPTY');
    classChecks(e, stats, e.rolesEstablished);
    if (Object.values(stats).some(r => r.display_class === 'UNREAD')) e.codes.push('CLASS_UNREAD');
    e.stats = Object.fromEntries(Object.entries(stats).map(([k, r]) => [k, { value: Number(r.value), display_class: r.display_class }]));
    cards.push(e);
  }
  const cardById = new Map(cards.map(c => [c.card_id, c]));

  // Previews (structural checks; pairing after seasons are resolved).
  const previews = [];
  for (const [preview_id, rec] of pvReads) {
    const e = { preview_id, codes: [], flags: [] };
    readCodes(e, rec);
    const c = rec.canonical; if (!c) { previews.push(e); continue; }
    const f = c.fields;
    Object.assign(e, { source_id: f.source_id, player: f.player_name, playerKey: normName(f.player_name), age: int(f.age),
      coach: `${f.coach_type} ${f.coach_category}`, multiplier: int(f.multiplier), programmeLabel: f.programme_label || null,
      rewardBadge: f.reward_badge, tierCardId: f.tier_card_id || null });
    sourceOf(e, 'coach-preview');
    const stats = c.children.stats, cats = c.children.categories;
    if (!statSetOk(Object.keys(stats))) e.codes.push('STAT_SET');
    let sumLo = 0, sumHi = 0, p = 0, S = 0; const catLo = {}, catHi = {}, catStart = {};
    for (const [stat, r] of Object.entries(stats)) {
      const v = Number(r.start_value), lo = int(r.gain_lo), hi = int(r.gain_hi), cat = CATEGORY_OF[stat];
      S += v; (catStart[cat] ??= []).push(v);
      if ((lo === null) !== (hi === null)) { e.codes.push('INTERVAL_HALF'); continue; }
      if (lo === null) continue;
      if (lo < 0 || hi < 0) e.codes.push('INTERVAL_NEGATIVE');
      if (lo > hi) e.codes.push('INTERVAL_INVERTED');
      if (lo === hi) e.flags.push('DEGENERATE_INTERVAL');
      p++; sumLo += lo; sumHi += hi; catLo[cat] = (catLo[cat] ?? 0) + lo; catHi[cat] = (catHi[cat] ?? 0) + hi;
    }
    e.p = p; e.sumLo = sumLo; e.sumHi = sumHi;
    if (p === 0) e.codes.push('NO_AFFECTED_STATS');
    const ovr = Number(f.ovr_displayed);
    const fractional = !Number.isInteger(ovr);
    // The OVR box shows the internal sum /15 to one decimal; displayed stats truncate a fractional part below 1 each.
    if (fractional ? !(ovr >= S / 15 - 0.05 && ovr < (S + 15) / 15 + 0.05) : !(S > 15 * ovr - 15 && S < 15 * ovr + 15)) e.codes.push('OVR_DISPLAY');
    const bl = int(f.ovr_boost_lo), bh = int(f.ovr_boost_hi);
    if ((bl === null) !== (bh === null)) e.codes.push('OVR_BOOST_HALF');
    else if (bl !== null) {
      e.ovrBoost = [bl, bh];
      if (!(Math.floor(sumLo / 15) <= bl && bl <= bh && bh <= Math.ceil(sumHi / 15))) e.codes.push('OVR_BOOST_ENVELOPE');
    }
    // Category rows: displayed category gain is round(sum of affected endpoints in the column / 5).
    const offsets = [];
    for (const cat of Object.keys(catLo)) if (!cats[cat] || cats[cat].gain_lo === '') e.codes.push('CATEGORY_GAIN_MISSING');
    for (const [cat, r] of Object.entries(cats)) {
      if (r.gain_lo !== '' || r.gain_hi !== '') {
        if (Number(r.gain_lo) !== Math.round((catLo[cat] ?? 0) / 5) || Number(r.gain_hi) !== Math.round((catHi[cat] ?? 0) / 5)) e.codes.push('CATEGORY_SUM');
      }
      const starts = catStart[cat];
      if (starts?.length === 5 && r.quality !== '') {
        const mean = starts.reduce((a, b) => a + b, 0) / 5;
        if (r.avg_displayed !== '' && Math.abs(Number(r.avg_displayed) - mean) > 1) e.codes.push('AVG_DISPLAY');
        offsets.push(Number(r.quality) - mean / 4);
      }
    }
    if (offsets.length) {
      if (Math.max(...offsets) - Math.min(...offsets) > 0.3) e.codes.push('OFFSET_INCONSISTENT');
      const offset = [...offsets].sort((a, b) => a - b)[Math.floor(offsets.length / 2)];
      e.qualityOffset = Math.round(offset * 100) / 100;
      e.clubLevelHypothesis = Math.round(offset / 5) + 1;
      e.clubLevelResidual = Math.round((offset - 5 * (e.clubLevelHypothesis - 1)) * 100) / 100;
    }
    e.transferClass = f.reward_badge === 'TRUE' ? 'reward' : f.reward_badge === 'FALSE' ? 'ordinary' : 'unresolved';
    if (f.reward_badge === 'UNREAD') e.codes.push('REWARD_UNREAD');
    e.rolesEstablished = roleList(f.roles_established);
    if (!e.rolesEstablished.length) e.codes.push('ROLES_EMPTY');
    classChecks(e, stats, e.rolesEstablished);
    e.stats = Object.fromEntries(Object.entries(stats).map(([k, r]) => [k, { start: Number(r.start_value), lo: int(r.gain_lo), hi: int(r.gain_hi), display_class: r.display_class }]));
    e.duplicateKey = JSON.stringify(stable({ p: e.playerKey, c: e.coach, n: e.multiplier, s: e.stats, b: e.ovrBoost ?? null }));
    previews.push(e);
  }

  // Seasons: birth season = season index - age is constant per player. Boundary-day screens resolve
  // through it; a boundary screen of a player seen nowhere else stays unresolved.
  const all = [...cards, ...previews].filter(e => e.seasonCandidates && e.age !== null && e.age !== undefined);
  const births = new Map();
  for (const e of all) if (!e.seasonBoundary && e.seasonCandidates.length === 1) {
    if (!births.has(e.playerKey)) births.set(e.playerKey, new Set());
    births.get(e.playerKey).add(e.seasonCandidates[0] - e.age);
  }
  for (const e of all) {
    const b = births.get(e.playerKey);
    if (b && b.size > 1) { e.codes.push('AGE_SEASON'); e.birthSeasons = [...b].map(seasonName); }
    if (!e.seasonBoundary) { e.season = seasonName(e.seasonCandidates[0]); continue; }
    const fit = b && b.size === 1 ? e.seasonCandidates.filter(i => i - e.age === [...b][0]) : [];
    if (fit.length === 1) { e.season = seasonName(fit[0]); e.flags.push('SEASON_BY_AGE'); }
    else { e.season = null; e.codes.push('SEASON_UNRESOLVED'); }
  }

  // Tier never decreases for a player over time.
  const byPlayer = new Map();
  for (const c of cards) if (c.tierIndex !== null && c.tierIndex !== undefined && c.capture_local) { if (!byPlayer.has(c.playerKey)) byPlayer.set(c.playerKey, []); byPlayer.get(c.playerKey).push(c); }
  for (const list of byPlayer.values()) {
    list.sort((a, b) => a.capture_local.localeCompare(b.capture_local));
    for (let i = 1; i < list.length; i++) if (list[i].tierIndex < Math.max(...list.slice(0, i).map(x => x.tierIndex))) list[i].codes.push('TIER_REGRESS');
  }

  // Decisions, grades.
  const decisions = new Map();
  for (const d of tables.Archive_Decisions) { if (!decisions.has(d.entity_id)) decisions.set(d.entity_id, []); decisions.get(d.entity_id).push(d); }
  const knownIds = new Set([...sources.keys(), ...cardById.keys(), ...previews.map(p => p.preview_id)]);
  for (const id of decisions.keys()) if (!knownIds.has(id)) errors.push({ code: 'DECISION_UNKNOWN_ENTITY', entity_id: id });
  const grade = e => {
    const ds = [...(decisions.get(e.card_id ?? e.preview_id) ?? []), ...(decisions.get(e.source_id) ?? [])];
    const ack = new Set(ds.filter(d => d.decision === 'ACKNOWLEDGE').flatMap(d => d.codes.split(/\s+/)).filter(c => ACKNOWLEDGEABLE.has(c)));
    e.codes = [...new Set(e.codes)].filter(c => !ack.has(c)); e.flags = [...new Set(e.flags)];
    if (ack.size) e.acknowledged = [...ack];
    if (e.duplicateSource) return 'DUPLICATE';
    if (ds.some(d => d.decision === 'REJECT')) return 'REJECTED';
    if (ds.some(d => d.decision === 'QUARANTINE') || e.codes.some(c => HARD.has(c))) return 'QUARANTINED';
    if (e.codes.some(c => PROVISIONAL.has(c))) return 'PROVISIONAL';
    return 'VERIFIED';
  };
  for (const c of cards) c.grade = grade(c);

  // Pairing: the tier comes only from a card showing the identical state in the same season.
  for (const e of previews) {
    if (!e.stats) { e.grade = grade(e); continue; }
    const candidates = cards.filter(c => c.playerKey === e.playerKey && c.stats && Object.keys(e.stats).every(k => c.stats[k]?.value === e.stats[k].start)).map(c => c.card_id);
    e.tierCardCandidates = candidates;
    if (!e.tierCardId) e.codes.push('TIER_UNOBSERVED');
    else {
      const c = cardById.get(e.tierCardId);
      if (!c || !c.stats) e.codes.push('TIER_CARD_UNKNOWN');
      else {
        if (c.playerKey !== e.playerKey) e.codes.push('TIER_CARD_PLAYER');
        if (!c.season || !e.season || c.season !== e.season || c.age !== e.age) e.codes.push('TIER_CARD_SEASON');
        if (!Object.keys(e.stats).every(k => c.stats[k]?.value === e.stats[k].start)) e.codes.push('TIER_CARD_STATE');
        for (const [k, s] of Object.entries(e.stats)) {
          const cc = c.stats[k]?.display_class;
          if (cc && cc !== 'UNREAD' && s.display_class !== 'UNREAD' && cc !== s.display_class) { e.codes.push('CLASS_CARD_CONFLICT'); break; }
        }
        if (c.grade !== 'VERIFIED') e.codes.push('TIER_CARD_NOT_VERIFIED');
        e.tier = c.tierIndex === null || c.tierIndex === undefined ? null : `T${c.tierIndex}`;
        e.tierCard = c;
      }
    }
    const classOf = k => {
      const cc = e.tierCard?.stats[k]?.display_class;
      return cc && cc !== 'UNREAD' ? cc : e.stats[k].display_class;
    };
    if (Object.entries(e.stats).some(([k, s]) => s.lo !== null && classOf(k) === 'UNREAD')) e.codes.push('CLASS_UNREAD');
    e.modelClass = Object.fromEntries(Object.keys(e.stats).map(k => [k, classOf(k)]));
    e.grade = grade(e);
  }
  // Exact duplicate evidence: the same preview captured twice keeps the earliest capture only.
  const firstByKey = new Map();
  for (const e of [...previews].filter(x => x.duplicateKey).sort((a, b) => String(a.capture_local).localeCompare(String(b.capture_local)))) {
    if (firstByKey.has(e.duplicateKey)) { e.flags.push('DUPLICATE_EVIDENCE'); e.duplicateOf = firstByKey.get(e.duplicateKey); }
    else firstByKey.set(e.duplicateKey, e.preview_id);
  }

  // Club state rows: the same quality law, and a direct test wherever the level itself is on screen.
  const clubRows = [];
  for (const r of tables.Archive_Club_State) {
    if (r.team_ovr === '' || r.team_quality === '') continue;
    const offset = Number(r.team_quality) - Number(r.team_ovr) / 4;
    const hyp = Math.round(offset / 5) + 1;
    clubRows.push({ source_id: r.source_id, read_id: r.read_id, view: r.view, club: r.club_name, capture_local: sources.get(r.source_id)?.capture_local ?? null,
      qualityOffset: Math.round(offset * 100) / 100, clubLevelHypothesis: hyp,
      clubLevelDisplayed: r.club_level_displayed === '' ? null : Number(r.club_level_displayed),
      lawTest: r.club_level_displayed === '' ? 'untested' : Number(r.club_level_displayed) === hyp ? 'agree' : 'disagree' });
  }
  const timeline = [
    ...previews.filter(p => p.qualityOffset !== undefined && p.grade !== 'DUPLICATE').map(p => ({ capture_local: p.capture_local, entity: p.preview_id, view: 'own', qualityOffset: p.qualityOffset, clubLevelHypothesis: p.clubLevelHypothesis, residual: p.clubLevelResidual })),
    ...clubRows.filter(r => r.view === 'own').map(r => ({ capture_local: r.capture_local, entity: r.source_id, view: 'own', qualityOffset: r.qualityOffset, clubLevelHypothesis: r.clubLevelHypothesis, clubLevelDisplayed: r.clubLevelDisplayed })),
  ].sort((a, b) => String(a.capture_local).localeCompare(String(b.capture_local)));
  for (let i = 1; i < timeline.length; i++) if (timeline[i].clubLevelHypothesis < timeline[i - 1].clubLevelHypothesis) timeline[i].nonMonotone = true;

  const evidenceCandidates = previews.filter(p => p.grade === 'VERIFIED' && p.transferClass === 'ordinary' && !p.flags.includes('DUPLICATE_EVIDENCE')).map(p => ({
    preview_id: p.preview_id, source_id: p.source_id, capture_local: p.capture_local, season: p.season,
    partition: `archive-${String(p.season).toLowerCase()}`, player: p.player, age: p.age, tier: p.tier, tierCardId: p.tierCardId,
    rolesEstablished: p.rolesEstablished, coach: p.coach, multiplier: p.multiplier, programmeLabel: p.programmeLabel, p: p.p,
    ovrBoost: p.ovrBoost ?? null, qualityOffset: p.qualityOffset ?? null, clubLevelHypothesis: p.clubLevelHypothesis ?? null,
    stats: Object.entries(p.stats).map(([stat, s]) => ({ stat, start: s.start, displayClass: p.modelClass[stat], gainLo: s.lo, gainHi: s.hi })),
  }));

  const count = (list, key) => list.reduce((o, e) => (o[e[key]] = (o[e[key]] ?? 0) + 1, o), {});
  const strip = e => { const { tierCard, duplicateKey, seasonCandidates, playerKey, ...rest } = e; return rest; };
  return {
    summary: {
      status: errors.length ? 'INVALID' : 'VALID', errors,
      sources: sources.size, cards: count(cards, 'grade'), previews: count(previews, 'grade'),
      previewTransferClass: count(previews, 'transferClass'), evidenceCandidates: evidenceCandidates.length,
      clubLevelLawTests: count(clubRows, 'lawTest'),
    },
    sources: [...sources.values()].map(({ seasonCandidates, ...s }) => s),
    cards: cards.map(strip), previews: previews.map(strip), clubState: clubRows, clubTimeline: timeline, evidenceCandidates,
  };
}

// ── Orchestration ─────────────────────────────────────────────────────────────────────────────────
/** Validate raw tabs, build the Drive-derived snapshot and compare it with the committed one. */
export function runArchive({ rawTables, schema = loadSchema(), roleMap = loadRoleMap(), driveFiles = null, snapshotDir = DEFAULT_SNAPSHOT_DIR, meta = {} }) {
  const norm = normaliseTables(rawTables, schema);
  if (!norm.tables) return { summary: { status: 'ABSENT', note: 'No Archive_* tabs in the source yet.' } };
  const snapshot = buildSnapshot(norm.tables, schema, meta);
  if (norm.errors.length) return { summary: { status: 'INVALID', errors: norm.errors, stage: 'table-normalisation' }, snapshot };
  const report = validateArchive(norm.tables, { schema, roleMap, driveFiles });
  let repo = null, repoTables = null;
  if (snapshotDir && fs.existsSync(snapshotDir)) {
    const r = readSnapshotDir(snapshotDir, schema);
    repo = r.manifest; repoTables = normaliseTables(r.raw, schema).tables;
  }
  report.identity = compareSnapshots(snapshot.manifest, repo, norm.tables, repoTables, schema);
  report.snapshot = snapshot;
  return report;
}

export function writeOutputs(outDir, result) {
  fs.mkdirSync(outDir, { recursive: true });
  const { snapshot, ...report } = result;
  fs.writeFileSync(path.join(outDir, 'archive-validation.json'), JSON.stringify(report, null, 1) + '\n');
  if (report.evidenceCandidates) fs.writeFileSync(path.join(outDir, 'archive-evidence-candidates.json'), JSON.stringify(report.evidenceCandidates, null, 1) + '\n');
  if (snapshot) writeSnapshot(path.join(outDir, 'snapshot'), snapshot);
}
export function writeSnapshot(dir, snapshot, { sealed = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, csv] of Object.entries(snapshot.files)) fs.writeFileSync(path.join(dir, f), csv);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...snapshot.manifest, sealed }, null, 1) + '\n');
}

/** A committed snapshot must be self-consistent: its CSVs hash to its manifest and pass validation. */
export function checkSnapshot(dir, schema = loadSchema(), roleMap = loadRoleMap()) {
  if (!fs.existsSync(dir)) return { status: 'NO_SNAPSHOT' };
  const { raw, manifest } = readSnapshotDir(dir, schema);
  if (!manifest) return { status: 'INVALID', errors: [{ code: 'MANIFEST_MISSING' }] };
  const errors = [];
  for (const tab of TAB_NAMES(schema)) {
    const f = path.join(dir, `${tab}.csv`);
    if (!fs.existsSync(f)) { errors.push({ code: 'SNAPSHOT_TAB_MISSING', tab }); continue; }
    if (sha(fs.readFileSync(f, 'utf8')) !== manifest.tabs?.[tab]?.sha256) errors.push({ code: 'SNAPSHOT_HASH_MISMATCH', tab });
  }
  const norm = normaliseTables(raw, schema);
  errors.push(...norm.errors);
  if (!errors.length) {
    const rebuilt = buildSnapshot(norm.tables, schema);
    if (rebuilt.manifest.combinedSha256 !== manifest.combinedSha256) errors.push({ code: 'SNAPSHOT_NOT_CANONICAL' });
    const rep = validateArchive(norm.tables, { schema, roleMap });
    errors.push(...rep.summary.errors);
    return { status: errors.length ? 'INVALID' : 'VALID', errors, sealed: !!manifest.sealed, summary: rep.summary };
  }
  return { status: 'INVALID', errors };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); o[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
  return o;
}
async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a['check-snapshot']) {
    const r = checkSnapshot(path.resolve(a['check-snapshot']));
    console.log(JSON.stringify(r, null, 1));
    process.exit(r.status === 'INVALID' ? 1 : 0);
  }
  const schema = loadSchema();
  let rawTables = {};
  if (a.xlsx) {
    const { readWorkbookTables, parseWorkbookSheets } = await import('./collect-resource-coach-sheet.mjs');
    rawTables = readArchiveTabsFromXlsx(path.resolve(a.xlsx), schema, { readWorkbookTables, parseWorkbookSheets });
  } else if (a['csv-dir']) rawTables = readSnapshotDir(path.resolve(a['csv-dir']), schema).raw;
  else throw new Error('Provide --xlsx, --csv-dir or --check-snapshot.');
  const driveFiles = a['drive-inventory'] ? JSON.parse(fs.readFileSync(path.resolve(a['drive-inventory']), 'utf8')) : null;
  const snapshotDir = a['snapshot-dir'] ? path.resolve(a['snapshot-dir']) : DEFAULT_SNAPSHOT_DIR;
  const result = runArchive({ rawTables, schema, driveFiles, snapshotDir, meta: { source: a.xlsx ? 'xlsx' : 'csv' } });
  if (a['out-dir']) writeOutputs(path.resolve(a['out-dir']), result);
  if (a['write-snapshot']) {
    if (result.summary.status !== 'VALID') throw new Error('Refusing to write a snapshot from an invalid archive.');
    writeSnapshot(snapshotDir, result.snapshot);
  }
  const { snapshot, sources, cards, previews, clubState, clubTimeline, evidenceCandidates, ...brief } = result;
  console.log(JSON.stringify(brief, null, 1));
  if (result.summary.status === 'INVALID' || (result.identity?.sealed && !result.identity.identical)) process.exit(1);
}

/** Only the Archive_* sheets that exist are read; absent tabs are reported, not fatal. */
export function readArchiveTabsFromXlsx(xlsxPath, schema, { readWorkbookTables, parseWorkbookSheets }) {
  const wb = execFileSync('unzip', ['-p', xlsxPath, 'xl/workbook.xml'], { encoding: 'utf8' });
  const rels = execFileSync('unzip', ['-p', xlsxPath, 'xl/_rels/workbook.xml.rels'], { encoding: 'utf8' });
  const present = [...parseWorkbookSheets(wb, rels).keys()].filter(n => TAB_NAMES(schema).includes(n));
  const tables = present.length ? readWorkbookTables(xlsxPath, present) : new Map();
  return Object.fromEntries([...tables.entries()]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e?.stack || e); process.exit(1); });
}
