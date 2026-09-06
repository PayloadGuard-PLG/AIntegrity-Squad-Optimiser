/**
 * glyphReader — offline, deterministic pixel readers for the states ML Kit cannot
 * give us as text: role chip state, playstyle badge family, special-ability icons,
 * and whether a +N stat boost is currently active.
 *
 * Design rules (from the OCR Upgrade + State-Model Refactor spec):
 *  - Additive. This module never re-runs OCR and never touches the text pass.
 *  - Anchored + proportional. Every sample region is expressed as a multiple of an
 *    ML Kit box's own height, never as an absolute pixel coordinate, so the readers
 *    survive different resolutions, aspect ratios and the game's other languages.
 *  - Abstain, never guess. Each reader returns a confident value or pushes a
 *    ReviewFlag. Observed-absence (`none` / `[]`) is only ever produced after the
 *    region was successfully sampled and found empty; a region that could not be
 *    read produces `region_unread` and no value.
 *  - No hand-tuned colour constants. Every class boundary is derived at load time
 *    from the measured corpus in glyphCalibration.json by deriveCalibration().
 */

import calibration from './glyphCalibration.json';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PlaystyleFamily = 'attacking' | 'possession' | 'defensive' | 'none' | 'unknown';

export interface StatBoost {
  amount: number;
  source: 'personalTrainer';
  active: boolean;
}

export type ReviewReason =
  | 'ambiguous_color'
  | 'unmatched_icon'
  | 'boost_split_unclear'
  | 'chip_state_unclear'
  | 'region_unread'
  | 'low_confidence';

export interface ReviewFlag {
  field: string;
  reason: ReviewReason;
  detail?: string;
}

/** Decoded, straight-RGBA image. Row-major, 4 bytes per pixel. */
export interface RgbaImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface GlyphBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GlyphToken {
  text: string;
  frame: GlyphBox;
}

/** A stat row where the text pass found both a base value and a `+N` token. */
export interface BoostCandidate {
  stat: string;
  amount: number;
  baseBox: GlyphBox;
  boostBox: GlyphBox;
}

export interface GlyphContext {
  tokens: GlyphToken[];
  knownRoles: string[];
  nameBox?: GlyphBox;
  ovrBox?: GlyphBox;
  boostCandidates?: BoostCandidate[];
}

export interface GlyphReadResult {
  establishedRoles?: string[];
  learningRole?: { role: string; points: number } | null;
  playstyle?: PlaystyleFamily;
  specialAbilities?: string[];
  boosts?: Record<string, StatBoost>;
  /** True only when the tier banner region was successfully sampled. */
  tierRegionObserved: boolean;
  review: ReviewFlag[];
}

// ---------------------------------------------------------------------------
// Calibration policy
//
// These are POLICY factors, not colours. They say how much slack to leave around
// a measured class and how wide the abstention band between two classes must be.
// The colour values themselves all come from glyphCalibration.json.
// ---------------------------------------------------------------------------

