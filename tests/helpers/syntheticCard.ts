/**
 * Rebuilds a card canvas from the COMMITTED measurements in glyphCalibration.json,
 * at the real token geometry from the ML Kit fixtures. No game imagery is involved
 * or needed — the repo carries numbers, not screenshots.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * It exercises the real anchoring maths (every sample region is resolved from the
 * actual ML Kit boxes), the real classifier, the abstention bands and the whole
 * parse pipeline. It does NOT independently confirm the class boundaries: the
 * pixels are painted from the same corpus the boundaries are derived from, so a
 * mis-measured corpus would look self-consistent here.
 *
 * The non-circular check is the real-capture pass in scanner-test.ts, which runs
 * only when labelled screenshots are present in the untracked calibration-captures/
 * directory. Treat a green synthetic run as "the machinery is wired correctly",
 * and the real-capture run as "the boundaries actually discriminate".
 */
import calibration from '../../src/logic/glyphCalibration.json';
import type { RgbaImage, GlyphToken, GlyphBox } from '../../src/logic/glyphReader';
import type { OcrResult } from '../../src/logic/playerCardParse';
import { findNameBlock } from '../../src/logic/playerCardParse';
import { blankImage, hsvToRgb } from './png';

const WIDTH = 1900;
const HEIGHT = 820;

type Hsv3 = [number, number, number];
type Chip = { card: string; chip: string; class: string; fill: Hsv3; rowBackground: Hsv3 };
type Badge = { card: string; class: string; coverage: number; hue?: number; headerReference: Hsv3 };
type Boost = { card: string; stat: string; class: string; ratio: number; baseContrast: number; cellLuma: number };
type Prov = {
  badgeInk?: { hue: number; sat: number; val: number; coverage: number };
  abilityIconSpans: number[][];
  abilityStripBackground: number[];
};
type Template = { id: string; observedOn: string[]; occupancy: number[]; chromaRB: number[]; chromaGB: number[] };

const CHIPS = calibration.chipSamples as Chip[];
const BADGES = calibration.badgeSamples as Badge[];
const BOOSTS = calibration.boostSamples as Boost[];
const PROV = calibration.cardProvenance as unknown as Record<string, Prov>;
const TEMPLATES = calibration.abilityTemplates as Template[];
const GRID = calibration._gridSize as number;

function tokensOf(ocr: OcrResult): GlyphToken[] {
  return ocr.blocks
    .flatMap(b => b.lines)
    .flatMap(l => l.elements)
    .map(e => (e.frame && e.text.trim()
      ? { text: e.text.trim(), frame: { left: e.frame.left, top: e.frame.top, width: e.frame.width, height: e.frame.height } }
      : null))
    .filter((t): t is GlyphToken => t !== null);
}

const grey = (l: number): [number, number, number] => {
  const v = Math.max(0, Math.min(255, Math.round(l)));
  return [v, v, v];
};

/** Reconstruct an icon's pixels from its template feature grid. */
function paintIcon(
  fill: (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => void,
  t: Template, x0: number, x1: number, y0: number, y1: number,
  bg: number[]
) {
  const w = x1 - x0 + 1, h = y1 - y0;
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const k = cy * GRID + cx;
      const px0 = x0 + Math.floor((cx * w) / GRID), px1 = x0 + Math.floor(((cx + 1) * w) / GRID);
      const py0 = y0 + Math.floor((cy * h) / GRID), py1 = y0 + Math.floor(((cy + 1) * h) / GRID);
      fill(px0, py0, px1, py1, bg as [number, number, number]);
      const occ = t.occupancy[k];
      if (occ <= 0) continue;
      // Colour with the recorded chroma; base channel chosen to keep all three in range.
      const b = 90;
      const col: [number, number, number] = [
        Math.max(0, Math.min(255, Math.round(b + t.chromaRB[k] * 255))),
        Math.max(0, Math.min(255, Math.round(b + t.chromaGB[k] * 255))),
        b,
      ];
      // Paint an exact pixel count in raster order, so the re-extracted occupancy
      // reproduces the recorded fraction to within half a pixel per cell.
      const cellPx = (px1 - px0) * (py1 - py0);
      const want = Math.round(occ * cellPx);
      let n = 0;
      for (let y = py0; y < py1 && n < want; y++) {
        for (let x = px0; x < px1 && n < want; x++, n++) fill(x, y, x + 1, y + 1, col);
      }
    }
  }
}

