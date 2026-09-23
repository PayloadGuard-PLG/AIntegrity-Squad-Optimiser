import TextRecognition from '@react-native-ml-kit/text-recognition';
import { parseCoachPreview } from './coachPreviewParse';
import type { OcrResult } from './playerCardParse';
import { preparePlayerScreenshot } from './preparePlayerScreenshot';
import { detectCoachArrowTargets } from './coachTargetGlyphReader';

// Public compatibility surface. The parser is native-free so scanner behaviour
// can be exercised in Node against serialized ML Kit fixtures.
export { parseCoachPreview, COACH_TYPES, COACH_CATS } from './coachPreviewParse';
export type { CoachScanResult, CoachType, CoachCategory, StatCapture } from './coachPreviewParse';
export { resolvePlayerName, resolveTalentTier, resolvePlayerAge, TALENT_OPTIONS } from './coachIdentityParse';
export type { NameBlock, TalentOption } from './coachIdentityParse';

const TIMEOUT_MS = 5000;

export async function scanCoachPreview(imageUri: string) {
  const prepared = await preparePlayerScreenshot(imageUri);
  try {
    const result = await Promise.race([
      TextRecognition.recognize(prepared.uri),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ML Kit timed out')), TIMEOUT_MS)
      ),
    ]) as OcrResult;

    const parsed = parseCoachPreview(result);
    const glyphTargets = detectCoachArrowTargets(result, prepared.image);
    if (!glyphTargets.length) return parsed;

    const textTargets = new Set(parsed.affectedStats);
    const merged = Array.from(new Set([...parsed.affectedStats, ...glyphTargets]));
    const glyphAdded = glyphTargets.some(stat => !textTargets.has(stat));
    return {
      ...parsed,
      affectedStats: merged,
      targetEvidenceSource: parsed.affectedStats.length && glyphAdded
        ? 'mixed-observed'
        : glyphAdded
          ? 'glyph-observed'
          : parsed.targetEvidenceSource,
    };
  } finally {
    await prepared.dispose().catch(() => undefined);
  }
}