const POLICY = {
  /** Envelope margin = base + perSample / n. Fewer samples => wider envelope. */
  valueMarginBase: 0.05,
  valueMarginPerSample: 0.10,
  hueMarginBase: 10,
  hueMarginPerSample: 12,
  ratioMarginBase: 0.04,
  ratioMarginPerSample: 0.06,
  /** Minimum abstention band between two adjacent hue classes, in degrees. */
  minHueGap: 14,
  /** Minimum abstention band between two adjacent scalar classes. */
  minScalarGap: 0.10,
  /** Chip presence: fraction of the smallest observed fill-vs-background distance. */
  presenceHi: 0.55,
  presenceLo: 0.30,
  /** Icon match ceiling = min(intra x intraFactor, inter x interFactor). */
  iconIntraFactor: 2.0,
  iconInterFactor: 0.5,
  /** A badge region with less coverage than this is observed-empty. */
  badgeEmptyCoverage: 0.02,
  /** Saturation/value floor for a pixel to count as badge ink. */
  badgeInkSat: 0.45,
  badgeInkVal: 0.35,
  /** Hue separation from the header fill for a pixel to count as badge ink. */
  badgeInkHueSep: 55,
  /** Below this saturation the header fill is achromatic; hue tests are meaningless. */
  achromaticSat: 0.15,
  /** Icon segmentation: per-channel delta from strip background. */
  iconFgDelta: 34,
} as const;

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** Circular difference between two hues, in degrees (0..180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function circularMedian(hues: number[]): number {
  let x = 0, y = 0;
  for (const h of hues) {
    x += Math.cos((h * Math.PI) / 180);
    y += Math.sin((h * Math.PI) / 180);
  }
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Perceptual-ish distance between two colours: chroma is projected onto a
 * (a, b) plane so hue and saturation move together, and value is a third axis.
 * Used for "is this fill different from the background", which is the one
 * comparison that must work regardless of what colour the chip happens to be.
 */
export function colourDistance(p: Hsv, q: Hsv): number {
  const pa = p.s * Math.cos((p.h * Math.PI) / 180);
  const pb = p.s * Math.sin((p.h * Math.PI) / 180);
  const qa = q.s * Math.cos((q.h * Math.PI) / 180);
  const qb = q.s * Math.sin((q.h * Math.PI) / 180);
  return Math.sqrt((pa - qa) ** 2 + (pb - qb) ** 2 + (p.v - q.v) ** 2);
}

// ---------------------------------------------------------------------------
// Pixel sampling
// ---------------------------------------------------------------------------

/**
 * Median HSV over a rectangle. Returns null when the rectangle does not lie
 * wholly inside the image — a failed observation, never a default colour.
 */
export function sampleMedianHsv(img: RgbaImage, rect: GlyphBox): Hsv | null {
  const x0 = Math.round(rect.left);
  const y0 = Math.round(rect.top);
  const x1 = Math.round(rect.left + rect.width);
  const y1 = Math.round(rect.top + rect.height);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 < 0 || y0 < 0 || x1 > img.width || y1 > img.height) return null;
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      rs.push(img.data[i]);
      gs.push(img.data[i + 1]);
      bs.push(img.data[i + 2]);
    }
  }
  if (rs.length === 0) return null;
  return rgbToHsv(median(rs), median(gs), median(bs));
}

function rectInside(img: RgbaImage, rect: GlyphBox): boolean {
  return (
    rect.width > 0 && rect.height > 0 &&
    rect.left >= 0 && rect.top >= 0 &&
    rect.left + rect.width <= img.width &&
    rect.top + rect.height <= img.height
  );
}

/** Rectangle spanning the anchor's own width, offset vertically by multiples of its height. */
function bandOverAnchor(anchor: GlyphBox, dy0: number, dy1: number): GlyphBox {
  const h = anchor.height;
  return {
    left: anchor.left,
    top: anchor.top + dy0 * h,
    width: anchor.width,
    height: (dy1 - dy0) * h,
  };
}

/** Rectangle to the right of the anchor, sized in multiples of the anchor's height. */
function bandRightOfAnchor(anchor: GlyphBox, dx0: number, dx1: number, dy0: number, dy1: number): GlyphBox {
  const h = anchor.height;
  const right = anchor.left + anchor.width;
  return {
    left: right + dx0 * h,
    top: anchor.top + dy0 * h,
    width: (dx1 - dx0) * h,
    height: anchor.height + (dy1 - dy0) * h,
  };
}

// ---------------------------------------------------------------------------
// Calibration derivation
// ---------------------------------------------------------------------------

interface Band {
  lo: number;
  hi: number;
}

interface DerivedCalibration {
  chip: {
    darkValueMax: number;
    establishedValueMin: number;
    presenceHi: number;
    presenceLo: number;
  };
  badge: {
    attacking: Band;   // hue band, expressed on a (-180, 180] axis
    possession: Band;
    defensive: Band;
    emptyCoverage: number;
  };
  boost: { inactiveMax: number; activeMin: number };
  icon: { matchMax: number };
}

