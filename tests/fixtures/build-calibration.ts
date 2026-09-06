/**
 * Rebuilds src/logic/glyphCalibration.json from the labelled reference cards.
 *
 *   npm run calibrate
 *
 * Every measurement here is taken with the glyph reader's OWN sampling functions,
 * so the corpus can never drift from the code that consumes it. To widen a class,
 * add a card to tests/fixtures (PNG + ML Kit JSON), label it in LABELS below, and
 * re-run. Class boundaries are not stored — glyphReader.deriveCalibration() computes
 * them from this corpus at load time.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  sampleChip, badgeRegions, measureBadge, sampleMedianHsv, extractIconSamples,
  boostInkRatio, iconDistance, rgbToHsv, RgbaImage, GlyphToken, GlyphBox, IconFeature,
} from '../../src/logic/glyphReader';
import { findNameBlock, OcrResult, OcrElement } from '../../src/logic/playerCardParse';
import { decodePng } from '../helpers/png';

const HERE = __dirname;
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'src', 'logic', 'glyphCalibration.json');
/**
 * Real captures live OUTSIDE version control — the repo carries no source-game
 * imagery (see CLAUDE.md). Drop labelled screenshots in calibration-captures/
 * as card-<name>.png and re-run. Only the derived numbers below are committed.
 */
const CAPTURES = join(ROOT, 'calibration-captures');

/**
 * Ground truth for the reference cards (spec §7 plus the chip/badge/boost states
 * read off the same screenshots). `chips` maps a role token to its STATE, never to
 * a colour: established is whatever a present, non-dark chip looks like.
 */
const LABELS: Record<string, {
  chips: Record<string, 'established' | 'dark'>;
  badge: 'attacking' | 'possession' | 'defensive' | 'none';
  boosts: Record<string, 'active' | 'inactive'>;
}> = {
  lurinsky:  { chips: { MC: 'established' }, badge: 'none', boosts: {} },
  moore:     { chips: { DC: 'established', DMC: 'established', MC: 'dark' }, badge: 'defensive', boosts: { BRAVERY: 'inactive' } },
  blakie:    { chips: { AML: 'established', AMC: 'established', MC: 'established' }, badge: 'attacking', boosts: { DRIBBLING: 'inactive' } },
  finlayson: { chips: { AMC: 'established', MC: 'established', ML: 'dark' }, badge: 'attacking', boosts: { DRIBBLING: 'active' } },
  gilmartin: { chips: { MC: 'established' }, badge: 'possession', boosts: {} },
};

const GRID_SIZE = 8;
const CLUSTER_MAX = 0.05; // grouping distance for "these are the same icon"

function tokensOf(result: OcrResult): GlyphToken[] {
  return result.blocks
    .flatMap(b => b.lines)
    .flatMap(l => l.elements)
    .map((e: OcrElement) => (e.frame && e.text.trim()
      ? { text: e.text.trim(), frame: { left: e.frame.left, top: e.frame.top, width: e.frame.width, height: e.frame.height } }
      : null))
    .filter((t): t is GlyphToken => t !== null);
}

function load(card: string): { img: RgbaImage; ocr: OcrResult; tokens: GlyphToken[] } {
  const ocr = JSON.parse(readFileSync(join(HERE, `mlkit-${card}.json`), 'utf8')) as OcrResult;
  const png = join(CAPTURES, `card-${card}.png`);
  if (!existsSync(png)) {
    throw new Error(
      `missing capture: ${png}\n` +
      'Real screenshots are deliberately untracked. Put the labelled captures in ' +
      'calibration-captures/ before running `npm run calibrate`.'
    );
  }
  return { img: decodePng(png), ocr, tokens: tokensOf(ocr) };
}


// --- measurement helpers for the provenance block ------------------------------

