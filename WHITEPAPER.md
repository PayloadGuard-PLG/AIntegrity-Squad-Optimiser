# Squad Optimiser — Technical Whitepaper

**Version 0.4 — Sprint 6**

---

## 1. Purpose

Squad Optimiser is a decision-support tool for mobile football management games that use a stat-based OVR (Overall Rating) system. Its goal is deterministic, pre-spend investment planning: given a fixed resource pool and a set of player candidates, output a ranked, step-by-step plan that tells the manager exactly what to apply, in what order, and what final OVR each player will reach.

This document describes the underlying models, calibration methodology, data structures, and known limitations.

---

## 2. Core Model Overview

The OVR projection pipeline has three stages, applied in strict order:

```
Drill Sessions  →  Tier Upgrade  →  Greens (condition)
```

**Drills-first rule:** Drills must be run before tier upgrade. Tier upgrade raises the base value of white stats permanently — any drills run afterwards train from a higher baseline where XP costs are greater. Running drills first maximises total gain per resource unit.

**Greens are not OVR.** Greens restore condition (15% per green). They appear as an informational step in the plan but produce zero OVR change.

---

## 3. XP Engine

### 3.1 OVR Formula

```
OVR = mean(all 15 stats)
```

`qualityOvrDivisor = 1` — OVR is the unweighted mean of all 15 attributes directly. Empirically calibrated (e.g. player with mean stat 194.8 shows OVR 195).

### 3.2 XP cost per 1% stat gain

```typescript
xpNeededFor1Pct(
  statValue: number,       // current stat value (%)
  age: number,
  starsGainedInSession: number,
  talent: TalentTier,
  isWhite: boolean,        // essential stat for this role?
  twoxAd: boolean,
  drillLevelMult: number,  // from profile drillLevelMultipliers
  profile: GameProfile
): number
```

**XP budget per drill run:**
```
xpBudget = sessionCount × baseXpPerSession   (baseXpPerSession = 150)
```

A player running 6 sessions of a drill generates 900 XP to distribute across the stats that drill trains.

**Note — Training XP ≠ stat-gain XP:** The game displays a "Training XP" value in session reports (e.g. +30 per session). This is a separate game resource and is unrelated to the stat-gain XP budget the engine models. Do not use the displayed Training XP figure to calibrate `baseXpPerSession`.

**Preliminary calibration:** One Video Analysis session (Very Easy) on a high-OVR player produced +2 Positioning, +1 Creativity. For a stat in the 180–200 range (cost 80–100 XP per 1%), a budget of 150 XP yields 1.5–1.875 per-stat gain — consistent with the observed +1–2. `baseXpPerSession = 150` is treated as confirmed pending further data points.

**Cost per 1% gain on a single stat:**
```
base       = xpCostTable[statValue]   (see §3.3)
ageMult    = ageTable[age]
starMult   = 0.85 ^ starsGainedInSession
talentMult = talentMultipliers[talentTier]
greyMult   = 1.0 if isWhite else 0.5
adMult     = 2.0 if twoxAdActive else 1.0

xpCost = base / (ageMult × starMult × talentMult × greyMult × adMult × drillLevelMult)
```

The engine iterates 1% at a time from the current stat value, subtracting `xpCost` from the budget, until the budget is exhausted or `statCap` (340) is reached.

### 3.3 XP cost table

Costs increase with stat value. Top-level players (stats 180–250) still train — costs are steep but finite.

| Stat range | XP per 1% |
|---|---|
| 0–59 | 8 |
| 60–79 | 10 |
| 80–99 | 20 |
| 100–119 | 30 |
| 120–139 | 40 |
| 140–159 | 50 |
| 160–179 | 60 |
| 180–199 | 80 |
| 200–219 | 100 |
| 220–239 | 125 |
| 240–259 | 160 |
| 260–279 | 200 |
| 280–339 | 250 |

**Example:** stat-241 white attr, age 24, Normal talent, Very Easy drill: `xpCost = 160 / 0.24 ≈ 667`. Budget for 6 sessions = 900 XP → 1% gain.

### 3.4 Age multipliers

| Age | Multiplier |
|---|---|
| 17 | 1.10 |
| 18 | 1.00 |
| 19 | 0.90 |
| 20 | 0.55 |
| 21 | 0.40 |
| 22 | 0.32 |
| 23 | 0.28 |
| 24 | 0.24 |
| 25 | 0.22 |
| 26 | 0.19 |
| 27 | 0.16 |
| 28 | 0.14 |
| 29 | 0.12 |
| 30+ | 0.10 (clamped) |