function margin(base: number, perSample: number, n: number): number {
  return base + perSample / Math.max(1, n);
}

/** Push two adjacent boundaries apart until at least `gap` separates them. */
function enforceGap(hi: number, lo: number, gap: number): [number, number] {
  if (lo - hi >= gap) return [hi, lo];
  const mid = (hi + lo) / 2;
  return [mid - gap / 2, mid + gap / 2];
}

/** Map a hue to the (-180, 180] axis so the red family does not wrap mid-band. */
function signedHue(h: number): number {
  const x = ((h % 360) + 360) % 360;
  return x > 180 ? x - 360 : x;
}

export function deriveCalibration(): DerivedCalibration {
  const chipSamples = calibration.chipSamples as Array<{
    class: string; fill: number[]; rowBackground: number[];
  }>;
  const dark = chipSamples.filter(s => s.class === 'dark');
  const est = chipSamples.filter(s => s.class === 'established');

  const darkVals = dark.map(s => s.fill[2]);
  const estVals = est.map(s => s.fill[2]);
  let darkValueMax = Math.max(...darkVals) + margin(POLICY.valueMarginBase, POLICY.valueMarginPerSample, dark.length);
  let establishedValueMin = Math.min(...estVals) - margin(POLICY.valueMarginBase, POLICY.valueMarginPerSample, est.length);
  [darkValueMax, establishedValueMin] = enforceGap(darkValueMax, establishedValueMin, POLICY.minScalarGap);

  // Presence: the smallest fill-vs-background separation anywhere in the corpus
  // sets the scale. A chip must clear a fraction of it; well below it is "no chip".
  const toHsv = (a: number[]): Hsv => ({ h: a[0], s: a[1], v: a[2] });
  const minPresence = Math.min(
    ...chipSamples.map(s => colourDistance(toHsv(s.fill), toHsv(s.rowBackground)))
  );

  const badgeSamples = calibration.badgeSamples as Array<{ class: string; hue?: number }>;
  const family = (name: string): Band => {
    const hs = badgeSamples.filter(s => s.class === name && typeof s.hue === 'number')
      .map(s => signedHue(s.hue as number));
    const m = margin(POLICY.hueMarginBase, POLICY.hueMarginPerSample, hs.length);
    return { lo: Math.min(...hs) - m, hi: Math.max(...hs) + m };
  };
  const attacking = family('attacking');
  const possession = family('possession');
  const defensive = family('defensive');
  [attacking.hi, possession.lo] = enforceGap(attacking.hi, possession.lo, POLICY.minHueGap);
  [possession.hi, defensive.lo] = enforceGap(possession.hi, defensive.lo, POLICY.minHueGap);

  const boostSamples = calibration.boostSamples as Array<{ class: string; ratio: number }>;
  const inact = boostSamples.filter(s => s.class === 'inactive').map(s => s.ratio);
  const act = boostSamples.filter(s => s.class === 'active').map(s => s.ratio);
  let inactiveMax = Math.max(...inact) + margin(POLICY.ratioMarginBase, POLICY.ratioMarginPerSample, inact.length);
  let activeMin = Math.min(...act) - margin(POLICY.ratioMarginBase, POLICY.ratioMarginPerSample, act.length);
  [inactiveMax, activeMin] = enforceGap(inactiveMax, activeMin, POLICY.minScalarGap);

  const sep = calibration._iconSeparation as { maxIntraClass: number; minInterClass: number };
  const matchMax = Math.min(
    sep.maxIntraClass * POLICY.iconIntraFactor,
    sep.minInterClass * POLICY.iconInterFactor
  );

  return {
    chip: {
      darkValueMax,
      establishedValueMin,
      presenceHi: minPresence * POLICY.presenceHi,
      presenceLo: minPresence * POLICY.presenceLo,
    },
    badge: { attacking, possession, defensive, emptyCoverage: POLICY.badgeEmptyCoverage },
    boost: { inactiveMax, activeMin },
    icon: { matchMax },
  };
}

export const CALIBRATION: DerivedCalibration = deriveCalibration();

