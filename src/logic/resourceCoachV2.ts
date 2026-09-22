import config from '../../profiles/resource_coach_v2.json';
import type { CoachSourceFamily, CoachTransferClass } from './coachTransfer';
import { isWhiteStat } from '../utils/roleWeights';

export const RESOURCE_MODEL = config;
export type DisplayClass = 'WHITE' | 'MID_GREY' | 'UNKNOWN';
export type ResourceStat = { stat: string; displayedStat: number; displayClass: DisplayClass; classSource: 'role-map' | 'manual-observed' };
export type ResourceProgrammeFamily = 'unknown' | 'drill-session' | 'skill-seminar';
export type ResourceInput = {
  playerId: string; age: number; tier: string; stateKey: string;
  sourceFamily: CoachSourceFamily; transferClass: CoachTransferClass; coachLabel: string; multiplier: number;
  programmeFamily?: ResourceProgrammeFamily;
  stats: ResourceStat[];
};
export type GainInterval = { stat: string; gainLo: number; gainHi: number };
export type ResourceObservation = {
  id: string; capturedAt: string; input: ResourceInput; intervals: GainInterval[];
  evidenceKind: 'observed-interval'; source: 'manual-confirmed-preview' | 'state-confirmed-preview';
  ovrBoost?: { gainLo: number; gainHi: number };
  predictionId?: string;
};
export type PlayerCalibration = {
  modelVersion: string; playerId: string; age: number; tier: string; stateKey: string;
  anchorId: string; anchorSignature: string; logHigh: number; logLow: number;
  penalty: number; capturedAt: string;
};
export type ResourcePrediction = {
  modelVersion: string; status: 'predicted' | 'unavailable';
  mode: 'cold-start' | 'player-calibrated' | 'unavailable'; reasons: string[];
  intervals: GainInterval[]; ovrBoost?: { gainLo: number; gainHi: number }; anchorId?: string;
};

const P = config.parameters;

/** Build affected-stat rows from persisted player state. Learning roles are not
 * part of Player.role, so they cannot make a stat white here. */
export function buildResourceStatsFromState(
  roles: string[],
  statValues: Record<string, number>,
  affectedStats: string[],
  overrides: Record<string, DisplayClass> = {},
): ResourceStat[] {
  return affectedStats.map(stat => {
    const override = overrides[stat];
    return {
      stat,
      displayedStat: statValues[stat],
      displayClass: override ?? (isWhiteStat(roles, stat) ? 'WHITE' : 'MID_GREY'),
      classSource: override ? 'manual-observed' : 'role-map',
    };
  });
}

/** Persisted player state is already the authority for starting value and
 * white/grey classification. A manual override is explicit evidence, not a
 * second confirmation gate. */