### 3.5 Talent tier multipliers

| Talent | Multiplier |
|---|---|
| FT1 | 1.50 |
| FT2 | 1.25 |
| FT3 | 1.10 |
| Normal | 1.00 |
| Slow | 0.70 |

### 3.6 Drill level multipliers

| Level | Multiplier |
|---|---|
| Very Easy | 1.0 |
| Easy | 1.15 |
| Medium | 1.3 |
| Hard | 1.55 |
| Very Hard | 1.7 |

### 3.7 Grey stat weight

Stats outside a player's role essential list (grey stats) receive `greyMult = 0.5`. They still gain from drills but at half the XP efficiency of white (essential) stats.

### 3.8 Star decay

Each session applies a `starMult = 0.85 ^ starsGainedInSession` reduction to model star decay. Stars gained per session is tracked per-drill-run.

---

## 4. Tier Upgrade Model

Tier upgrades are applied after all drills. The bonus is a flat attribute addition per white (essential) stat; OVR is recalculated from the updated stat values.

```
for each white stat:
    stat += tierAttrAddition[targetTier]
    stat = min(stat, statCap)   // statCap = 340

OVR = mean(all 15 updated stats)
```

### 4.1 Tier attribute additions and point costs

Each tier type has its own independent point pool. Rare points, Elite points, Stellar points, etc. are separate currencies.

| Tier | Attr addition | Points required |
|---|---|---|
| Rare | +10 | 100 |
| Elite | +30 | 90 |
| Stellar | +50 | 50 |
| Master | +80 | 25 |
| Epic | +120 | 15 |
| Legendary | +160 | 10 |

*Point costs are empirically verified as of 2025.*

### 4.2 OVR gain estimation (example)

Stellar upgrade on a striker with 6 white stats, each at 100:
- Attr addition: +50 per white stat
- New white stats: 150 each (below 340 cap ✓)
- OVR delta: 50 × 6 / 15 = +20 OVR

---

## 5. Condition Model (Greens)

Greens restore condition. They do **not** increase OVR.

```
conditionRestored = min(greens × 15%, 100%)
```

Greens appear as an informational `condition` step in the plan with `ovrBefore === ovrAfter`.

**Cooldown timer:** The Training Centre has a real-time condition recovery timer. Once it expires, condition returns to ~99%. This is not modelled in the engine — the plan outputs total greens required without scheduling across cooldown windows.

**Optimal drill cadence (timer-based strategy):** Once condition hits ~99% (timer expired), run drills immediately rather than waiting for the final 1%. Each drill costs ~6% condition. The number of full training cycles available before the next fixture determines total investable XP:

```
cycles = floor(hours_until_fixture × 60 / cooldown_minutes)
total_xp_budget = cycles × sessionCount × baseXpPerSession
```

If a game is scheduled for the next day, the manager has a known time window and can plan how many cycles to run. Premium sponsor shortens the cooldown, directly increasing cycles per window. The decision of what to train in each cycle depends on subscription tier:

| Scenario | Optimal use per cycle |
|---|---|
| FTP / no Zero-Drain | Main player white stats — maximise XP per condition unit spent |
| Premium sub, faster cooldown | More cycles per window enables secondary stat or team play form drills between main sessions |
| Fan Club L4 (Zero-Drain) | Timer irrelevant — condition never drops; unlimited drilling regardless of fixture schedule |

**Premium sponsor — Faster Condition Recovery:** Milestone track grants cooldown reductions (+10% at milestone 6, further at milestone 12), meaning more drill cycles per real-time hour. `ManagerProfile.isPremiumSponsor` is stored but the cooldown reduction is not yet factored into engine output — see §10.

**Drill condition loss** per Fan Club level. Model and observed values confirmed:

| Fan Club Level | Drain reduction | Effective multiplier | Observed (Video Analysis, Very Easy) |
|---|---|---|---|
| L0 | −10% | 0.90 | — |
| L1 | −15% | 0.85 | — |
| L2 | −20% | 0.80 | — |
| L3 | −25% | 0.75 | — |
| L4 | −50% | 0.50 | 0.375% per session (model) = 0.38% displayed (game) ✓ |

**Zero-Drain Protocol:** Confirmed. At Fan Club L4 with chants active on Very Easy drills, condition loss = 0%. Training list shows 0.00% per session when conditions are met. Engine correctly returns 0% for L4 + Very Easy (`isZeroDrain = true`).

---

## 6. Team Play System

Team Play is a separate scoring system that affects match performance but does **not** influence individual player stat training. It is currently unmodelled in the engine — tracked here for future implementation.