function lumAt(img: RgbaImage, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
}
function lumaPercentiles(img: RgbaImage, box: GlyphBox): [number, number] {
  const ls: number[] = [];
  for (let y = Math.round(box.top); y < Math.round(box.top + box.height); y++) {
    for (let x = Math.round(box.left); x < Math.round(box.left + box.width); x++) ls.push(lumAt(img, x, y));
  }
  ls.sort((a, b) => a - b);
  return [ls[Math.floor(ls.length * 0.05)], ls[Math.floor(ls.length * 0.95)]];
}
/** Ink contrast (p95 - p05 luminance) of a text box. */
function contrastOf(img: RgbaImage, box: GlyphBox): number {
  const [lo, hi] = lumaPercentiles(img, box);
  return hi - lo;
}
/** The cell fill luminance behind a text box. */
function cellLumaOf(img: RgbaImage, box: GlyphBox): number {
  return lumaPercentiles(img, box)[1];
}
/** Median HSV of the badge ink itself (pixels that survive the header-hue filter). */
function sampleBadgeInk(img: RgbaImage, window: GlyphBox, header: { h: number; s: number; v: number }) {
  const ss: number[] = [], vs: number[] = [];
  let hue: number | undefined;
  const m = measureBadge(img, window, header);
  hue = m.hue;
  for (let y = Math.round(window.top); y < Math.round(window.top + window.height); y++) {
    for (let x = Math.round(window.left); x < Math.round(window.left + window.width); x++) {
      const i = (y * img.width + x) * 4;
      const c = rgbToHsv(img.data[i], img.data[i + 1], img.data[i + 2]);
      if (c.s <= 0.45 || c.v <= 0.35) continue;
      if (header.s >= 0.15 && Math.min(Math.abs(c.h - header.h) % 360, 360 - (Math.abs(c.h - header.h) % 360)) <= 55) continue;
      ss.push(c.s); vs.push(c.v);
    }
  }
  if (hue === undefined || ss.length === 0) return undefined;
  const mid = (xs: number[]) => { const t = [...xs].sort((a, b) => a - b); return t[t.length >> 1]; };
  return { hue: r2(hue), sat: r4(mid(ss)), val: r4(mid(vs)), coverage: r4(m.coverage) };
}
/** Median RGB of the ability strip's background tail. */
function stripBackgroundOf(img: RgbaImage, labelFrame: GlyphBox): [number, number, number] {
  const h = labelFrame.height;
  const sx1 = Math.round(labelFrame.left + labelFrame.width + 9.0 * h);
  const sy0 = Math.round(labelFrame.top - 0.6 * h);
  const sy1 = Math.round(labelFrame.top + labelFrame.height + 0.5 * h);
  const bgW = Math.max(4, Math.round(h * 1.8));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = sy0; y < sy1; y++) {
    for (let x = sx1 - bgW; x < sx1; x++) {
      const i = (y * img.width + x) * 4;
      rs.push(img.data[i]); gs.push(img.data[i + 1]); bs.push(img.data[i + 2]);
    }
  }
  const mid = (xs: number[]) => { const t = [...xs].sort((a, b) => a - b); return Math.round(t[t.length >> 1]); };
  return [mid(rs), mid(gs), mid(bs)];
}

const chipSamples: unknown[] = [];
const badgeSamples: unknown[] = [];
const boostSamples: unknown[] = [];
const rawIcons: Array<{ key: string; feature: IconFeature }> = [];
/**
 * Per-card measurements that let tests rebuild a SYNTHETIC canvas without the
 * screenshot: the colours and spans each reader actually sees. This is derived
 * evidence, not imagery.
 */
const cardProvenance: Record<string, unknown> = {};

for (const card of Object.keys(LABELS)) {
  const { img, ocr, tokens } = load(card);
  const label = LABELS[card];

  // --- chips
  for (const [role, cls] of Object.entries(label.chips)) {
    const tok = tokens.find(t => t.text.toUpperCase() === role);
    if (!tok) throw new Error(`${card}: no token for role ${role}`);
    const s = sampleChip(img, tok.frame);
    if (!s) throw new Error(`${card}: chip region for ${role} outside image`);
    chipSamples.push({
      card, chip: role, class: cls,
      fill: [r2(s.fill.h), r4(s.fill.s), r4(s.fill.v)],
      rowBackground: [r2(s.background.h), r4(s.background.s), r4(s.background.v)],
    });
  }

  // --- badge
  const nameBox = findNameBlock(ocr)?.frame;
  if (!nameBox) throw new Error(`${card}: no name block`);
  const { window, headerRef } = badgeRegions(nameBox as GlyphBox);
  const header = sampleMedianHsv(img, headerRef);
  if (!header) throw new Error(`${card}: header reference outside image`);
  const m = measureBadge(img, window, header);
  badgeSamples.push({
    card, class: label.badge, coverage: r4(m.coverage),
    ...(m.hue !== undefined ? { hue: r2(m.hue) } : {}),
    headerReference: [r2(header.h), r4(header.s), r4(header.v)],
  });
  const badgeSat = m.hue !== undefined ? sampleBadgeInk(img, window, header) : undefined;

  // --- boosts
  for (const [stat, cls] of Object.entries(label.boosts)) {
    const statTok = tokens.find(t => t.text.toUpperCase() === stat);
    if (!statTok) throw new Error(`${card}: no token for stat ${stat}`);
    const row = tokens
      .filter(t => t !== statTok && Math.abs(t.frame.top - statTok.frame.top) < 20 && t.frame.left > statTok.frame.left)
      .sort((a, b) => a.frame.left - b.frame.left);
    const bi = row.findIndex(t => /^\d{1,3}$/.test(t.text));
    const baseBox = row[bi]?.frame;
    const boostBox = row[bi + 1]?.frame;
    if (!baseBox || !boostBox) throw new Error(`${card}: no base/+N pair on ${stat}`);
    const ratio = boostInkRatio(img, baseBox, boostBox);
    if (ratio === null) throw new Error(`${card}: boost ink ratio unavailable for ${stat}`);
    boostSamples.push({
      card, stat, class: cls, ratio: r4(ratio),
      baseContrast: r2(contrastOf(img, baseBox)), cellLuma: r2(cellLumaOf(img, baseBox)),
    });
  }

  // --- ability icons
  const abilityTok = tokens.find(t => /^abilit(y|ies)\s*:?$/i.test(t.text));
  if (!abilityTok) throw new Error(`${card}: no ability label token`);
  const icons = extractIconSamples(img, abilityTok.frame);
  if (icons === null) throw new Error(`${card}: ability strip could not be observed`);
  icons.forEach((s, i) => rawIcons.push({ key: `${card}#${i}`, feature: s.feature }));

  cardProvenance[card] = {
    badgeInk: badgeSat,
    abilityIconSpans: icons.map(s => [s.x0, s.x1]),
    abilityStripBackground: stripBackgroundOf(img, abilityTok.frame),
  };
}

