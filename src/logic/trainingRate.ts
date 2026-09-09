import type { TalentTier } from '../types/resources';

/** Where the stored training-rate value came from. */
export type TrainingRateSource = 'card' | 'manual' | 'unresolved' | 'legacy-default';

const TALENT_TIERS = new Set<TalentTier>([
  'Fastest', 'Fast', 'Average', 'Normal', 'Slow', 'Unknown',
]);

export function normaliseStoredTrainingRate(value: unknown): TalentTier {
  if (value === 'FT1') return 'Fastest';
  if (value === 'FT2') return 'Fast';
  if (value === 'FT3') return 'Average';
  return TALENT_TIERS.has(value as TalentTier) ? value as TalentTier : 'Unknown';
}

export function normaliseTrainingRateSource(value: unknown): TrainingRateSource {
  return value === 'card' || value === 'manual' || value === 'unresolved'
    ? value
    : 'legacy-default';
}

export interface StoredTrainingRateObservation {
  talent: TalentTier;
  talentSource: TrainingRateSource;
}

/**
 * A card observation is independent of whether any stat rows were readable.
 * Missing talent leaves the prior observation intact; a present but unknown
 * label remains Unknown and is still attributed to the card.
 */
export function ingestCardTrainingRate(
  current: StoredTrainingRateObservation,
  scannedTalent: unknown,
): StoredTrainingRateObservation {
  if (typeof scannedTalent !== 'string' || scannedTalent.trim() === '') return current;
  return {
    talent: normaliseStoredTrainingRate(scannedTalent),
    talentSource: 'card',
  };
}

export function trainingRateSourceLabel(source: TrainingRateSource): string {
  switch (source) {
    case 'card': return 'FROM CARD';
    case 'manual': return 'MANUAL OBSERVATION';
    case 'unresolved': return 'NOT OBSERVED';
    case 'legacy-default': return 'LEGACY SOURCE UNKNOWN';
  }
}
