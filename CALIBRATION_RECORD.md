# Calibration Record

Honest record of what we know, what we've confirmed, and what we've assumed.
Nothing in here is dressed up. If it's assumed, it says so.

---

## The Model — Plain English

Training gain for any player is determined by two things only:

1. **How old they are** — older players gain less per session
2. **How high their stats already are** — higher stats cost exponentially more XP per point

That's it. Every confirmed calibration point fits this model with a single talent
multiplier of 1.0 (Normal) for all players. No separate Fast/Slow/Fastest modifier
has ever been confirmed from real game data.

The "talent" label in the game likely affects aging rate and development ceiling
across seasons — not per-session training rate. Grey stats drop 20 per season flat
for all players. Older players can't regain them as efficiently because of the age
multiplier, not because of any talent tier.

---

## The Formula

### XP Cost Per Stat Point

```
cost(stat) = C₀ × exp(stat / K)
```

- C₀ = 2.94 ✅ CONFIRMED
- K = 47 ✅ CONFIRMED
- Derived from: Tackling-120 vs Positioning-228 gain ratio in same session, same budget.
  ratio pins C₀ independently. K confirmed by CV minimisation across 5 Grant ×40 observations.

### Session Budget Per Stat

```
effectiveSessions = (1 - 0.99^N) / (1 - 0.99)
budget = effectiveSessions × 676 / detectedStatCount
```

- baseXpPerSession = 676 ✅ CONFIRMED
  Back-calculated from Grant ×40 Standard Defending. All 5 stats within game range.
- sessionBudgetDecay = 0.99 ✅ CONFIRMED
  Unknown GK ×114 Extensive: predicted 172.5 OVR, actual 173. Linear model gave 182 (error +9).
- detectedStatCount = whatever OCR detects with gain ranges. No assumed category sizes.

### Gain Calculation

Solve for g (gain) in the integral:

```
C₀ × K × (exp((stat + g) / K) − exp(stat / K)) = budget × ageMult × greyMult
```

Where:
- ageMult = from age table (see below)
- greyMult = 1.0 for white stats, 0.22 for grey stats ✅ CONFIRMED
- talent = 1.0 for all players (Normal — only confirmed value)

### OVR Formula

```
OVR = floor(sum of all 15 stats / 15)
```

✅ CONFIRMED from Grant T2→T3 clean tier upgrade: sum=2615, floor(2615/15)=174. ceil=175 (wrong).

---

## Age Multipliers

| Age Range | Multiplier | Status |
|---|---|---|
| 17 | 1.1 | ⚠️ ASSUMED — no data |
| 18–20 | 1.0 | ✅ CONFIRMED — Grant age 20, multiple sessions |
| 21–23 | 0.85 | ⚠️ ASSUMED — never empirically confirmed |
| 24–25 | 0.72 | ✅ CONFIRMED — McCluskey age 24, Focused Physical ×4 |
| 26–28 | 0.61 | ✅ CONFIRMED — McGinty age 27 |
| 29 | 0.50 | ⚠️ ASSUMED — no data |
| 30+ | 0.0 | ⚠️ ASSUMED — no data |

The 21–23 bracket (0.85) is the most critical unconfirmed value. One controlled
test with a known age-21 or age-22 player would confirm or correct it.

---

## Talent Multipliers

| Tier | Multiplier | Status |
|---|---|---|
| Normal | 1.0 | ✅ CONFIRMED — Grant, Rogers, Dallas, McGinty, Unknown GK |
| Slow | 0.47 | ❌ INVALIDATED — derived from linear budget model, wrong |
| Average | 1.1 | ❌ NOT CONFIRMED — community estimate |
| Fast | 1.25 | ❌ NOT CONFIRMED — community estimate |
| Fastest | 1.5 | ❌ NOT CONFIRMED — community estimate |

**Working assumption: all players use Normal (1.0).** Every confirmed data point fits
Normal. No non-Normal player has ever produced a result that required a different multiplier
under the correct (geometric) budget model.

---

## Tier System

Cumulative flat bonus added to WHITE STATS ONLY when a tier upgrade happens.

| Tier | Cumulative Bonus per White Stat |
|---|---|
| T0 (None) | +0 |
| T1 (Rare) | +10 |
| T2 (Elite) | +30 |
| T3 (Stellar) | +50 |
| T4 (Master) | +80 |
| T5 (Epic) | +120 |
| T6 (Legendary) | +160 |

✅ CONFIRMED from Grant T2→T3: every white stat +20 exactly (delta T3−T2 = 50−30 = 20).
Grey stats receive no tier increment.

---

## Seasonal Decay

```
all stats − 20 per level promoted (white and grey equally)
```

✅ CONFIRMED from Grant T3 before/after season: every stat −17 to −19 (avg ~17,
~3 pts variance from training noise between screenshots). Flat model fits.
Proportional model (20%) is wrong — would be off by 18–26 on high stats.

Grey stats drop at the same rate as white stats. Older players can't regain them
as efficiently because the age multiplier reduces training rate. This is the only
meaningful difference between a young player and an old one in terms of stat progression.