// ---------------------------------------------------------------------------
// 5.1 roleChips()
// ---------------------------------------------------------------------------

export type ChipState = 'established' | 'dark' | 'unclear';

/**
 * Classify a chip by STATE, not by colour identity.
 *
 * A chip is `dark` when its fill sits below the dark ceiling, and `established`
 * when it is confidently present against the row background and is not dark.
 * Established is deliberately a residual class: the game renders established
 * chips in more than one colour (gold, and green for a player's primary role),
 * and a colour we have never seen must still read as established rather than
 * abstain. Anything that is neither confidently present nor confidently dark
 * is `unclear` and abstains.
 */
export function classifyChip(fill: Hsv, rowBackground: Hsv): ChipState {
  const c = CALIBRATION.chip;
  if (fill.v <= c.darkValueMax) return 'dark';
  const presence = colourDistance(fill, rowBackground);
  if (presence < c.presenceLo) return 'unclear';       // indistinguishable from background
  if (presence < c.presenceHi) return 'unclear';       // in the presence abstention band
  if (fill.v < c.establishedValueMin) return 'unclear'; // between dark and established
  return 'established';
}

/**
 * Chip fill and the roles-row background behind it, both anchored proportionally
 * to the role token's own box. Exported so the calibration builder measures with
 * exactly the code the reader uses — a parallel implementation would drift.
 */
export function sampleChip(img: RgbaImage, tokenFrame: GlyphBox): { fill: Hsv; background: Hsv } | null {
  const fill = sampleMedianHsv(img, bandOverAnchor(tokenFrame, -0.45, -0.10));
  const background = sampleMedianHsv(img, bandOverAnchor(tokenFrame, -1.10, -0.65));
  if (!fill || !background) return null;
  return { fill, background };
}

export interface RoleChipsResult {
  establishedRoles?: string[];
  learningRole?: { role: string; points: number } | null;
  review: ReviewFlag[];
}

const ROLES_ROW_RE = /^roles?\s*:?$/i;
const COUNTER_RE = /^(\d{1,2})\s*\/\s*50$/;

export function roleChips(img: RgbaImage | null, ctx: GlyphContext): RoleChipsResult {
  const review: ReviewFlag[] = [];
  const label = ctx.tokens.find(t => ROLES_ROW_RE.test(t.text.trim()));
  if (!img || !label) {
    review.push({
      field: 'roles',
      reason: 'region_unread',
      detail: !img ? 'no image supplied to glyph reader' : 'Roles: anchor not found',
    });
    return { review };
  }

  const rowTol = label.frame.height * 1.5;
  const onRow = ctx.tokens.filter(t => Math.abs(t.frame.top - label.frame.top) < rowTol);
  const roleSet = new Set(ctx.knownRoles.map(r => r.toUpperCase()));
  const roleToks = onRow.filter(t => roleSet.has(t.text.trim().toUpperCase()));
  const counters = onRow
    .map(t => ({ t, m: COUNTER_RE.exec(t.text.replace(/\s+/g, '')) }))
    .filter((x): x is { t: GlyphToken; m: RegExpExecArray } => x.m !== null);

  const established: string[] = [];
  let learning: { role: string; points: number } | null = null;
  let sawUnread = false;

  for (const tok of roleToks) {
    const role = tok.text.trim().toUpperCase();
    const sample = sampleChip(img, tok.frame);
    const fill = sample?.fill ?? null;
    const bg = sample?.background ?? null;
    if (!fill || !bg) {
      sawUnread = true;
      review.push({ field: `roles.${role}`, reason: 'region_unread', detail: 'chip fill region outside image' });
      continue;
    }
    const state = classifyChip(fill, bg);
    if (state === 'unclear') {
      review.push({
        field: `roles.${role}`,
        reason: 'chip_state_unclear',
        detail: `fill h=${fill.h.toFixed(1)} s=${fill.s.toFixed(3)} v=${fill.v.toFixed(3)} between chip states`,
      });
      continue;
    }
    if (state === 'established') {
      established.push(role);
      continue;
    }
    // Dark chip: learning if an X/50 counter sits next to it, otherwise an empty slot.
    const counter = counters.find(c => c.t.frame.left > tok.frame.left);
    if (!counter) {
      review.push({
        field: `roles.${role}`,
        reason: 'chip_state_unclear',
        detail: 'dark chip carries a role letter but no X/50 counter',
      });
      continue;
    }
    const points = parseInt(counter.m[1], 10);
    if (learning) {
      review.push({
        field: 'learningRole',
        reason: 'low_confidence',
        detail: `more than one dark role chip with a counter (${learning.role}, ${role})`,
      });
      continue;
    }
    learning = { role, points };
  }

  // An unread chip means the established set is incomplete — do not publish a
  // partial list as if it were the whole truth.
  if (sawUnread) return { review };

  return { establishedRoles: established, learningRole: learning, review };
}

