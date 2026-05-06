# Squad Optimiser — Technical Whitepaper

**Version 0.2 — Sprint 2**

---

## 1. Purpose

Squad Optimiser is a decision-support tool for mobile football management games that use a stat-based OVR (Overall Rating) system. Its goal is deterministic, pre-spend investment planning: given a fixed resource pool and a set of player candidates, output a ranked, step-by-step plan that tells the manager exactly what to apply, in what order, and what final OVR each player will reach.

This document describes the underlying models, calibration methodology, data structures, and known limitations.

---

## 2. Core Model Overview

The OVR projection pipeline has three stages, applied in strict order:

```
Coaches  →  Tier Upgrade  →  Greens
```

This order is not arbitrary — it is a hard mechanical constraint. Applying coaches after a tier upgrade wastes potential gain because the gain formula is sensitive to the player's current stat levels; higher-tier brackets start at higher stat baselines, where diminishing returns reduce per-session gain. The engine enforces this order and rejects any plan that violates it.

---

## 3. Coach Gain Formula

### 3.1 Function signature

```typescript
estimateOvrGainFromCoach(
  multiplier: number,      // The ×N value from the coach card
  sessionType: SessionType, // 'Training' | 'Seminar'
  age: number,
  whiteStats: number[],    // Role-essential stats this coach trains
  greyStats: number[]      // Non-essential stats this coach trains
): number                  // Projected OVR gain
```

### 3.2 Component factors

**Age factor** (`getAgeFactor`)

| Age | Factor |
|---|---|
| ≤ 19 | 1.00 |
| ≤ 20 | 0.55 |
| ≤ 21 | 0.40 |
| ≤ 23 | 0.30 |
| ≤ 25 | 0.22 |
| 26+  | 0.16 |

Calibrated from observed training data showing a sharp drop between age 18 and 20, and a plateau from age 25 onward.

**Stat gain factor** (`getStatGainFactor`)

Piecewise linear interpolation over the following calibration table:

| Stat value | Gain factor |
|---|---|
| 0   | 2.40 |
| 60  | 2.03 |
| 90  | 1.73 |
| 97  | 1.57 |
| 110 | 1.25 |
| 121 | 0.98 |
| 132 | 0.78 |
| 190 | 0.55 |
| 232 | 0.42 |
| 290 | 0.32 |
| 380 | 0.10 |
| 436 | 0.00 |

The hard cap at maximum stat value (factor = 0.00) is confirmed — sessions applied to a maxed stat yield exactly zero gain. The curve models the non-linear diminishing returns observed empirically across players of varying OVR.

**Session type bonus** (`getSessionBonus`)

| Session type | Multiplier |
|---|---|
| Training  | 1.00 |
| Seminar   | 1.60 |

Skill Seminar sessions consistently produce higher OVR gains than equivalent Training sessions at the same coach multiplier. The 1.6× factor is derived from comparative observations across multiple player/OVR combinations and holds across age groups.

**White vs grey stat weight**

Stats listed in a player's role white-list (role-essential) contribute fully to OVR. Stats outside that list contribute approximately 10% of their trained value to OVR. This 0.1 grey weight is conservative and aligns with observed data — grey stat coaching is not wasted, but returns are minor.

### 3.3 Composite formula

```
whiteGain = Σ (multiplier × ageFactor × sessionBonus × statGainFactor(stat))
             for each white stat trained by this coach

greyGain  = Σ (multiplier × ageFactor × sessionBonus × statGainFactor(stat) × 0.1)
             for each grey stat trained by this coach

ovrGain = (whiteGain + greyGain) / OVR_NORMALIZER
```

`OVR_NORMALIZER = 16` — derived from the observed number of stats contributing to OVR. Dividing by the count of stats trained by a single coach (typically 3–5) inflated projections by 3–4×; dividing by the total contributing stat count (16) aligns output with observed post-coaching OVR deltas.

### 3.4 Calibration data points

| Age | OVR before | Coach | Session | Observed gain |
|---|---|---|---|---|
| 18 | 88  | Attacking ×30 | Training | +17–22 |
| 18 | 92.9 | Attacking ×30 | Training | +14–17 |
| 18 | 114 | Attacking ×30 | Training | +7–9 |
| 18 | 114 | Mixed ×25     | Seminar  | +12–14 |
| 20 | 231.9 | Attacking ×30 | Training | +4–5 |
| 21 | 194.8 | Attacking ×30 | Training | +2–3 |
| 27 | 289.7 | Attacking ×30 | Training | +2–3 |
| 27 | 289.7 | Mixed ×25     | Seminar  | +6–8 |

> **Note:** The Mixed ×25 Seminar data point for OVR 114 (+12–14 vs +7–9 for Attacking ×30 Training) is explained by role composition: the player's defensive stats (low 60s–80s) have significantly higher gain factors than their attack stats (100s), so a coach training mixed attributes yields disproportionately high OVR gain when defence sits in the steeper part of the stat curve.

### 3.5 Known approximations

The current formula is empirically calibrated. It produces projections within the observed ranges above but should be treated as an approximation until the formula derivation from primary research is incorporated. The function signature is stable and will not change when the body is updated from research docs.

