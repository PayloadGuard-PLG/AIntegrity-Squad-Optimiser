import profile from '../../profiles/resource_coach_candidate_20260922.json';
import type { ResourceInput, GainInterval } from './resourceCoachV2';

export const RESOURCE_CALIBRATION_CANDIDATE = profile;

export type CandidatePrediction = {
  modelVersion: string;
  status: 'predicted' | 'unavailable';
  reasons: string[];
  intervals: GainInterval[];
  ovrBoost?: { gainLo: number; gainHi: number };
};

const R = profile.response;
const D = profile.dose;

export function candidateAgeScale(age: number): number | null {
  const band = D.ageBands.find(b => age >= b.minAge && age <= b.maxAge);
  return band?.scale ?? null;
}

export function candidateTierCoordinate(
  displayedStat: number,
  tier: string,
  displayClass: 'WHITE' | 'MID_GREY' | 'UNKNOWN',
): number {
  const tierIndex = /^T[0-6]$/.test(tier) ? Number(tier.slice(1)) : -1;
  if (tierIndex < 0) return Number.NaN;
  return displayClass === 'WHITE'
    ? displayedStat - R.tierAdditions[tierIndex]
    : displayedStat;
}

/**
 * Invert the candidate marginal-cost curve:
 *   C(x)=1                          x <= h
 *   C(x)=exp(beta * (x - h))        x > h
 *
 * Return latent movement J such that integral_u^(u+J) C(x) dx = dose.
 * This is deliberately independent of the below-zero renderer.
 */
export function latentMovement(
  u: number,
  displayClass: 'WHITE' | 'MID_GREY',
  dose: number,
): number {
  if (!Number.isFinite(u) || !Number.isFinite(dose) || dose <= 0) return 0;
  const h = displayClass === 'WHITE' ? R.whiteThreshold : R.greyThreshold;
  const beta = R.beta;

  if (u < h) {
    const flatDistance = h - u;
    if (dose <= flatDistance) return dose;
    const remainder = dose - flatDistance;
    return flatDistance + Math.log1p(beta * remainder) / beta;
  }

  return Math.log1p(beta * dose * Math.exp(-beta * (u - h))) / beta;
}

/**
 * Observable gain after the negative-coordinate rectifier.
 *
 * A negative transformed coordinate carries latent movement without necessarily
 * showing a positive displayed gain:
 *   g = max(0, u + J) - max(0, u)
 */
export function displayedGainFromLatent(u: number, latent: number): number {
  return Math.max(0, u + latent) - Math.max(0, u);
}

export function candidateDose(
  input: Pick<ResourceInput, 'age' | 'multiplier' | 'transferClass' | 'stats'>,
): number | null {
  const ageScale = candidateAgeScale(input.age);
  if (ageScale == null || !Number.isFinite(input.multiplier) || input.multiplier <= 0 || input.stats.length === 0) return null;
  if (input.transferClass === 'unresolved') return null;

  const rewardScale = input.transferClass === 'reward' ? D.rewardScale : 1;
  return ageScale * rewardScale
    * Math.pow(input.multiplier, D.multiplierExponent)
    / Math.pow(input.stats.length, D.affectedStatExponent);
}

export function predictCalibrationCandidate(input: ResourceInput): CandidatePrediction {
  const reasons: string[] = [
    'CALIBRATION CANDIDATE ONLY — do not treat as the production transfer law.',
    'Tier-adjusted coordinate and below-zero rectification are the strongest surviving structural components.',
    'The shared N^q/p^eta dose is a diagnostic hypothesis; programme-family dose laws remain unresolved.',
    'Approximate OVR boost is sum of predicted stat endpoints divided by 15; the exact game renderer is unresolved.',
  ];

  if (!/^T[0-6]$/.test(input.tier)) {
    return { modelVersion: profile.modelVersion, status: 'unavailable', reasons:[...reasons,'Tier is unresolved.'], intervals:[] };
  }
  if (!input.stats.length || input.stats.some(s =>
    !Number.isFinite(s.displayedStat) || !['WHITE','MID_GREY'].includes(s.displayClass)
  )) {
    return { modelVersion: profile.modelVersion, status: 'unavailable', reasons:[...reasons,'Starting stats/classes are incomplete.'], intervals:[] };
  }

  const baseDose = candidateDose(input);
  if (baseDose == null) {
    return { modelVersion: profile.modelVersion, status: 'unavailable', reasons:[...reasons,'Resolve ordinary versus Reward before applying a dose scale.'], intervals:[] };
  }

  const intervals = input.stats.map(s => {
    const displayClass = s.displayClass as 'WHITE' | 'MID_GREY';
    const u = candidateTierCoordinate(s.displayedStat, input.tier, displayClass);
    const loLatent = latentMovement(u, displayClass, baseDose);
    const hiLatent = latentMovement(u, displayClass, baseDose * R.upperDoseRatio);
    return {
      stat: s.stat,
      gainLo: displayedGainFromLatent(u, loLatent),
      gainHi: displayedGainFromLatent(u, hiLatent),
    };
  });

  return {
    modelVersion: profile.modelVersion,
    status: 'predicted',
    reasons,
    intervals,
    ovrBoost: {
      gainLo: intervals.reduce((sum, r) => sum + r.gainLo, 0) / 15,
      gainHi: intervals.reduce((sum, r) => sum + r.gainHi, 0) / 15,
    },
  };
}