// ---------------------------------------------------------------------------
// 5.2 playstyleBadge()
// ---------------------------------------------------------------------------

export interface PlaystyleResult {
  playstyle?: PlaystyleFamily;
  review: ReviewFlag[];
}

function classifyBadgeHue(hue: number): PlaystyleFamily | 'ambiguous' {
  const h = signedHue(hue);
  const b = CALIBRATION.badge;
  if (h >= b.attacking.lo && h <= b.attacking.hi) return 'attacking';
  if (h >= b.possession.lo && h <= b.possession.hi) return 'possession';
  if (h >= b.defensive.lo && h <= b.defensive.hi) return 'defensive';
  return 'ambiguous';
}

export function playstyleBadge(img: RgbaImage | null, ctx: GlyphContext): PlaystyleResult {
  const review: ReviewFlag[] = [];
  const name = ctx.nameBox;
  if (!img || !name) {
    review.push({
      field: 'playstyle',
      reason: 'region_unread',
      detail: !img ? 'no image supplied to glyph reader' : 'name block anchor not found',
    });
    return { review };
  }

  const { window, headerRef } = badgeRegions(name);
  if (!rectInside(img, window) || !rectInside(img, headerRef)) {
    review.push({ field: 'playstyle', reason: 'region_unread', detail: 'badge region outside image' });
    return { review };
  }
  const header = sampleMedianHsv(img, headerRef);
  if (!header) {
    review.push({ field: 'playstyle', reason: 'region_unread', detail: 'header reference could not be sampled' });
    return { review };
  }

  const m = measureBadge(img, window, header);

  // Region was sampled successfully and holds no badge ink => observed absence.
  if (m.coverage < CALIBRATION.badge.emptyCoverage || m.hue === undefined) {
    return { playstyle: 'none', review };
  }

  const family = classifyBadgeHue(m.hue);
  if (family === 'ambiguous') {
    review.push({
      field: 'playstyle',
      reason: 'ambiguous_color',
      detail: `badge hue ${m.hue.toFixed(1)}deg falls between playstyle families`,
    });
    return { review };
  }
  return { playstyle: family, review };
}

/** The badge window's ink coverage and dominant hue. Shared with the calibration builder. */
export function measureBadge(img: RgbaImage, window: GlyphBox, header: Hsv): { coverage: number; hue?: number } {
  const x0 = Math.round(window.left), x1 = Math.round(window.left + window.width);
  const y0 = Math.round(window.top), y1 = Math.round(window.top + window.height);
  const hues: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      const c = rgbToHsv(img.data[i], img.data[i + 1], img.data[i + 2]);
      if (c.s <= POLICY.badgeInkSat || c.v <= POLICY.badgeInkVal) continue;
      if (header.s >= POLICY.achromaticSat && hueDistance(c.h, header.h) <= POLICY.badgeInkHueSep) continue;
      hues.push(c.h);
    }
  }
  const total = (x1 - x0) * (y1 - y0);
  const coverage = total > 0 ? hues.length / total : 0;
  return hues.length > 0 ? { coverage, hue: circularMedian(hues) } : { coverage };
}

