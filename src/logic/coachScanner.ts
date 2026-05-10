import TextRecognition from '@react-native-ml-kit/text-recognition';

const COACH_TYPES = ['STANDARD', 'FOCUSED', 'EXTENSIVE'];
const COACH_CATEGORIES = ['ATTACKING', 'DEFENDING', 'PHYSICAL', 'SAFEGUARD'];
const KNOWN_TIERS = ['Legendary', 'Epic', 'Master', 'Stellar', 'Elite', 'Rare'];

export interface CoachScreenScan {
  coachType?: string;
  coachCategory?: string;
  multiplier?: number;
  tier?: string;
}

export async function scanCoachScreen(imageUri: string): Promise<CoachScreenScan> {
  const result = await TextRecognition.recognize(imageUri);
  const fullText = result.text;

  const coachType = COACH_TYPES.find(t => new RegExp(`\\b${t}\\b`, 'i').test(fullText));
  const coachCategory = COACH_CATEGORIES.find(c => new RegExp(`\\b${c}\\b`, 'i').test(fullText));

  // "x30", "×30", "X 30", or "30 sessions"
  const multMatch = /[x×X]\s*(\d+)/i.exec(fullText) ?? /(\d+)\s*sessions?/i.exec(fullText);
  const multiplier = multMatch ? parseInt(multMatch[1]) : undefined;

  const tier = KNOWN_TIERS.find(t => new RegExp(`\\b${t}\\b`, 'i').test(fullText));

  return { coachType, coachCategory, multiplier, tier };
}