### 6.1 Structure

Four pillars, each with its own current score, cap, and level (1–10). Cap increases as the pillar is levelled up via the ADVANCE button. Combined score = sum of all four current values vs sum of all four caps.

**Example observed values:**

| Pillar | Current | Cap | Level |
|---|---|---|---|
| Attack | 14 | 18 | 4/10 |
| Defence | 16 | 22 | 6/10 |
| Possession | 14 | 20 | 5/10 |
| Condition | 16 | 16 | 3/10 |
| **Total** | **60** | **76** | — |

**Daily decay:** All four Team Play pillar scores decrease by 2 or more per day. Decay applies at the 2am GMT server reset.

### 6.2 Free daily maintenance (all managers)

Four free teamplay training drills are available daily, accessible by watching ads (Top Eleven TV). These drills specifically raise teamplay pillar scores. A base multiplier (2×–4×, scaling with ads watched) applies to the teamplay gain from these drills.

**Effective free daily boost:** 4 drills × base multiplier — sufficient to offset the ~2-point daily decay if used consistently.

### 6.3 Matchday Coach (premium)

The Matchday Coach grants **+150% Teamplay multiplier on all training sessions** — not just the 4 free teamplay drills. Duration: 7 days from activation. Source: premium sponsor milestone rewards.

| Boost type | Scope | Duration |
|---|---|---|
| 4 free ad drills (2×–4× mult) | Teamplay drills only | Daily |
| Matchday Coach (+150%) | All training sessions | 7 days |

The Matchday Coach is equivalent to the 4-video ad multiplier but applies to every drill a player runs, meaning normal individual-player training sessions simultaneously advance teamplay pillars.

### 6.4 Top Eleven TV — match-day teamplay boosts

Top Eleven TV provides random teamplay form boosts that apply **to matches only** — they do not affect training. Progress resets approximately every 6 hours.

Boost probabilities per pillar draw:

| Boost amount | Probability |
|---|---|
| +1 | 7% |
| +2 | 10% |
| +3 | 5.5% |
| +4 | 2.5% |

Applies to all 4 pillars (Attack, Defence, Possession, Condition) with identical probability distribution. Boost lasts until end of season day.

**Special Ability Boost** is also available from the same reward track — applies to all Special Abilities for all matches until end of season day. Does not influence training.

### 6.5 Strategic priority

| Manager type | Team play approach |
|---|---|
| FTP | 4 free daily drills (watch ads) to hold pillars above decay baseline |
| Premium (no coach) | Same as FTP + faster condition cooldown = more training cycles available |
| Premium (Matchday Coach active) | All individual player drills also advance teamplay — no separate maintenance needed for 7 days |

---

## 6a. Validated Season Meta — Squad-Wide Growth

**Observed outcome:** ~+7 OVR per season from sustained Very Easy drills at Fan Club L4.

This strategy compounds three mechanics simultaneously:

### Training loop
1. **Zero-drain at L4 + Very Easy** — condition never drops; drill cycles are unlimited regardless of fixture schedule.
2. **Spam all low white stats** — train the stats furthest below tier cap first. XP cost is lowest at the bottom of the range; the gain per session is highest here. Once a stat hits the current tier cap, skip it until the next tier upgrade.
3. **Don't wait for perfect condition** — 50% condition reduction (L4) means you can chain drills continuously; perfect-condition waiting wastes cycles.

### Teamplay maintenance (free)
4. **4 free ad drills daily (×4 multiplier)** — train Attack, Defence, and Possession on relevant positions using the free Top Eleven TV drills. This offsets daily decay and steadily pushes pillar levels higher, raising match performance without spending condition.

### Squad-wide effect
5. **Train across the whole squad** — the aggregate XP flowing through all 11+ players means more integer thresholds crossed per day than single-player projection suggests. Each player's white stats accumulate fractionally; when a crossing fires, it feeds into OVR for that player. Across the squad, crossings happen constantly.
6. **Role opening** — as stats hit new thresholds, adjacent roles unlock. This widens available drilling options and enables Matchday Coach to cover a broader teamplay pillar set.

### Season yield
~+7 OVR is the observed aggregate for this approach. Individual player gains are smaller (fractional each cycle); the season total comes from hundreds of crossings across all players.

**Engine note:** The current Plan tab projects a single player in isolation. Squad-wide cumulative gain is not modelled — the +7 OVR/season figure is an observed season benchmark, not an engine output.

---

## 7. Role and Stat Classification


Each player role defines:
- **Essential stats** (white) — directly drive OVR for this role; receive full weight (`greyMult = 1.0`)
- **Secondary stats** (grey) — trained at half weight (`greyMult = 0.5`)