/** The badge window and its header reference, for a given name box. */
export function badgeRegions(nameBox: GlyphBox): { window: GlyphBox; headerRef: GlyphBox } {
  return {
    window: bandRightOfAnchor(nameBox, 0.10, 2.30, -0.30, 0.30),
    headerRef: bandRightOfAnchor(nameBox, 2.60, 4.20, -0.30, 0.30),
  };
}

// ---------------------------------------------------------------------------
// 5.3 specialAbilities()
// ---------------------------------------------------------------------------

const GRID = (calibration._gridSize as number) ?? 8;

export interface IconFeature {
  occupancy: number[];
  chromaRB: number[];
  chromaGB: number[];
}

export function iconDistance(a: IconFeature, b: IconFeature): number {
  const n = a.occupancy.length;
  let s = 0;
  for (let k = 0; k < n; k++) {
    s += Math.abs(a.occupancy[k] - b.occupancy[k]);
    const w = Math.min(a.occupancy[k], b.occupancy[k]);
    s += w * (Math.abs(a.chromaRB[k] - b.chromaRB[k]) + Math.abs(a.chromaGB[k] - b.chromaGB[k]));
  }
  return s / n;
}

const TEMPLATES = calibration.abilityTemplates as Array<
  { id: string; observedOn: string[] } & IconFeature
>;

const ABILITY_LABEL_RE = /^abilit(y|ies)\s*:?$/i;

export interface AbilitiesResult {
  specialAbilities?: string[];
  review: ReviewFlag[];
}

export interface IconSample {
  x0: number;
  x1: number;
  feature: IconFeature;
}

/**
 * Locate the ability icon strip and extract one feature grid per icon.
 * Returns null when the strip could not be observed at all (failed observation),
 * and an empty array when the strip was observed and holds no icons.
 * Exported so the calibration builder produces templates with exactly the code
 * that later matches against them.
 */
export function extractIconSamples(img: RgbaImage, labelFrame: GlyphBox): IconSample[] | null {
  const strip = bandRightOfAnchor(labelFrame, 0.2, 9.0, -0.6, 0.5);
  if (!rectInside(img, strip)) return null;
  const sx0 = Math.round(strip.left), sx1 = Math.round(strip.left + strip.width);
  const sy0 = Math.round(strip.top), sy1 = Math.round(strip.top + strip.height);

  // Background reference: the tail of the strip, past the last possible icon.
  const bgW = Math.max(4, Math.round(labelFrame.height * 1.8));
  const bgRs: number[] = [], bgGs: number[] = [], bgBs: number[] = [];
  for (let y = sy0; y < sy1; y++) {
    for (let x = sx1 - bgW; x < sx1; x++) {
      const i = (y * img.width + x) * 4;
      bgRs.push(img.data[i]); bgGs.push(img.data[i + 1]); bgBs.push(img.data[i + 2]);
    }
  }
  if (bgRs.length === 0) return null;
  const br = median(bgRs), bg = median(bgGs), bb = median(bgBs);
  const isFg = (x: number, y: number): boolean => {
    const i = (y * img.width + x) * 4;
    return Math.max(
      Math.abs(img.data[i] - br),
      Math.abs(img.data[i + 1] - bg),
      Math.abs(img.data[i + 2] - bb)
    ) > POLICY.iconFgDelta;
  };

  const gapTol = Math.max(2, Math.round(labelFrame.height * 0.28));
  const minW = Math.max(4, Math.round(labelFrame.height * 0.36));
  const runs: Array<[number, number]> = [];
  let cur: [number, number] | null = null;
  for (let x = sx0; x < sx1; x++) {
    let n = 0;
    for (let y = sy0; y < sy1; y++) if (isFg(x, y)) n++;
    if (n >= 3) {
      if (!cur) cur = [x, x];
      else if (x - cur[1] <= gapTol) cur[1] = x;
      else { runs.push(cur); cur = [x, x]; }
    }
  }
  if (cur) runs.push(cur);

  return runs
    .filter(r => r[1] - r[0] >= minW)
    .map(([x0, x1]) => ({ x0, x1, feature: iconFeature(img, x0, x1, sy0, sy1, isFg) }));
}

