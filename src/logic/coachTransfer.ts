/**
 * Transfer classification is an observed fact, not a boolean default.
 *
 * Standard / Focused / Extensive describe the coach's targeting shape. Reward
 * Coaches use those same labels, so none of them is evidence that the ordinary
 * Academy transfer function applies.
 */
export type CoachTransferClass = 'ordinary' | 'reward' | 'unresolved';
export type CoachSourceFamily = 'resource-coach' | 'training-camp' | 'unresolved';
export type CoachProgrammeFamily = 'unknown' | 'drill-session' | 'skill-seminar';
export type CoachClassificationSource = 'ocr-observed' | 'manual-confirmed' | 'unresolved';

function canonicalCoachLabels(fullText: string): string {
  return (fullText ?? '').replace(/\bC0ACH\b/gi, 'COACH');
}

/** Source/programme family is a separate observation from transfer class. */
export function classifyCoachSource(fullText: string): CoachSourceFamily {
  const text = canonicalCoachLabels(fullText);
  if (/\btraining\s*camp\b/i.test(text)) return 'training-camp';
  if (/\b(?:drill\s*session|skill\s*seminar)\b/i.test(text)) return 'resource-coach';
  if (/\b(?:reward|academy|ordinary)\s*coach\b|\bcoach\s*academy\b/i.test(text)) return 'resource-coach';
  return 'unresolved';
}

export function classifyCoachProgramme(fullText: string): CoachProgrammeFamily {
  const text = canonicalCoachLabels(fullText);
  if (/\bdrill\s*session\b/i.test(text)) return 'drill-session';
  if (/\bskill\s*seminar\b/i.test(text)) return 'skill-seminar';
  return 'unknown';
}

export function classifyCoachTransfer(fullText: string): CoachTransferClass {
  const text = canonicalCoachLabels(fullText);
  if (/\breward\s*coach\b/i.test(text)) return 'reward';
  if (/\b(?:academy|ordinary)\s*coach\b|\bcoach\s*academy\b/i.test(text)) return 'ordinary';
  return 'unresolved';
}

/** Legacy/malformed rows cannot acquire ordinary status from a fallback value. */
export function normalisePersistedCoachTransferClass(
  value: unknown,
  source: unknown,
): CoachTransferClass {
  if (!['observed', 'ocr-observed', 'manual-confirmed'].includes(String(source))) return 'unresolved';
  if (value === 'reward' || value === 'ordinary') return value;
  return 'unresolved';
}

/** Legacy rows have no trustworthy programme/source-family provenance. */
export function normalisePersistedCoachSourceFamily(
  value: unknown,
  source: unknown,
): CoachSourceFamily {
  if (!['observed', 'ocr-observed', 'manual-confirmed'].includes(String(source))) return 'unresolved';
  if (value === 'resource-coach' || value === 'training-camp') return value;
  return 'unresolved';
}

export function normaliseCoachClassificationSource(source: unknown): CoachClassificationSource {
  if (source === 'observed' || source === 'ocr-observed') return 'ocr-observed';
  if (source === 'manual-confirmed') return 'manual-confirmed';
  return 'unresolved';
}
