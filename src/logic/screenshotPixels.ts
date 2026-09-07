import { toByteArray } from 'base64-js';
import { decode, toRGBA8 } from 'upng-js';
import type { RgbaImage } from './glyphReader';

/** Decode the lossless PNG emitted by ImageManipulator.
 * No Node APIs or TextDecoder dependency: this code also runs in Hermes.
 */
export function decodeScreenshotPng(base64: string): RgbaImage {
  const bytes = toByteArray(base64);
  const png = decode(bytes.buffer as ArrayBuffer);
  const frames = toRGBA8(png);
  if (frames.length !== 1 || frames[0].byteLength !== png.width * png.height * 4) {
    throw new Error('Screenshot must be one complete image.');
  }
  return { width: png.width, height: png.height, data: new Uint8Array(frames[0]) };
}