// Cluster identical icons across cards into templates.
const templates: Array<{ id: string; observedOn: string[]; feature: IconFeature }> = [];
for (const { key, feature } of rawIcons) {
  const hit = templates.find(t => iconDistance(feature, t.feature) <= CLUSTER_MAX);
  if (hit) hit.observedOn.push(key);
  else templates.push({ id: `SA${String(templates.length + 1).padStart(2, '0')}`, observedOn: [key], feature });
}
const featureOf = (key: string) => rawIcons.find(r => r.key === key)!.feature;
let maxIntra = 0;
for (const t of templates) {
  for (const a of t.observedOn) for (const b of t.observedOn) {
    maxIntra = Math.max(maxIntra, iconDistance(featureOf(a), featureOf(b)));
  }
}
let minInter = Infinity;
for (let i = 0; i < templates.length; i++) {
  for (let j = i + 1; j < templates.length; j++) {
    for (const a of templates[i].observedOn) for (const b of templates[j].observedOn) {
      minInter = Math.min(minInter, iconDistance(featureOf(a), featureOf(b)));
    }
  }
}

function r2(n: number) { return Math.round(n * 100) / 100; }
function r4(n: number) { return Math.round(n * 10000) / 10000; }
function q(xs: number[]) { return xs.map(r4); }

const count = (arr: unknown[], cls: string) =>
  (arr as Array<{ class: string }>).filter(s => s.class === cls).length;

const out = {
  _README:
    'Colour/shape calibration corpus for src/logic/glyphReader.ts. GENERATED — run `npm run calibrate` to rebuild. ' +
    'Every value is measured from the labelled reference cards in tests/fixtures using the reader\'s own sampling ' +
    'functions, so the corpus cannot drift from the matcher. Class BOUNDARIES are not stored here: ' +
    'glyphReader.deriveCalibration() computes them from this corpus at load time, so adding cards widens the ' +
    'regions automatically. Sample counts are small (see _sampleCounts) — the ambiguity bands, not the class ' +
    'centres, are what make this safe.',
  _gridSize: GRID_SIZE,
  _sampleCounts: {
    chipEstablished: count(chipSamples, 'established'),
    chipDark: count(chipSamples, 'dark'),
    badgeAttacking: count(badgeSamples, 'attacking'),
    badgePossession: count(badgeSamples, 'possession'),
    badgeDefensive: count(badgeSamples, 'defensive'),
    badgeNone: count(badgeSamples, 'none'),
    boostActive: count(boostSamples, 'active'),
    boostInactive: count(boostSamples, 'inactive'),
  },
  _iconSeparation: { maxIntraClass: r4(maxIntra), minInterClass: r4(minInter) },
  chipSamples,
  badgeSamples,
  boostSamples,
  cardProvenance,
  abilityTemplates: templates.map(t => ({
    id: t.id,
    observedOn: t.observedOn,
    occupancy: q(t.feature.occupancy),
    chromaRB: q(t.feature.chromaRB),
    chromaGB: q(t.feature.chromaGB),
  })),
};

writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`calibration rebuilt: ${chipSamples.length} chip, ${badgeSamples.length} badge, ` +
  `${boostSamples.length} boost samples; ${templates.length} ability templates ` +
  `(intra ${r4(maxIntra)}, inter ${r4(minInter)})`);
