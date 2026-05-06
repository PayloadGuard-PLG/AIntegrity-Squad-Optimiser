import { SessionType } from '../types/resources';

/**
 * Age factor: how much training benefit a player receives relative to age 18.
 * Calibrated from screenshot data:
 *   Age 18 → +14–22 OVR per ×30; Age 20 → +4–5; Age 21 → +2–3; Age 27 → +2–3
 * TODO: Refine exact thresholds once research docs are committed to repo.
 */
export function getAgeFactor(age: number): number {
  if (age <= 19) return 1.00;
  if (age <= 20) return 0.55;
  if (age <= 21) return 0.40;
  if (age <= 23) return 0.30;
  if (age <= 25) return 0.22;
  return 0.16;
}

/**
 * Stat-level gain factor based on observed training data.
 * Higher current stat → lower per-session gain (diminishing returns).
 * Hard cap: stats at 436 give exactly 0 gain (confirmed in-game).
 *
 * Calibration table (×30 coach, age 18, single stat):
 *   stat ~61  → ~2.0 per multiplier unit
 *   stat ~97  → ~1.57
 *   stat ~121 → ~0.98
 *   stat ~132 → ~0.78
 *   stat ~312 → ~0.32  (normalized from age-27 data)
 *   stat 436  → 0.00
 *
 * TODO: Replace with verified formula from research docs.
 */
export function getStatGainFactor(statValue: number): number {
  if (statValue >= 436) return 0;

  // Piecewise linear interpolation through observed calibration points
  const table: [number, number][] = [
    [0,   2.40],
    [60,  2.03],
    [90,  1.73],
    [97,  1.57],
    [110, 1.25],
    [121, 0.98],
    [132, 0.78],
    [190, 0.55],
    [232, 0.42],
    [290, 0.32],
    [380, 0.10],
    [436, 0.00],
  ];

  for (let i = 0; i < table.length - 1; i++) {
    const [s0, f0] = table[i];
    const [s1, f1] = table[i + 1];
    if (statValue >= s0 && statValue <= s1) {
      const t = (statValue - s0) / (s1 - s0);
      return f0 + t * (f1 - f0);
    }
  }
  return 0;
}

/**
 * Seminar sessions appear to yield higher OVR gains than standard Training
 * at the same multiplier. Observed ~1.6× uplift from Mixed ×25 Seminar data.
 * TODO: Verify with research docs.
 */
export function getSessionBonus(sessionType: SessionType): number {
  return sessionType === 'Seminar' ? 1.6 : 1.0;
}

/**
 * Estimates total OVR gain from applying a single coach card to a player.
 * This is the primary function the investment engine calls.
 *
 * @param multiplier   - The ×N value from the coach card (e.g. 30)
 * @param sessionType  - 'Training' (free) or 'Seminar' (premium, higher rate)
 * @param age          - Player age
 * @param whiteStats   - Current values of the player's white (role-essential) stats
 * @param greyStats    - Current values of non-essential role stats (contribute less to OVR)
 */
export function estimateOvrGainFromCoach(
  multiplier: number,
  sessionType: SessionType,
  age: number,
  whiteStats: number[],
  greyStats: number[] = []
): number {
  const ageFactor = getAgeFactor(age);
  const sessionBonus = getSessionBonus(sessionType);

  // White stats contribute fully to OVR; grey/irrelevant stats contribute ~10%
  const whiteGain = whiteStats.reduce(
    (sum, s) => sum + multiplier * ageFactor * sessionBonus * getStatGainFactor(s),
    0
  );
  const greyGain = greyStats.reduce(
    (sum, s) => sum + multiplier * ageFactor * sessionBonus * getStatGainFactor(s) * 0.1,
    0
  );

  // OVR is a weighted composite across all ~16 stats; this normalises to OVR scale.
  // Calibrated from screenshot data: ×30 coach on age-18 player at OVR 114 → ~+8-9 OVR.
  // TODO: Refine with research docs.
  const OVR_NORMALIZER = 16;
  return Number(((whiteGain + greyGain) / OVR_NORMALIZER).toFixed(1));
}

/**
 * Legacy function — kept for backward compatibility with existing tests.
 * Prefer estimateOvrGainFromCoach for new investment engine code.
 */
export function calculateDynamicGain(
  multiplier: number,
  age: number,
  isWhiteSkill: boolean,
  currentAttribute: number
): number {
  const ageFactor = getAgeFactor(age);
  const skillModifier = isWhiteSkill ? 1.0 : 0.4;
  const statFactor = getStatGainFactor(currentAttribute);
  const result = multiplier * ageFactor * skillModifier * statFactor;
  return Number(result.toFixed(4));
}
