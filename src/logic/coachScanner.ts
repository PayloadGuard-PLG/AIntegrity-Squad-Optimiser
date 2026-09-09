import TextRecognition from '@react-native-ml-kit/text-recognition';
import { parseCoachPreview } from './coachPreviewParse';
import type { OcrResult } from './playerCardParse';

// Public compatibility surface. The parser is native-free so scanner behaviour
// can be exercised in Node against serialized ML Kit fixtures.
export { parseCoachPreview, COACH_TYPES, COACH_CATS } from './coachPreviewParse';
export type { CoachScanResult, CoachType, CoachCategory, StatCapture } from './coachPreviewParse';
export { resolvePlayerName, resolveTalentTier, resolvePlayerAge, TALENT_OPTIONS } from './coachIdentityParse';
export type { NameBlock, TalentOption } from './coachIdentityParse';

const TIMEOUT_MS = 5000;

export async function scanCoachPreview(imageUri: string) {
  const result = await Promise.race([
    TextRecognition.recognize(imageUri),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ML Kit timed out')), TIMEOUT_MS)
    ),
  ]);
  return parseCoachPreview(result as OcrResult);
}