export function specialAbilities(img: RgbaImage | null, ctx: GlyphContext): AbilitiesResult {
  const review: ReviewFlag[] = [];
  const label = ctx.tokens.find(t => ABILITY_LABEL_RE.test(t.text.trim()));
  if (!img || !label) {
    review.push({
      field: 'specialAbilities',
      reason: 'region_unread',
      detail: !img ? 'no image supplied to glyph reader' : 'Special ability: anchor not found',
    });
    return { review };
  }

  const samples = extractIconSamples(img, label.frame);
  if (samples === null) {
    review.push({ field: 'specialAbilities', reason: 'region_unread', detail: 'ability strip could not be observed' });
    return { review };
  }

  // Strip located and observed to be empty => a genuine zero-ability read.
  if (samples.length === 0) return { specialAbilities: [], review };

  const matched: string[] = [];
  for (const s of samples) {
    let best: { id: string; d: number } | null = null;
    for (const t of TEMPLATES) {
      const d = iconDistance(s.feature, t);
      if (!best || d < best.d) best = { id: t.id, d };
    }
    if (best && best.d <= CALIBRATION.icon.matchMax) matched.push(best.id);
    else {
      review.push({
        field: 'specialAbilities',
        reason: 'unmatched_icon',
        detail: `icon at x=${s.x0}-${s.x1} did not match any template (best ${best ? best.id : 'n/a'} d=${best ? best.d.toFixed(3) : 'n/a'})`,
      });
    }
  }
  return { specialAbilities: matched, review };
}

function iconFeature(
  img: RgbaImage, x0: number, x1: number, y0: number, y1: number,
  isFg: (x: number, y: number) => boolean
): IconFeature {
  const w = x1 - x0 + 1;
  const h = y1 - y0;
  const cells = GRID * GRID;
  const cnt = new Array<number>(cells).fill(0);
  const tot = new Array<number>(cells).fill(0);
  const rb = new Array<number>(cells).fill(0);
  const gb = new Array<number>(cells).fill(0);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const x = x0 + i, y = y0 + j;
      const k = Math.min(GRID - 1, Math.floor((j * GRID) / h)) * GRID + Math.min(GRID - 1, Math.floor((i * GRID) / w));
      tot[k]++;
      if (isFg(x, y)) {
        const p = (y * img.width + x) * 4;
        cnt[k]++;
        rb[k] += (img.data[p] - img.data[p + 2]) / 255;
        gb[k] += (img.data[p + 1] - img.data[p + 2]) / 255;
      }
    }
  }
  const occupancy = new Array<number>(cells);
  const chromaRB = new Array<number>(cells);
  const chromaGB = new Array<number>(cells);
  for (let k = 0; k < cells; k++) {
    occupancy[k] = tot[k] ? cnt[k] / tot[k] : 0;
    chromaRB[k] = cnt[k] ? rb[k] / cnt[k] : 0;
    chromaGB[k] = cnt[k] ? gb[k] / cnt[k] : 0;
  }
  return { occupancy, chromaRB, chromaGB };
}

// ---------------------------------------------------------------------------
// 5.4 boostOverlay()
// ---------------------------------------------------------------------------

export interface BoostResult {
  boosts?: Record<string, StatBoost>;
  review: ReviewFlag[];
}

/** 5th/95th percentile luminance of a box: the ink and the cell fill. */
function inkContrast(img: RgbaImage, box: GlyphBox): number | null {
  const x0 = Math.round(box.left), x1 = Math.round(box.left + box.width);
  const y0 = Math.round(box.top), y1 = Math.round(box.top + box.height);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 < 0 || y0 < 0 || x1 > img.width || y1 > img.height) return null;
  const ls: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      ls.push(0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]);
    }
  }
  if (ls.length < 8) return null;
  ls.sort((a, b) => a - b);
  return ls[Math.floor(ls.length * 0.95)] - ls[Math.floor(ls.length * 0.05)];
}

