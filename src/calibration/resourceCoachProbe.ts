export interface Interval {
  lo: number;
  hi: number;
}

export interface ResourceCoachObservation {
  id: string;
  playerId: string;
  playerStateId: string;
  age: number;
  tier: string;
  displayedOvrBefore: number;
  programmeFamily: string;
  title: string;
  multiplier: number;
  affectedStatCount: number;
  affectedStats: string[];
  currentValues: Record<string, number>;
  statIntervals: Record<string, Interval>;
  ovrDelta: Interval;
  source: string;
  sourceRecord: string;
  stateChanged: boolean;
}

export interface ResourceCoachEvidenceCorpus {
  schemaVersion: 1;
  notes: string[];
  observations: ResourceCoachObservation[];
}

export interface EndpointResidual {
  lo: number;
  hi: number;
}

export interface TransformScore {
  endpointResiduals: Record<string, EndpointResidual>;
  endpointMAE: number;
  maxEndpointAbsoluteError: number;
}

export interface BudgetRatioResult {
  stat: string;
  ratio: Interval;
  expectedMultiplierRatio: number;
  admitsExpectedMultiplierRatio: boolean;
}

export function intervalEqual(a: Interval, b: Interval): boolean {
  return a.lo === b.lo && a.hi === b.hi;
}