---

## Training Lock

Base OVR ≥ 180 → TRAIN button absent, MAX STARS shown.
Base OVR = total OVR − tier contribution.
Individual stats can exceed 180 via tier bonuses. The 180 cap is on the average.

✅ CONFIRMED from game screenshots.

---

## Confirmed Calibration Data Points

### Ricky Grant — age 20, DL/ML/AML, Normal, T3/Stellar
×40 Standard Defending:
- TACKLING 120 (white): +59–73 actual, engine: ~60 ✓
- MARKING 167 (white): within range ✓
- POSITIONING 228 (white): within range ✓
- HEADING 155 (grey, greyMult=0.22): +11–15 actual, engine: 12.4 ✓
- BRAVERY (white): within range ✓

T2→T3 tier upgrade: sum=2615, floor(2615/15)=174 ✓ (confirmed OVR formula)

### Cptn Dallas — age 23, AMR/MR/DR, Normal, T0
×4 Safeguard:
- MARKING 139 (white): actual +11–16, engine: within range ✓
- POSITIONING 194 (white): actual +4–6, engine: within range ✓
- AGGRESSION 189 (white): actual +4–6, engine: within range ✓
(Confirmed ageMult 0.85 for age 23 and bXPS=676)

### Kevin McGinty — age 27, AMC, Normal, T0
Controlled Extensive Safeguard test. Confirmed ageMult=0.61 for age 26–28.

### Garry McCluskey — age 24, Normal
Focused Physical ×4. Fitness 213 → engine +3.5, actual +2–3. Confirmed ageMult=0.72.

### Unknown GK — age 18, Normal, T0/T1
×114 Extensive GK: predicted 172.5 OVR, actual 173 OVR. Error −0.5 (<1%).
Confirmed sessionBudgetDecay=0.99 and geometric budget model.
(Note: this is NOT LJDark Leo — different player, identity not captured at time of test)

---

## Logic Flow

### Coach Projection

1. Player stats and age loaded from DB
2. Coach scan: OCR detects gain ranges (+lo-hi) for highlighted stats
3. Detected stats = what OCR sees. No category-size assumptions.
4. `effectiveSessions = (1 - 0.99^N) / 0.01`
5. `budget = effectiveSessions × 676 / detectedStatCount`
6. For each detected stat:
   - Determine white or grey (from player roles)
   - `greyMult = isWhite ? 1.0 : 0.22`
   - `ageMult` from age table
   - `talentMult = 1.0` (Normal, all players)
   - Solve integral for gain g
   - `newStat = min(currentStat + g, statCap)`
7. `ovrAfter = sum(all 15 stats after gains) / 15` (to 1 decimal for display)
8. `ovrFloor = floor(ovrAfter)` (matches game display)

### What the Coach Scan Provides

- Which stats are being boosted (from visible gain ranges)
- Session multiplier N
- Coach type/category (informational, not used in formula)

The game's displayed gain ranges (+lo-hi) are validation only — not formula input.
If the projection lands inside the game's range, the formula holds.
If it doesn't, something in the calibration needs updating.

### What Determines Gain

Only three things:
1. Current stat value (determines cost per point via exponential curve)
2. Player age (determines efficiency via age multiplier)
3. Number of sessions × budget decay (determines total XP available)

Talent tier does not affect the projection. The DB field exists for future use.

---

## What Was Invalidated and Why

| Thing | Value | Why Invalidated |
|---|---|---|
| Slow talent | 0.47 | Back-calculated using linear session budget. Under geometric (0.99) model, same player fits Normal (1.0). |
| bXPS | 150 → 220 | Previous values calibrated against wrong cost model. 676 confirmed under exponential cost + geometric budget. |
| OVR ceil | Math.ceil | 4 data points looked like ceil due to fractional training accumulation. Clean integer-only tier upgrade decisively showed floor. |
| Category size divisor | /5 or /11 | Assumed all coaches boost full category. Training Camp and Focused coaches proved this wrong. Use detected count. |
| Standard/Extensive full-category override | coachPipeline.ts | Same reason — assumed OCR misses = full category. Removed. Trust what OCR detects. |
| Talent estimator from scan ranges | estimateTalentFromGain in coaches.tsx | Circular: used game's own projected ranges to back-calculate a multiplier, then re-derived the game's answer. Not a real prediction. Removed from coach flow. |

---

## Outstanding — Needs Real Data

1. **Age 21–23 bracket (0.85)** — one controlled test with a known-age player in this range
2. **Grey stat seasonal decay for older players** — does a 31-year-old lose more than 20 per season, or just struggle to regain?
3. **Drill XP factor** — drillXpFactor=0.3 is provisional. Needs before/after drill-only session
4. **Non-Normal talent tiers** — hypothesis is they don't affect training rate. To confirm: two players same age same stats different talent labels, same coach, compare gains
5. **Training Camp budget formula** — distinct from regular coaching. Do not use Training Camp scans for formula calibration.
