/**
 * Minimal PNG decoder for tests — 8-bit truecolour (colour type 2/6), no interlace.
 * Test-only: the app decodes images on-device, this just lets the glyph readers be
 * exercised against the real reference pixels in Node.
 */
import { readFileSync } from 'fs';
import { inflateSync } from 'zlib';
import type { RgbaImage } from '../../src/logic/glyphReader';

export function decodePng(path: string): RgbaImage {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colourType = buf[25];
  const interlace = buf[28];
  if (bitDepth !== 8) throw new Error(`${path}: only 8-bit PNGs supported (got ${bitDepth})`);
  if (colourType !== 2 && colourType !== 6) throw new Error(`${path}: only truecolour PNGs supported (got type ${colourType})`);
  if (interlace !== 0) throw new Error(`${path}: interlaced PNGs not supported`);

  const idat: Buffer[] = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const bpp = colourType === 2 ? 3 : 4;
  const stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let p = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    for (let i = 0; i < stride; i++) {
      const x = raw[p + i];
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v: number;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`${path}: bad filter ${filter} on row ${y}`);
      }
      line[i] = v & 0xff;
    }
    p += stride;
    for (let x = 0; x < width; x++) {
      const s = x * bpp;
      const d = (y * width + x) * 4;
      out[d] = line[s];
      out[d + 1] = line[s + 1];
      out[d + 2] = line[s + 2];
      out[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev.set(line);
  }

  return { width, height, data: out };
}

/** Blank RGBA canvas, for synthetic-region tests. */
export function blankImage(width: number, height: number, rgb: [number, number, number] = [0, 0, 0]): {
  img: RgbaImage;
  fill: (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => void;
} {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
  }
  const img: RgbaImage = { width, height, data };
  const fill = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
        const i = (y * width + x) * 4;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
    }
  };
  return { img, fill };
}

/** HSV (h in degrees) to 8-bit RGB — for synthesising colours at exact positions. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
