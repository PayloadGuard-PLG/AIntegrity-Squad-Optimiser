import { parsePlayerCard, OcrResult, PlayerCardScanExtended } from './playerCardParse';
import type { RgbaImage } from './glyphReader';

export interface PreparedScreenshot {
  uri: string;
  image: RgbaImage;
  dispose: () => Promise<void>;
}

export interface PlayerScanAdapters {
  prepare: (uri: string) => Promise<PreparedScreenshot>;
  recognize: (uri: string) => Promise<OcrResult>;
}

/** Both readers MUST see the same oriented image at the same resolution.
 * A decode failure still permits text OCR, but never certifies glyph state.
 * Adapters keep the live orchestration testable without loading native modules.
 */
export async function scanPlayerInput(
  uri: string,
  adapters: PlayerScanAdapters,
  suppliedImage?: RgbaImage | null,
): Promise<PlayerCardScanExtended> {
  let prepared: PreparedScreenshot | undefined;
  let image = suppliedImage ?? null;
  let preparationFailed = false;
  if (suppliedImage === undefined) {
    try {
      prepared = await adapters.prepare(uri);
      image = prepared.image;
    } catch {
      preparationFailed = true;
    }
  }
  try {
    const result = parsePlayerCard(await adapters.recognize(prepared?.uri ?? uri), image);
    // With no pixels we cannot observe an empty boost region either. The text
    // parser's no-candidate {} is not sufficient evidence to clear stored boosts.
    if (!image) {
      result.boosts = undefined;
      result.review.push({ field: 'boosts', reason: 'region_unread' });
    }
    if (preparationFailed) {
      result.review.push({
        field: 'image', reason: 'region_unread',
        detail: 'Pixels could not be decoded. Check established roles and tier before saving.',
      });
    }
    return result;
  } finally {
    // Clean up only our cache copy, never the user's original screenshot.
    await prepared?.dispose().catch(() => undefined);
  }
}