export function resourceStateConfirmed(
  roles: string[],
  statValues: Record<string, number>,
  rows: ResourceStat[],
): boolean {
  if (!rows.length) return false;
  return rows.every(row => {
    if (!Number.isFinite(row.displayedStat) || statValues[row.stat] !== row.displayedStat) return false;
    if (row.classSource === 'manual-observed') return row.displayClass === 'WHITE' || row.displayClass === 'MID_GREY';
    return row.displayClass === (isWhiteStat(roles, row.stat) ? 'WHITE' : 'MID_GREY');
  });
}
export function inputSignature(input: ResourceInput): string {
  return JSON.stringify({ playerId:input.playerId, age:input.age, tier:input.tier, stateKey:input.stateKey,
    sourceFamily:input.sourceFamily, transferClass:input.transferClass, multiplier:input.multiplier,
    stats:input.stats.map(({stat,displayedStat,displayClass})=>({stat,displayedStat,displayClass})).sort((a,b)=>a.stat.localeCompare(b.stat)) });
}
export function validateInput(input: ResourceInput): string[] {
  const reasons: string[] = [];
  if (input.sourceFamily !== 'resource-coach') {
    reasons.push(input.sourceFamily === 'training-camp'
      ? 'Training Camp is outside Resource Coach V2. Observed ranges can still be saved as Training Camp evidence.'
      : 'Confirm the programme/source family from game evidence.');
  } else if (input.transferClass !== 'ordinary') reasons.push(input.transferClass === 'reward'
    ? 'Reward transfer is not calibrated. Observed ranges can still be saved.'
    : 'Confirm the transfer class from game evidence.');
  if (!Number.isInteger(input.age) || input.age < 18 || input.age > 32) reasons.push('Age is outside the observed 18–32 support.');
  if (!/^T[0-6]$/.test(input.tier)) reasons.push('Confirm the player tier.');
  if (!Number.isFinite(input.multiplier) || input.multiplier <= 0) reasons.push('Enter a positive displayed multiplier.');
  if (!input.playerId || !input.stateKey) reasons.push('Player state is missing.');
  if (!input.stats.length || input.stats.length > 15 || new Set(input.stats.map(s => s.stat)).size !== input.stats.length) reasons.push('Select 1–15 distinct affected stats.');
  if (input.stats.some(s => !s.stat || !Number.isFinite(s.displayedStat) || !['WHITE','MID_GREY'].includes(s.displayClass))) reasons.push('Every affected stat needs a stored starting value and resolved white/grey class.');
  return reasons;
}

/** Exact inverse of the integrated response in the supplied transfer.py.
 * u is a tier-adjusted covariate, not a reconstructed historical base stat.
 * It may be negative; clamping it to zero would change the fitted law.
 */
export function integratedGain(u: number, age: number, exposure: number, upper = false, logHigh = 0, logLow = 0): number {
  const ls = Math.log(P.highRateAge28) + P.highAgeLogSlopePerYear * (age - 28) + logHigh;
  const lv = Math.log(P.lowRateAge28) + P.lowAgeLogSlopePerYear * (age - 28) + logLow;
  const h = P.K * (ls - lv);
  const b = Math.exp(lv) * exposure * (upper ? P.upperLatentRatio : 1);
  const gap = Math.max(h - u, 0);
  if (b <= gap) return b;
  return gap + P.K * Math.log1p((b - gap) / P.K * Math.exp(-Math.max(u - h, 0) / P.K));
}
function intervalsFor(input: ResourceInput, logHigh = 0, logLow = 0): GainInterval[] {
  const tierAddition = config.inputTransform.tierAdditions[Number(input.tier.slice(1))];
  return input.stats.map(s => {
    const u = s.displayedStat - (s.displayClass === 'WHITE' ? tierAddition : 0);
    const exposure = input.multiplier / input.stats.length * (s.displayClass === 'MID_GREY' ? P.greyExposureMultiplier : 1);
    // The supplied v2 deployment profile caps regular-source progression,
    // with white tier addition outside the cap. No raw displayed-400 gate.
    const remaining = Math.max(0, P.regularStatCap - u);
    return { stat: s.stat,
      gainLo: Math.min(remaining, integratedGain(u, input.age, exposure, false, logHigh, logLow)),
      gainHi: Math.min(remaining, integratedGain(u, input.age, exposure, true, logHigh, logLow)) };
  });
}
export function calibrationApplies(c: PlayerCalibration, input: ResourceInput): boolean {
  return c.modelVersion === config.modelVersion && c.playerId === input.playerId && c.age === input.age
    && c.tier === input.tier && c.stateKey === input.stateKey
    && c.anchorSignature !== inputSignature(input)
    && [c.logHigh,c.logLow].every(v => Number.isFinite(v) && Math.abs(v) <= 4);
}
export function predictResourceCoach(input: ResourceInput, calibration?: PlayerCalibration | null): ResourcePrediction {
  const reasons = validateInput(input);
  if (reasons.length) return { modelVersion: config.modelVersion, status: 'unavailable', mode: 'unavailable', reasons, intervals: [] };
  const c = calibration && calibrationApplies(calibration, input) ? calibration : null;
  const intervals = intervalsFor(input, c?.logHigh, c?.logLow);
  return { modelVersion: config.modelVersion, status: 'predicted', mode: c ? 'player-calibrated' : 'cold-start',
    reasons: ['Experimental preview ranges; not outcome probabilities.',
      'White/grey is derived from persisted established-role state; manual override is only for direct contradictory game evidence.',
      ...(calibration && !c ? ['Stored anchor is the same preview or no longer matches this player state; using cold start.'] : [])],
    intervals, ovrBoost: { gainLo: intervals.reduce((n,r) => n+r.gainLo,0)/15, gainHi: intervals.reduce((n,r) => n+r.gainHi,0)/15 },
    ...(c ? { anchorId: c.anchorId } : {}) };
}
export function validateObservation(o: ResourceObservation): void {
  if (!o.id || !o.capturedAt || !o.input.stats.length || !Number.isFinite(o.input.multiplier) || o.input.multiplier <= 0) throw Error('Incomplete preview identity.');
  if (!o.intervals.length || new Set(o.intervals.map(r => r.stat)).size !== o.intervals.length) throw Error('Enter distinct observed stat intervals.');
  for (const r of o.intervals) {
    if (!o.input.stats.some(s => s.stat === r.stat) || !Number.isFinite(r.gainLo) || !Number.isFinite(r.gainHi) || r.gainLo < 0 || r.gainHi < r.gainLo) throw Error('Each observed range needs 0 ≤ low ≤ high.');
  }
  if (o.ovrBoost && (!Number.isFinite(o.ovrBoost.gainLo) || !Number.isFinite(o.ovrBoost.gainHi) || o.ovrBoost.gainLo < 0 || o.ovrBoost.gainHi < o.ovrBoost.gainLo)) throw Error('Invalid observed OVR boost interval.');
}
/** Small deterministic bounded optimizer; two offsets only, frozen global model.
 * The anchor is never used to score itself. No training-rate selector input.
 */