export function buildSyntheticCard(card: string, ocr: OcrResult): RgbaImage {
  const { img, fill } = blankImage(WIDTH, HEIGHT, [0, 0, 0]);
  const tokens = tokensOf(ocr);
  const tok = (text: string) => tokens.find(t => t.text.toUpperCase() === text.toUpperCase());

  // --- role chips: row background band, then each chip's fill on top
  for (const s of CHIPS.filter(c => c.card === card)) {
    const t = tok(s.chip);
    if (!t) continue;
    const f = t.frame, h = f.height;
    fill(
      Math.round(f.left - 2 * h), Math.round(f.top - 1.6 * h),
      Math.round(f.left + f.width + 2 * h), Math.round(f.top + 2.0 * h),
      hsvToRgb(...s.rowBackground)
    );
    // Chip starts below the background sample band (-1.10h..-0.65h) and covers
    // the fill sample band (-0.45h..-0.10h).
    fill(
      Math.round(f.left - 0.25 * h), Math.round(f.top - 0.55 * h),
      Math.round(f.left + f.width + 0.25 * h), Math.round(f.top + 1.5 * h),
      hsvToRgb(...s.fill)
    );
  }

  // --- playstyle badge: header fill across the window + header reference,
  //     then badge ink sized to the recorded coverage
  const nameBox = findNameBlock(ocr)?.frame as GlyphBox | undefined;
  const badge = BADGES.find(b => b.card === card);
  if (nameBox && badge) {
    const h = nameBox.height, right = nameBox.left + nameBox.width;
    fill(
      Math.round(right), Math.round(nameBox.top - 0.6 * h),
      Math.round(right + 4.6 * h), Math.round(nameBox.top + h + 0.6 * h),
      hsvToRgb(...badge.headerReference)
    );
    const ink = PROV[card]?.badgeInk;
    if (ink) {
      const wx0 = right + 0.10 * h, wx1 = right + 2.30 * h;
      const wy0 = nameBox.top - 0.30 * h, wy1 = nameBox.top + h + 0.30 * h;
      const scale = Math.sqrt(ink.coverage);
      const bw = (wx1 - wx0) * scale, bh = (wy1 - wy0) * scale;
      const cx = (wx0 + wx1) / 2, cy = (wy0 + wy1) / 2;
      fill(
        Math.round(cx - bw / 2), Math.round(cy - bh / 2),
        Math.round(cx + bw / 2), Math.round(cy + bh / 2),
        hsvToRgb(ink.hue, ink.sat, ink.val)
      );
    }
  }

  // --- ability strip: background, then one reconstructed icon per recorded span
  const abilityTok = tokens.find(t => /^abilit(y|ies)\s*:?$/i.test(t.text));
  const prov = PROV[card];
  if (abilityTok && prov) {
    const f = abilityTok.frame, h = f.height;
    const sx0 = Math.round(f.left + f.width + 0.2 * h);
    const sx1 = Math.round(f.left + f.width + 9.0 * h);
    const sy0 = Math.round(f.top - 0.6 * h);
    const sy1 = Math.round(f.top + f.height + 0.5 * h);
    fill(sx0 - 4, sy0 - 2, sx1 + 4, sy1 + 2, prov.abilityStripBackground as [number, number, number]);
    prov.abilityIconSpans.forEach((span, i) => {
      const [x0, x1] = span;
      const t = TEMPLATES.find(tp => tp.observedOn.includes(`${card}#${i}`));
      if (t) paintIcon(fill, t, x0, x1, sy0, sy1, prov.abilityStripBackground);
    });
  }

  // --- boost rows: cell fill plus ink dithered to reproduce the recorded contrasts
  for (const s of BOOSTS.filter(b => b.card === card)) {
    const statTok = tok(s.stat);
    if (!statTok) continue;
    const row = tokens
      .filter(t => t !== statTok && Math.abs(t.frame.top - statTok.frame.top) < 20 && t.frame.left > statTok.frame.left)
      .sort((a, b) => a.frame.left - b.frame.left);
    const bi = row.findIndex(t => /^\d{1,3}$/.test(t.text));
    const baseBox = row[bi]?.frame, boostBox = row[bi + 1]?.frame;
    if (!baseBox || !boostBox) continue;
    const paintInk = (box: GlyphBox, contrast: number) => {
      const x0 = Math.round(box.left), x1 = Math.round(box.left + box.width);
      const y0 = Math.round(box.top), y1 = Math.round(box.top + box.height);
      fill(x0 - 3, y0 - 3, x1 + 3, y1 + 3, grey(s.cellLuma));
      const inkC = grey(s.cellLuma - contrast);
      // ~40% coverage: p05 lands on ink, p95 on the cell fill.
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) if ((x + y) % 5 < 2) fill(x, y, x + 1, y + 1, inkC);
      }
    };
    paintInk(baseBox, s.baseContrast);
    paintInk(boostBox, s.baseContrast * s.ratio);
  }

  return img;
}