Role adjacency is validated at player creation. The validation is **transitive** — each additional role must be adjacent to any already-accepted role (not just the primary). Example: ST+AMC+MC is valid because MC is adjacent to AMC, even though MC is not directly adjacent to ST.

---

## 8. Manager Style

The manager style controls the resource pool available for planning:

| Style | Resource pool |
|---|---|
| FTP | Free-to-play — no store purchases |
| Hybrid | Owned resources + store within `storeBudget` |
| PTW | All available resources |

---

## 9. Drill Optimiser

The drill optimiser (`getBestDrillSelections`) recommends training drills that maximise skill development for a player's role while minimising condition cost.

Each drill returns:
- `name` — drill name
- `type` — Attack / Defence / Physical
- `efficiency` — fraction 0–1 of target stats hit (rendered as % in UI)
- `conditionCost` — total condition % lost over a 6-slot session
- `isZeroDrain` — true when conditionCost === 0 (Zero-Drain Protocol active)
- `whiteHits` — `{ stat: string; white: boolean }[]` — every stat the drill trains, flagged whether it is role-essential (white) or grey

Drills are classified as `isBase: true` (core daily drills available always) or `isBase: false` (event or lab drills with restricted availability).

---

## 10. Data Structures

### Player

```typescript
interface Player {
  id: string;
  name: string;
  role: string[];          // Up to 3 adjacent roles
  age: number;
  overall: number;         // Current OVR
  tier: TierName;
  stats: Record<string, number>;  // Individual stat values; {} if not entered
  isMutantCandidate: boolean;
}
```

### DrillSession

```typescript
interface DrillSession {
  drillName: string;
  sessionCount: number;    // How many times this drill is run
  drillLevel: DrillLevel;  // 'Very Easy' | 'Easy' | 'Medium' | 'Hard' | 'Very Hard'
}
```

### ManagerProfile

```typescript
interface ManagerProfile {
  style: ManagerStyle;     // 'FTP' | 'Hybrid' | 'PTW'
  tierPoints: Partial<Record<TierName, number>>;  // Per-tier separate balances
  greens: number;
  isPremiumSponsor: boolean;
  storeBudget?: number;    // Hybrid only
  twoxAdActive: boolean;
  talentTier: TalentTier;
  drillLevel: DrillLevel;
}
```

### InvestmentPlan

```typescript
interface InvestmentPlan {
  player: { name: string; currentOvr: number };
  steps: InvestmentStep[];   // Ordered: drills → tier → condition
  finalOvr: number;
  totalOvrGain: number;
  totalResourceCost: string;
  recommendation: string;    // Human-readable summary
  warnings: string[];
}
```

---

## 11. Limitations and Open Questions

| Item | Status |
|---|---|
| Drill XP baseline | `baseXpPerSession = 150` is a working estimate. Validate by noting a player's stat value before N sessions, comparing observed gain to engine output, then adjusting the value in `profiles/game_2025.json` |
| GK white stat list | `ROLE_CONSTRAINTS.GK.essential` is estimated — needs empirical validation |
| GK stat entry UI | `app/player/new.tsx` shows outfield stats for all roles; GK needs a separate stat grid (REFLEXES, HANDLING, etc.) |
| Individual stat entry | Drill-level projection requires all 15 stats entered per player. Players stored with only an OVR value get drill gains skipped — a warning is shown and the projection falls back to the tier-only estimate |
| Team Play system | Fully documented in §6 but not modelled in the engine. Pillars, decay, Matchday Coach multiplier, and ADVANCE costs are all out of scope for current OVR projection |
| Star decay curve | `starMult = 0.85^n` per additional % gained in a session; actual curve unconfirmed |
| Premium sponsor cooldown | `isPremiumSponsor` stored in `ManagerProfile` but condition recovery cooldown reduction (milestone 6 +10%, milestone 12 further reduction) is not applied in engine output |
| Formation/synergy | Not modelled |

---

## 12. Versioning

| Version | Date | Notes |
|---|---|---|
| 0.1 | Sprint 1 | Foundations — drill optimiser, condition model, role system |
| 0.2 | Sprint 2 | Investment engine — OVR projector, coach-card gain formula, scenario comparator |
| 0.3 | Sprint 5 | XP model, drill sessions, per-tier point pools, OVR formula fix (divisor 4→1), drill level rename, role adjacency transitive fix |
| 0.4 | Sprint 6 | Extended XP cost table to stat 339; baseXpPerSession budget multiplier; Direction B UI; OVR display delta fix |