export function fitPlayerCalibration(o: ResourceObservation): PlayerCalibration {
  validateObservation(o);
  const invalid = validateInput(o.input);
  if (invalid.length) throw Error(invalid.join(' '));
  if (o.intervals.length !== o.input.stats.length) throw Error('An anchor needs every affected-stat interval.');
  if (o.intervals.some(r => r.gainHi === 0)) throw Error('Zero-gain suppression is unresolved; preserve this observation without fitting an anchor.');
  const penalty = .2;
  const objective = (a: number, b: number) => intervalsFor(o.input,a,b).reduce((sum,r) => {
    const y = o.intervals.find(s => s.stat === r.stat)!;
    return sum + (Math.log1p(r.gainLo)-Math.log1p(y.gainLo))**2 + (Math.log1p(r.gainHi)-Math.log1p(y.gainHi))**2;
  }, penalty*(a*a+b*b));
  let best = { a: 0, b: 0, loss: objective(0,0) };
  for (const start of [[0,0],[-1,1],[1,-1]]) {
    let [a,b] = start, loss = objective(a,b);
    for (let step = 1; step > 1e-5; step /= 2) {
      for (let iteration = 0; iteration < 100; iteration++) {
        let next = {a,b,loss};
        for (const da of [-step,0,step]) for (const db of [-step,0,step]) {
          const aa = Math.max(-4,Math.min(4,a+da)), bb = Math.max(-4,Math.min(4,b+db));
          const ll = objective(aa,bb); if (ll < next.loss) next = {a:aa,b:bb,loss:ll};
        }
        if (next.loss >= loss) break;
        ({a,b,loss} = next);
      }
    }
    if (loss < best.loss) best = {a,b,loss};
  }
  return { modelVersion: config.modelVersion, playerId:o.input.playerId, age:o.input.age, tier:o.input.tier,
    stateKey:o.input.stateKey, anchorId:o.id, anchorSignature:inputSignature(o.input), logHigh:best.a,logLow:best.b,
    penalty,capturedAt:o.capturedAt };
}
