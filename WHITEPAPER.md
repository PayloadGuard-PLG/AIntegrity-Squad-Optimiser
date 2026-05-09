# Squad Optimiser — Technical Whitepaper

**Version 0.9 — Sprint 12**

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
OVR = floor(mean(all 15 stats))
```

`qualityOvrDivisor = 1` — OVR is the **floored** (truncated) unweighted mean of all 15 attributes. Confirmed from Sutters GK snapshot (2026-05-08): sum of 15 stats = 2,844; 2,844 ÷ 15 = 189.6 → game displays **189**. Earlier estimate (mean 194.8 → displays 195) was unverified; the truncation rule supersedes it.

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

**XP budget per stat per drill run:**
```
xpBudget = sessionCount × baseXpPerSession / drill.stats.length
```

Budget is divided equally across all stats a drill trains. A 5-stat drill run for 30 sessions gives each stat 30 × 150 / 5 = **900 XP**.

**Calibration — Standard Attacking ×30 (age 18, Normal talent):**

| Stat | Start | Observed gain | Model (Medium) |
|---|---|---|---|
| Passing | 121 | +26–33 | ~27 |
| Dribbling | 132 | +20–27 | ~25 |
| Crossing | 132 | +20–27 | ~25 |
| Shooting | 129 | +21–29 | ~26 |
| Finishing | 127 | +22–30 | ~27 |

Model gives gains within the observed ranges at Medium intensity (1.3×). `baseXpPerSession = 150` confirmed.

**Note — Training XP ≠ stat-gain XP:** The "Training XP" display is a separate resource and does not map to the XP budget modelled here.

**Cost per 1% gain on a single stat:**
```
base       = xpCostTable[statValue]   (see §3.3)
ageMult    = ageTable[age]
talentMult = talentMultipliers[talentTier]
greyMult   = 1.0 if isWhite else 0.5
adMult     = 2.0 if twoxAdActive else 1.0

xpCost = base / (ageMult × talentMult × greyMult × adMult × drillLevelMult)
```

The engine iterates 1% at a time from the current stat value, subtracting `xpCost` from the budget, until the budget is exhausted or `statCap` (340) is reached. Sub-integer progress banks as a fractional carry.

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

### 3.6 Drill level multipliers (XP)

These multipliers scale the XP budget available per session. They apply to stat-gain calculations only.

| Level | XP multiplier |
|---|---|
| Very Easy | 1.0 |
| Easy | 1.15 |
| Medium | 1.3 |
| Hard | 1.55 |
| Very Hard | 1.7 |

**Note:** Condition loss uses a separate set of multipliers (`COND_LEVEL_MULTIPLIERS`) — see §5. The two sets are not interchangeable.

### 3.7 Grey stat weight

Stats outside a player's role essential list (grey stats) receive `greyMult = 0.5`. They still gain from drills but at half the XP efficiency of white (essential) stats.

### 3.8 Star decay

No star decay is applied (`starDecayPerSession = 1.0`). Real training data (Standard Attacking ×30) shows near-linear gains across all session counts — aggressive per-% decay was not supported by observation and caused severely understated projections for high-stat players. The parameter remains in `game_2025.json` for future refinement if non-linearity is confirmed.

---

## 4. Tier Upgrade Model

Tier upgrades are applied after all drills. The bonus is a flat attribute addition per **role stat** (white + grey); off-role stats (present in a player's 15-stat grid but outside their role's essential+secondary list) receive a flat +1. OVR is recalculated from all 15 updated values.

```
roleStats = getAllStatKeys(player.role)   // white ∪ grey for all player roles

for each stat in player.stats:
    if stat in roleStats:
        stat += tierAttrAddition[targetTier] - tierAttrAddition[fromTier]
        stat = min(stat, statCap)    // statCap = 340
    else:
        stat += 1                    // off-role: flat +1 per tier step

