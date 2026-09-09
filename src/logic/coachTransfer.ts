/**
 * Transfer classification is an observed fact, not a boolean default.
 *
 * Standard / Focused / Extensive describe the coach's targeting shape. Reward
 * Coaches use those same labels, so none of them is evidence that the ordinary
 * Academy transfer function applies.
 */
export type CoachTransferClass = 'ordinary' | 'reward' | 'unresolved';

export function classifyCoachTransfer(fullText: string): CoachTransferClass {
  // High-contrast all-caps labels routinely turn the O in COACH into zero.
  // Correct that narrow label confusable before applying exact word evidence.
  const text = (fullText ?? '').replace(/\bC0ACH\b/gi, 'COACH');
  if (/\breward\s*coach\b/i.test(text)) return 'reward';
  if (/\b(?:academy|ordinary)\s*coach\b|\bcoach\s*academy\b/i.test(text)) return 'ordinary';
  return 'unresolved';
}

/** Legacy/malformed rows cannot acquire ordinary status from a fallback value. */
export function normalisePersistedCoachTransferClass(
  value: unknown,
  source: unknown,
): CoachTransferClass {
  if (source !== 'observed') return 'unresolved';
  if (value === 'reward' || value === 'ordinary') return value;
  return 'unresolved';
}
