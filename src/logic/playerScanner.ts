import TextRecognition from '@react-native-ml-kit/text-recognition';
import { parsePlayerCard, PlayerCardScanExtended, OcrResult } from './playerCardParse';
import { RgbaImage } from './glyphReader';
import { scanPlayerInput } from './playerScanPipeline';
import { preparePlayerScreenshot } from './preparePlayerScreenshot';

// The text/number parsing lives in playerCardParse.ts so it can be tested without
// loading the native ML Kit module (which pulls in react-native). Its behaviour is
// unchanged and frozen by tests/fixtures/scan-golden.json.
export type { PlayerCardScan, PlayerCardScanExtended } from './playerCardParse';
export { parsePlayerCard, parsePlayerCardText } from './playerCardParse';

const TIMEOUT_MS = 5000;

/**
 * Scan a player card screenshot.
 *
 * By default prepare a lossless PNG and give its URI to OCR and its pixels to
 * the glyph readers. A caller may supply matching RGBA pixels or explicitly
 * pass null for a text-only scan. Preparation failure abstains visibly.
 */
export async function scanPlayerCard(
  imageUri: string,
  image?: RgbaImage | null
): Promise<PlayerCardScanExtended> {
  return scanPlayerInput(imageUri, {
    prepare: preparePlayerScreenshot,
    recognize: async uri => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          TextRecognition.recognize(uri),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('ML Kit timed out — try the scan again.')), TIMEOUT_MS);
          }),
        ]) as unknown as OcrResult;
      } finally {
        clearTimeout(timer);
      }
    },
  }, image);
}