OVR = floor(mean(all 15 updated stats))
```

**Confirmed from Ricky Grant Elite→Stellar reality check (2026-05-09):**
- 13 role stats: each +20 (Elite→Stellar increment = 50−30 = +20)
- HEADING and STRENGTH (off-role for DL): each +1
- Predicted OVR 175 matched game exactly.

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

Stellar upgrade on a striker (6 white + 3 grey = 9 role stats, 6 off-role), each role stat at 100, off-role at 80:
- Role stats: +50 each → 150 (below 340 cap ✓)
- Off-role stats: +1 each → 81
- OVR delta: (50 × 9 + 1 × 6) / 15 = 456/15 = +30.4 OVR

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

**Drill condition loss — confirmed formula (Sprint 11)**

Condition loss is **level-based, not drill-specific**. Every drill shares the same `baseLoss = 0.75%`. Actual loss per drill:

```
conditionLoss = baseLoss × COND_LEVEL_MULTIPLIERS[drillLevel] × (1 − fanClubReduction)
```

**Condition level multipliers (`COND_LEVEL_MULTIPLIERS`) — confirmed from in-game screenshots:**

| Drill level | Multiplier |
|---|---|
| Very Easy | 1 |
| Easy | 2 |
| Medium | 3 |
| Hard | 4 |
| Very Hard | 5 |

**Fan Club drain reduction:**

| Fan Club Level | Reduction | Retention |
|---|---|---|
| L0 | −10% | 0.90 |
| L1 | −15% | 0.85 |
| L2 | −20% | 0.80 |
| L3 | −25% | 0.75 |
| L4 | −50% | 0.50 |

**Verification (all values match in-game observations):**

| Level | Fan Club | Formula | Result | Observed |
|---|---|---|---|---|
| Very Easy | L4 | 0.75 × 1 × 0.50 | 0.375% | 0% (see zero-drain below) ✓ |
| Easy | L4 | 0.75 × 2 × 0.50 | 0.75% | 0.75% ✓ |
| Very Hard | L0 | 0.75 × 5 × 0.90 | 3.375% | 3.38% ✓ |
| Very Hard | L4 | 0.75 × 5 × 0.50 | 1.875% | 1.88% ✓ |

**Zero-Drain Protocol — confirmed:** Very Easy + Fan Club L4 = 0.375%, which falls below the game's display threshold and shows as **0.00%**. Engine `isZeroDrain` fires when `conditionLoss < 0.5%` — which is exclusive to VE+L4 under current fan club and level ranges. Easy+L4 = 0.75% is above the threshold and is not zero drain.

Note: active chants may further reduce condition — not yet modelled.

---

## 6. Team Play System

Team Play is a separate scoring system that affects match performance but does **not** influence individual player stat training. It is currently unmodelled in the engine — tracked here for future implementation.

### 6.1 Structure

Four pillars, each with its own current score, cap, and level (1–10). Cap increases as the pillar is levelled up via the ADVANCE button. Combined score = sum of all four current values vs sum of all four caps.

**Confirmed pillar caps by level (2026-05-08):**

| Level | Pillar cap | Formula |
|---|---|---|
| 3/10 | 16 | level × 2 + 10 |
| 4/10 | 18 | level × 2 + 10 |
| 5/10 | 20 | level × 2 + 10 |
| 6/10 | 22 | level × 2 + 10 |
| 10/10 | 30 | level × 2 + 10 (projected) |

**Formula confirmed:** `pillarCap = (level × 2) + 10`. Verified across all four pillars simultaneously.

**Confirmed pillar state (fully maxed, 2026-05-08):**

| Pillar | Score | Cap | Level | Bonus | Min players required | Eligible roles |
|---|---|---|---|---|---|---|
| Attack | 18 | 18 | 4/10 | +20% | ≥ 3 | ST · AMC · AML · AMR · ML · MR |
| Defence | 22 | 22 | 6/10 | +25% | ≥ 4 | GK · DC · DL · DR |
| Possession | 20 | 20 | 5/10 | +25% | ≥ 4 | ML · MR · MC · DMC |
| Condition | 16 | 16 | 3/10 | +15% | ≥ 8 | ANY (Physical & Mental drills) |
| **Total** | **76** | **76** | — | — | — | — |

**Ad TV boost:** Attack shows 18+1 from Ad TV (match-day only, does not persist between sessions).

**Daily decay:** All four pillar scores decrease by 2 or more per day. Decay applies at the daily server reset.

**Bonus % by level (observed):**

| Level | Attack bonus | Defence bonus | Possession bonus | Condition bonus |
|---|---|---|---|---|
| 3/10 | — | — | — | +15% |
| 4/10 | +20% | — | — | — |
| 5/10 | — | — | +25% | — |
| 6/10 | — | +25% | — | — |

Note: L5 and L6 both show +25% — whether bonus plateaus at L5 or scales differently between pillars needs further data.

### 6.2 Free daily maintenance (all managers)

Four free teamplay training drills are available daily, accessible by watching ads. These drills specifically raise teamplay pillar scores. A base multiplier (2×–4×, scaling with ads watched) applies to the teamplay gain from these drills.

**Effective free daily boost:** 4 drills × base multiplier — sufficient to offset the ~2-point daily decay if used consistently.

### 6.3 Matchday Coach (premium)

The Matchday Coach grants **+150% Teamplay multiplier on all training sessions** — not just the 4 free teamplay drills. Duration: 7 days from activation. Also purchasable as a 1-day version for 25 tokens at any time. Source: premium sponsor milestone rewards.

| Boost type | Scope | Duration | Cost |
|---|---|---|---|
| 4 free ad drills (2×–4× mult) | Teamplay drills only | Daily | Free |
| Matchday Coach (+150%) | All training sessions | 7 days | Premium milestone |
| Matchday Coach (+150%) | All training sessions | 1 day | 25 tokens |

The Matchday Coach applies to every drill a player runs, meaning normal individual-player training sessions simultaneously advance teamplay pillars.

**Confirmed observed effect (2026-05-08):** 41 × Ball Control Very Easy with Matchday Coach active → Attack pillar +7 above its current level cap (L4 cap = 18, reached 25 effective). Matchday Coach can temporarily push pillars above their level cap. This excess above cap is not retained permanently — it represents form gained from training that the pillar level ceiling does not limit.

**Variety penalty:** The game warns "Training today lacked variety. Different intensities and types in drills enhance teamplay impact." Repeating the same drill across all 41 sessions reduces per-session teamplay efficiency. Rotating drills or mixing intensities maximises pillar gain rate.

### 6.4 Ad TV — daily reward track

The Ad TV (Top Eleven TV) is a sequential reward track completed by watching video ads. **Progress resets every 24 hours.** All boosts are match-day only and do not influence training.

**Reward track (in order):**

| Step | Reward | Notes |
|---|---|---|
| 1 | Daily Appearance | Daily login reward bundle |
| 2 | Special Sponsor | +5 sponsor points · completes "Video Master" sponsor task |
| 3 | Playbook | 1 random Basic Playbook drill · completes Playbook shop videos |
| 4 | Matchday Coach (2×) | Limited training run with 2× teamplay multiplier |
| 5 (Milestone) | Teamplay Form Boost: Random | Applied to all matches until end of season day |
| Between 5–10 | Mourinho Support (+2%) | +2% Possession before a scheduled fixture · requires 3 watches |
| 10 (Milestone) | Special Ability Boost | All players' Special Abilities boosted for all matches today |

**Matches to unlock Mourinho Support:** Watch an ad before each of 3 fixtures ("GO TO FIXTURES"). +2% Possession for that match. Number of fixtures available depends on how many competitions you're active in: League + Association (clan of up to 6) + Friendly Championship + accepted Friend Friendlies = 1–6 matches per day.

**Teamplay Form Boost — exact probabilities (confirmed from UI):**

Same distribution applied independently to each of the 4 pillars per draw. You always receive exactly one boost on one random pillar.

| Boost | Probability |
|---|---|
| +1 | 7% |
| +2 | 10% |
| +3 | 5.5% |
| +4 | 2.5% |
| **Any boost on this pillar** | **25%** |

Since 4 pillars × 25% = 100%, every draw guarantees a boost on exactly one pillar. Expected boost value: **~+2.14** on the selected pillar.

**Special Ability Boost:** All players' Special Abilities enhanced for all matches until end of season day. Does not affect training.

**Associations (clans):** Groups of up to 6 players. Association matches count toward fixture availability for Mourinho Support watches.

### 6.5 Training Level and Drill Quality

Training Level is a separate progression track from individual player OVR. It is advanced by accumulating Training XP (the "+1 per player" shown in training reports — distinct from stat-gain XP).

**Confirmed facts (2026-05-08):**
- Maximum Training Level = **111** (stated in tooltip: "The Maximum Training Level is 111")
- Training XP at Level 111: **1,855,042** (displayed as accumulated total at max)
- Each level up unlocks a new drill or improves an existing one
- Drill quality tiers (e.g. "World-class, +35 Training effect") are determined by Training Level unlocks applied to that drill
- The `+35 Training effect` on Ball Control at World-class quality affects Training XP yield per session, not stat-gain XP — it does not affect the stat gain model

**Training XP vs stat-gain XP:** These are entirely separate systems. Training XP fills the level bar and unlocks drills. Stat-gain XP (modelled as `baseXpPerSession × multipliers`) drives actual player stat improvements. The two numbers do not interact.

### 6.7 Strategic priority

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
4. **4 free ad drills daily (×4 multiplier)** — train Attack, Defence, and Possession on relevant positions using the free daily ad drills. This offsets daily decay and steadily pushes pillar levels higher, raising match performance without spending condition.

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

The drill optimiser (`getBestDrillSelections`) recommends all drills sorted by ROI, letting the manager identify the highest-value training for a player's role.

Each drill returns:
- `name` — drill name
- `type` — Attack / Defence / Physical
- `efficiency` — fraction 0–1 of the drill's stats that are white (essential) for this player's role (rendered as % in UI)
- `conditionCost` — per-drill condition % lost (direct game display value; 0 when `isZeroDrain`)
- `isZeroDrain` — true when `conditionLoss < 0.5%` (only VE+L4 qualifies under current ranges)
- `avgWhiteStatValue` — mean current value of white stats this drill trains; lower = cheaper XP per gain = higher ROI
- `whiteHits` — `{ stat: string; white: boolean }[]` — every stat the drill trains, flagged white or grey

**All 25 drills are shown for every player** (no efficiency filter). Drills are sorted ascending by `avgWhiteStatValue` — cheapest gains first. Drills that train no white stats for a given role (Infinity value) sink to the bottom naturally.

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
| Drill XP baseline | `baseXpPerSession = 150` confirmed from Standard Attacking ×30 (age 18, Normal talent). Validate for other intensities/ages with CALIBRATION_LOG data. |
| GK white stat list | Confirmed Sprint 8: 10 white (REFLEXES, AGILITY, ANTICIPATION, RUSHING OUT, COMMUNICATION, THROWING, KICKING, PUNCHING, AERIAL REACH, CONCENTRATION) + 5 grey. |
| GK stat entry UI | Fixed Sprint 9: GK_STATS grid 10 → 15; all confirmed from Sutters card. |
| Tier bonus scope | Confirmed Sprint 12: role stats (white+grey via `getAllStatKeys`) get full increment; off-role stats get +1 flat. Validated Ricky Grant Elite→Stellar — engine OVR 175 matched game exactly. |
| Individual stat entry | Drill-level projection requires all 15 stats entered per player. Players stored with only an OVR value get drill gains skipped — a warning is shown and the projection falls back to the tier-only estimate. |
| Condition level multipliers | Confirmed Sprint 11 from screenshots: VE×1, E×2, M×3, H×4, VH×5. Additional mid-range validation (Easy, Medium, Hard) still useful. |
| Ball Control drill | Missing from `DRILL_LIST`. Trains Concentration, Dribbling, Heading, Creativity — type TBC. |
| Team Play system | Fully documented in §6 but not modelled in the engine. Pillars, decay, Matchday Coach multiplier, and ADVANCE costs are out of scope for current OVR projection. |
| Star decay curve | `starDecayPerSession = 1.0` (no decay). Confirmed near-linear from real data. |
| Premium sponsor cooldown | `isPremiumSponsor` stored in `ManagerProfile` but condition recovery cooldown reduction (milestone 6 +10%, milestone 12 further reduction) is not applied in engine output. |
| Formation/synergy | Not modelled. |

---

## 12. Versioning

| Version | Date | Notes |
|---|---|---|
| 0.1 | Sprint 1 | Foundations — drill optimiser, condition model, role system |
| 0.2 | Sprint 2 | Investment engine — OVR projector, coach-card gain formula, scenario comparator |
| 0.3 | Sprint 5 | XP model, drill sessions, per-tier point pools, OVR formula fix (divisor 4→1), drill level rename, role adjacency transitive fix |
| 0.4 | Sprint 6 | Extended XP cost table to stat 339; baseXpPerSession budget multiplier; Direction B UI; OVR display delta fix |
| 0.5 | Sprint 7 | Drill level selector in Drills tab; talent multiplier labels; zero-drain detection at L4+VE |
| 0.6 | Sprint 8 | Coaches tab (SESSION SIMULATOR); fractional XP model; ROI-based drill sort; GK role constraints confirmed; smarter skip warnings |
| 0.7 | Sprints 9–10 | RESULTS tab; tier bonus applied to all 15 stats (fix); talent on player card; apply-gains write-back; GK stat grid complete; OVR truncation confirmed; Expo Web; Matchday Coach + teamplay data logged |
| 0.8 | Sprint 11 | Condition formula overhaul (universal baseLoss=0.75, COND_LEVEL_MULTIPLIERS VE×1→VH×5); all drills visible for all roles; First Touch Play rename; Piggy in the Middle AGGRESSION |
| 0.9 | Sprint 12 | Tier bonus corrected: role stats (white+grey) get full increment, off-role get +1 flat. Player snapshot + one-step revert from edit screen. |

---

## 13. Coaches Tab and Results Hub

### 13.1 SESSION SIMULATOR (Coaches tab)

`app/(tabs)/coaches.tsx` — models the effect of a coaching block on a single player. The user specifies:
- **Subject** — player from squad
- **Stat coverage** — tap to select/deselect any of the player's 15 stats. White stats shown full brightness; grey stats dimmed. Counter shows total selected.
- **Sessions ×N** — how many coaching sessions (e.g. ×30 Standard Attacking, ×59 Standard Safeguard)
- **Intensity** — locked to Very Hard (academy coaches have no adjustable difficulty)
- **Talent** — read from player card (`player.talent`); no per-session dropdown

Output: per-stat gains (float), OVR before/after banner, and optional TIER UPGRADE card below showing projected combined OVR if an affordable tier is added on top.

**APPLY TO PLAYER CARD** writes post-coach stats + updated OVR (+ tier if selected) back to the player's DB record, clearing the projection and resetting for the next coaching block.

### 13.2 FULL PLAN (Results tab)

`app/(tabs)/results.tsx` — chains multiple coaching sessions + tier upgrades + greens + rest packs into a single sequential OVR projection. Each step shows OVR before → after. Gives the manager a complete end-to-end roadmap: drill blocks → Epic upgrade → Legendary upgrade → condition restore.

**APPLY FULL PLAN TO CARD** writes the final stats, OVR, and tier back to the player record in one tap.
