import TextRecognition from '@react-native-ml-kit/text-recognition';
import { parsePlayerCard, PlayerCardScanExtended, OcrResult } from './playerCardParse';
import { RgbaImage } from './glyphReader';

// The text/number parsing lives in playerCardParse.ts so it can be tested without
// loading the native ML Kit module (which pulls in react-native). Its behaviour is
// unchanged and frozen by tests/fixtures/scan-golden.json.
export type { PlayerCardScan, PlayerCardScanExtended } from './playerCardParse';
export { parsePlayerCard, parsePlayerCardText } from './playerCardParse';

const TIMEOUT_MS = 5000;

/**
 * Scan a player card screenshot.
 *
 * `image` is the optional decoded RGBA bitmap of the same screenshot. When it is
 * supplied the glyph readers run and populate establishedRoles / learningRole /
 * playstyle / specialAbilities / boosts. When it is omitted those fields abstain
 * with `region_unread` review flags rather than defaulting.
 */
export async function scanPlayerCard(
  imageUri: string,
  image?: RgbaImage | null
): Promise<PlayerCardScanExtended> {
  const result = await Promise.race([
    TextRecognition.recognize(imageUri),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ML Kit timed out — New Architecture may be incompatible. Rebuild with newArchEnabled:false.')), TIMEOUT_MS)
    ),
  ]);

  return parsePlayerCard(result as unknown as OcrResult, image);
}