---

## 4. Tier Upgrade Model

Tier upgrades provide a flat OVR bonus applied after all coaching is complete.

| Tier | OVR Bonus | Point Cost |
|---|---|---|
| None      | 0   | 0   |
| Rare      | 5   | 100 |
| Elite     | 15  | 250 |
| Stellar   | 50  | 600 |
| Master    | 100 | 1200 |
| Epic      | 180 | 2500 |
| Legendary | 300 | 5000 |

*Values sourced from in-app observation. Subject to revision as further data is collected.*

The engine checks available tier points against the cost before planning. A warning is emitted if the target tier is unaffordable.

---

## 5. Green Efficiency Model

Greens provide an incremental OVR boost. Base rate: 1 OVR per 15 greens.

Premium sponsor path provides a 1.3× efficiency multiplier on greens, derived from observed performance on accounts with Elite Chest access.

```
greenOvrGain = (greens / 15) × (isPremiumSponsor ? 1.3 : 1.0)
```

---

## 6. Role and Stat Classification

Each player role defines:
- **Essential stats** (white) — directly drive OVR for this role; receive full weight in gain calculations
- **Secondary stats** (grey) — trained but contribute minimally to OVR for this role

Role adjacency is validated at player creation. Only adjacent roles may be combined (e.g. ST+AMC is valid; ST+DC is not). This prevents nonsensical dual-role combinations that would distort OVR projections.

---

## 7. Manager Style Filtering

Before any projection is run, the coach list is filtered by manager style:

| Style | Coach pool |
|---|---|
| FTP    | Owned coaches only (source ≠ `Store`) |
| Hybrid | Owned + store coaches within `storeBudget` (token cost accumulates) |
| PTW    | All coaches regardless of cost |

Store budget tracking in Hybrid mode is first-come-first-served by order in the coach list. No optimisation of store purchase order is performed in the current version.

---

## 8. Drill Optimiser

Separate from the investment engine, the drill optimiser recommends training drills that maximise skill development for a player's role while minimising condition cost.

**Condition model (`conditionEngine.ts`):**

Base condition loss per drill is modified by Fan Club level:

| Fan Club Level | Condition multiplier |
|---|---|
| L0 | 0.90 |
| L1 | 0.85 |
| L2 | 0.80 |
| L3 | 0.75 |
| L4 | 0.50 |

**Zero-Drain Protocol:**

At Fan Club L4 with chants active on Very Easy drills, condition loss rounds to 0%. This is a degenerate case the engine detects and flags — it allows unlimited drill repetitions at no resource cost, making it the dominant strategy for intensive training periods.

---

## 9. Data Structures

### Player

```typescript
interface Player {
  id: string;
  name: string;
  role: string[];          // Up to 3 roles, must be adjacent
  age: number;
  overall: number;         // Current OVR
  tier: TierName;
  stats: Record<string, number>;
  isMutantCandidate: boolean;
}
```

### Coach

```typescript
interface Coach {
  id: string;
  type: 'Attacking' | 'Defending' | 'Physical' | 'Mixed' | 'Focused';
  sessionType: 'Training' | 'Seminar';
  multiplier: number;        // The ×N value from the card
  attributes: string[];      // Exact stats this card trains (per-card, not per-type)
  durationDays: number;
  source: 'Academy' | 'EliteChest' | 'Store' | 'Other';
  cost: { currency: 'tokens' | 'cash' | 'free'; amount: number };
}
```

Coach attribute lists are stored per-card instance, not derived from the type name. A Standard Attacking card may train 3, 4, or 5 attributes depending on the specific card; this is variable and must be recorded when the card is entered.

### InvestmentPlan

```typescript
interface InvestmentPlan {
  player: { name: string; currentOvr: number };
  steps: InvestmentStep[];   // Ordered: coaches → tier → greens
  finalOvr: number;
  totalOvrGain: number;
  totalResourceCost: string;
  recommendation: string;    // Human-readable summary
  warnings: string[];
}
```

---

## 10. Limitations and Open Questions

| Item | Status |
|---|---|
| Coach gain formula | Empirically approximated. Will be updated from research docs without changing function signature. |
| Seminar bonus (1.6×) | Observed in a limited data set. May vary by player OVR range or stat composition. |
| Tier OVR bonuses | Observed values. May not be linear or may include secondary effects not captured here. |
| Green efficiency | 15 greens/OVR is an approximation. Actual rate may be OVR-dependent. |
| Formation/synergy | Not modelled. Squad synergy bonuses are out of scope for the current engine. |
| Multi-session coaches | Engine models each coach card as a single-use event. Cards with multiple sessions are not yet supported. |
| Focused coach cap | Cards noted as "Max 9 stars" appear to have a tier-based cap on gain. Not yet modelled. |

---

## 11. Versioning

This whitepaper tracks the version of the engine, not the app release. Formula updates from research docs will increment the minor version and note the change in the DEVLOG.

| Version | Date | Notes |
|---|---|---|
| 0.1 | Sprint 1 | Foundations — drill optimiser, condition model, role system |
| 0.2 | Sprint 2 | Investment engine — OVR projector, gain formula, scenario comparator |