function sameStatSet(a: ResourceCoachObservation, b: ResourceCoachObservation): boolean {
  const left = [...a.affectedStats].sort();
  const right = [...b.affectedStats].sort();
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

export function exactOutputEqual(a: ResourceCoachObservation, b: ResourceCoachObservation): boolean {
  const left = Object.keys(a.statIntervals).sort();
  const right = Object.keys(b.statIntervals).sort();
  if (left.length !== right.length || !left.every((value, i) => value === right[i])) return false;
  if (!left.every(stat => intervalEqual(a.statIntervals[stat], b.statIntervals[stat]))) return false;
  return intervalEqual(a.ovrDelta, b.ovrDelta);
}

export function programmeFamilyMatched(a: ResourceCoachObservation, b: ResourceCoachObservation): boolean {
  return a.playerId === b.playerId
    && a.playerStateId === b.playerStateId
    && a.title === b.title
    && a.multiplier === b.multiplier
    && a.affectedStatCount === b.affectedStatCount
    && sameStatSet(a, b);
}

export function multiplierMatched(a: ResourceCoachObservation, b: ResourceCoachObservation): boolean {
  return a.playerId === b.playerId
    && a.playerStateId === b.playerStateId
    && a.programmeFamily === b.programmeFamily
    && a.title === b.title
    && a.affectedStatCount === b.affectedStatCount
    && sameStatSet(a, b);
}

export function directOutputScale(interval: Interval, ratio: number): Interval {
  return { lo: interval.lo * ratio, hi: interval.hi * ratio };
}

/**
 * Conditional candidate only.
 *
 * Treats the displayed xN ratio as scaling a latent budget which is then mapped
 * through an exponential gain transform. K is supplied explicitly so this
 * function cannot silently promote the ordinary-coach K into resource-coach
 * truth.
 */
export function latentBudgetScale(
  interval: Interval,
  ratio: number,
  K: number,
  q = 1,
): Interval {
  const scale = Math.pow(ratio, q);
  const map = (gain: number) =>
    K * Math.log(1 + scale * (Math.exp(gain / K) - 1));
  return { lo: map(interval.lo), hi: map(interval.hi) };
}

export function scoreTransform(
  reference: ResourceCoachObservation,
  observed: ResourceCoachObservation,
  transform: (interval: Interval) => Interval,
): TransformScore {
  const residuals: Record<string, EndpointResidual> = {};
  const errors: number[] = [];

  for (const stat of Object.keys(reference.statIntervals)) {
    const target = observed.statIntervals[stat];
    if (!target) continue;
    const predicted = transform(reference.statIntervals[stat]);
    const residual = {
      lo: target.lo - predicted.lo,
      hi: target.hi - predicted.hi,
    };
    residuals[stat] = residual;
    errors.push(Math.abs(residual.lo), Math.abs(residual.hi));
  }

  return {
    endpointResiduals: residuals,
    endpointMAE: errors.length === 0 ? Number.NaN : errors.reduce((a, b) => a + b, 0) / errors.length,
    maxEndpointAbsoluteError: errors.length === 0 ? Number.NaN : Math.max(...errors),
  };
}

/**
 * Cost-integral proxy. Multiplicative constants cancel when ratios are taken, so
 * this intentionally omits C0 and any player multiplier. It is a conditional
 * probe for the shape implied by K, not a production XP calculation.
 */
export function latentBudgetProxy(startStat: number, gain: number, K: number): number {
  return Math.exp((startStat + gain) / K) - Math.exp(startStat / K);
}

export function latentBudgetProxyInterval(
  startStat: number,
  gain: Interval,
  K: number,
): Interval {
  return {
    lo: latentBudgetProxy(startStat, gain.lo, K),
    hi: latentBudgetProxy(startStat, gain.hi, K),
  };
}

/**
 * If total budget is shared equally across p affected stats, then
 * B_total is proportional to p * B_perStat. For the same player/stat state,
 * this yields an admitted total-budget ratio interval without using midpoints.
 */
export function admittedSharedBudgetRatio(
  a: ResourceCoachObservation,
  b: ResourceCoachObservation,
  stat: string,
  K: number,
): BudgetRatioResult {
  const startA = a.currentValues[stat];
  const startB = b.currentValues[stat];
  if (startA === undefined || startB === undefined) {
    throw new Error(`${stat}: missing current value`);
  }
  if (startA !== startB) {
    throw new Error(`${stat}: player state differs (${startA} vs ${startB})`);
  }

  const gainA = a.statIntervals[stat];
  const gainB = b.statIntervals[stat];
  if (!gainA || !gainB) throw new Error(`${stat}: missing observed interval`);

  const proxyA = latentBudgetProxyInterval(startA, gainA, K);
  const proxyB = latentBudgetProxyInterval(startB, gainB, K);

  const ratio = {
    lo: (a.affectedStatCount * proxyA.lo) / (b.affectedStatCount * proxyB.hi),
    hi: (a.affectedStatCount * proxyA.hi) / (b.affectedStatCount * proxyB.lo),
  };
  const expectedMultiplierRatio = a.multiplier / b.multiplier;

  return {
    stat,
    ratio,
    expectedMultiplierRatio,
    admitsExpectedMultiplierRatio:
      expectedMultiplierRatio >= ratio.lo && expectedMultiplierRatio <= ratio.hi,
  };
}

export function findObservation(
  corpus: ResourceCoachEvidenceCorpus,
  id: string,
): ResourceCoachObservation {
  const hit = corpus.observations.find(observation => observation.id === id);
  if (!hit) throw new Error(`Unknown resource-coach observation: ${id}`);
  return hit;
}

export interface DataRequirement {
  priority: number;
  status: 'required' | 'desirable' | 'deferred';
  question: string;
  exactObservation: string;
  holdConstant: string[];
  change: string[];
  capture: string[];
  reason: string;
  completionRule: string;
}

export function requiredNextData(): DataRequirement[] {
  return [
    {
      priority: 1,
      status: 'required',
      question: 'Is shared resource-coach budget divided approximately by affected-stat count (1/p), or is the current signal actually a coach-shape effect?',
      exactObservation: 'Same player state, same programme family, same displayed multiplier, two non-Reward resource coaches with different affected-stat counts and at least one overlapping affected stat.',
      holdConstant: [
        'player and exact player state',
        'programme family',
        'displayed multiplier',
        'overlapping stat starting value',
        'Reward status = false',
      ],
      change: [
        'affected-stat count',
        'coach targeting shape only as required to obtain the different stat count',
      ],
      capture: [
        'player name/id',
        'age',
        'tier',
        'displayed OVR',
        'all 15 current stats',
        'coach programme family',
        'coach title',
        'displayed multiplier',
        'affected stat set',
        'every displayed +lo-hi interval',
        'displayed OVR +lo-hi interval',
        'source screenshot ids',
      ],
      reason: 'Existing McCluskey evidence is compatible with 1/p allocation, but coach shape and affected-stat count still change together. The multiplier-response law now has independent same-state replications, so multiplier no longer needs a new observation before this test.',
      completionRule: 'At least one exact overlapping stat must have the same starting value in both previews; otherwise the pair does not isolate allocation.',
    },
    {
      priority: 2,
      status: 'deferred',
      question: 'Is remaining stat-level structure explained by current stat cost and/or white-grey class?',
      exactObservation: 'Within one multi-stat resource-coach preview, obtain two affected stats with widely separated starting values but the same white-grey class; ideally also a similarly valued white/grey pair.',
      holdConstant: [
        'player',
        'age',
        'tier',
        'coach',
        'displayed multiplier',
        'affected-stat count',
      ],
      change: [
        'starting stat value for the stat-cost contrast',
        'white-grey class for the class contrast',
      ],
      capture: [
        'all 15 stats and display classes',
        'affected stat set',
        'all +lo-hi intervals',
      ],
      reason: 'Do this after allocation is better isolated so stat-cost and class effects do not absorb an allocation error.',
      completionRule: 'Only promote this test once priority 1 is resolved or impossible with the available roster.',
    },
  ];
}

export function analyseResourceCoachEvidence(
  corpus: ResourceCoachEvidenceCorpus,
  conditionalK = 47,
) {
  const howdenCamp106 = findObservation(corpus, 'HOWDEN-X106-TRAINING-CAMP');
  const howdenDrill106 = findObservation(corpus, 'HOWDEN-X106-DRILL-SESSION');
  const howdenDrill114 = findObservation(corpus, 'HOWDEN-X114-DRILL-SESSION');

  const mccluskey65 = findObservation(corpus, 'MCCLUSKEY-X65-DRILL-SESSION');
  const mccluskey106 = findObservation(corpus, 'MCCLUSKEY-X106-DRILL-SESSION');
  const mccluskey114 = findObservation(corpus, 'MCCLUSKEY-X114-DRILL-SESSION');

  const ripley106 = findObservation(corpus, 'RIPLEY-X106-DRILL-SESSION');
  const ripley114 = findObservation(corpus, 'RIPLEY-X114-DRILL-SESSION');

  const scoreMultiplierPair = (
    name: string,
    reference: ResourceCoachObservation,
    observed: ResourceCoachObservation,
  ) => {
    const ratio = observed.multiplier / reference.multiplier;
    return {
      name,
      matchedInputs: multiplierMatched(reference, observed),
      from: reference.multiplier,
      to: observed.multiplier,
      outputChanged: !exactOutputEqual(reference, observed),
      directOutputScaling: scoreTransform(
        reference,
        observed,
        interval => directOutputScale(interval, ratio),
      ),
      conditionalLatentBudgetQ1: scoreTransform(
        reference,
        observed,
        interval => latentBudgetScale(interval, ratio, conditionalK, 1),
      ),
    };
  };

  const multiplierReplications = [
    scoreMultiplierPair('HOWDEN', howdenDrill106, howdenDrill114),
    scoreMultiplierPair('MCCLUSKEY', mccluskey106, mccluskey114),
    scoreMultiplierPair('RIPLEY', ripley106, ripley114),
  ];

  const allocation = ['MARKING', 'AGGRESSION'].map(stat =>
    admittedSharedBudgetRatio(mccluskey65, mccluskey106, stat, conditionalK)
  );

  return {
    conditionalK,
    programmeFamily: {
      matchedInputs: programmeFamilyMatched(howdenCamp106, howdenDrill106),
      changedField: 'programmeFamily',
      outputsExactlyEqual: exactOutputEqual(howdenCamp106, howdenDrill106),
    },
    multiplier: {
      changedField: 'multiplier',
      replications: multiplierReplications,
      independentSameStateReplicationCount: multiplierReplications.length,
      allPairsMatched: multiplierReplications.every(row => row.matchedInputs),
      allPairsShowOutputChange: multiplierReplications.every(row => row.outputChanged),
      latentBeatsDirectCount: multiplierReplications.filter(
        row => row.conditionalLatentBudgetQ1.endpointMAE < row.directOutputScaling.endpointMAE
      ).length,
    },
    allocation: {
      comparison: `${mccluskey65.id} vs ${mccluskey106.id}`,
      confounds: ['coach title/shape', 'affected-stat count'],
      normalizedMultiplierConfoundStatus:
        'A separate x106->x114 response is now replicated on Howden, McCluskey and Ripley; no new multiplier-replication screenshot is required before the allocation test.',
      conditionalK,
      sharedBudgetOneOverP: allocation,
    },
    dataRequiredNext: requiredNextData(),
  };
}