/** Ink contrast of the `+N` glyph relative to the base number in the same row. */
export function boostInkRatio(img: RgbaImage, baseBox: GlyphBox, boostBox: GlyphBox): number | null {
  const baseC = inkContrast(img, baseBox);
  const boostC = inkContrast(img, boostBox);
  if (baseC === null || boostC === null || baseC <= 0) return null;
  return boostC / baseC;
}

/**
 * Decide whether a `+N` overlay is currently active.
 *
 * The discriminator is the ink contrast of the `+N` glyph relative to the base
 * number in the same row. A live boost is drawn in the same ink weight as the
 * base value; a gated one is greyed out. Comparing the two within one row is
 * more device-robust than any absolute grey threshold, because exposure and
 * compression move both boxes together.
 */
export function boostOverlay(img: RgbaImage | null, ctx: GlyphContext): BoostResult {
  const candidates = ctx.boostCandidates ?? [];
  if (candidates.length === 0) return { boosts: {}, review: [] };

  const review: ReviewFlag[] = [];
  if (!img) {
    for (const c of candidates) {
      review.push({
        field: `boosts.${c.stat}`,
        reason: 'region_unread',
        detail: 'no image supplied to glyph reader; base value kept, boost not classified',
      });
    }
    return { review };
  }

  const boosts: Record<string, StatBoost> = {};
  for (const c of candidates) {
    const ratioOrNull = boostInkRatio(img, c.baseBox, c.boostBox);
    if (ratioOrNull === null) {
      review.push({
        field: `boosts.${c.stat}`,
        reason: 'boost_split_unclear',
        detail: 'base or boost cell could not be sampled; base value kept',
      });
      continue;
    }
    const ratio = ratioOrNull;
    if (ratio >= CALIBRATION.boost.activeMin) {
      boosts[c.stat] = { amount: c.amount, source: 'personalTrainer', active: true };
    } else if (ratio <= CALIBRATION.boost.inactiveMax) {
      boosts[c.stat] = { amount: c.amount, source: 'personalTrainer', active: false };
    } else {
      review.push({
        field: `boosts.${c.stat}`,
        reason: 'boost_split_unclear',
        detail: `ink ratio ${ratio.toFixed(3)} falls between the active and inactive bands; base value kept`,
      });
    }
  }
  return { boosts, review };
}

// ---------------------------------------------------------------------------
// Tier banner region observation
//
// Not a glyph reader: the tier NAME is still read by the text pass. This only
// answers "was the banner region actually looked at?", which is what separates
// "observed, no tier name => T0" from "never read => abstain".
// ---------------------------------------------------------------------------

export function tierBannerObserved(img: RgbaImage | null, ctx: GlyphContext): boolean {
  if (!img || !ctx.ovrBox) return false;
  const banner = bandRightOfAnchor(ctx.ovrBox, 4.0, 22.0, -0.4, 0.4);
  if (!rectInside(img, banner)) return false;
  return sampleMedianHsv(img, banner) !== null;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function readGlyphs(img: RgbaImage | null, ctx: GlyphContext): GlyphReadResult {
  const chips = roleChips(img, ctx);
  const style = playstyleBadge(img, ctx);
  const abilities = specialAbilities(img, ctx);
  const boost = boostOverlay(img, ctx);
  const tierObserved = tierBannerObserved(img, ctx);

  const review = [...chips.review, ...style.review, ...abilities.review, ...boost.review];
  if (!tierObserved) {
    review.push({
      field: 'tier',
      reason: 'region_unread',
      detail: img ? 'tier banner region could not be located' : 'no image supplied to glyph reader',
    });
  }

  return {
    establishedRoles: chips.establishedRoles,
    learningRole: chips.establishedRoles ? chips.learningRole ?? null : undefined,
    playstyle: style.playstyle,
    specialAbilities: abilities.specialAbilities,
    boosts: boost.boosts,
    tierRegionObserved: tierObserved,
    review,
  };
}
