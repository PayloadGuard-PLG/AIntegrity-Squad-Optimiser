# AIntegrity Squad Optimiser — Agent Handover Brief

**Branch:** `claude/continue-development-uXA5D`
**As of:** Sprint 9 — 2026-05-08
**Deploy:** `git push -u origin claude/continue-development-uXA5D` → GitHub Actions → EAS OTA → reopen app

---

## Current State

React Native / Expo app. **5 tabs:** SQUAD · PLAN · DRILLS · COACHES · RESULTS.

All tabs functional. Engine calibrated. Tier bonus formula corrected in Sprint 9. OTA pipeline working.

### What works
- **SQUAD tab** — player list, tap → edit, OVR badge, tier/age/role display
- **PLAN tab** — select player, configure drills + tier + greens → step-by-step OVR projection. Auto-selects best affordable tier. Stats-computed OVR baseline when stats entered. TextInput for greens and sessions. Smarter skip warnings.
- **DRILLS tab** — drill recommendations sorted by ROI (lowest white stat value = cheapest XP). Fan Club L0–L4 selector. Zero-drain protocol detection at L4 + Very Easy. Condition cost display.
- **COACHES tab** — stat selector grid (white/grey), session count × N, intensity picker, talent + 2× ad toggle, per-stat gain projection + OVR output. Tier upgrade preview with correct key-stat count.
- **RESULTS tab** *(new Sprint 9)* — chains multiple coaching sessions + tier upgrade + greens into one sequential OVR projection. Tab bar is horizontal ScrollView (5 tabs fit without overflow).
- **XP engine** — fractional gains, `baseXpPerSession = 150`, no star decay, budget ÷ drill stat count. Validated vs Standard Attacking ×30 real data.
- **GK role** — confirmed 10 white / 5 grey stats. Solo only.
- **Drill database** — 24 drills. Corrected from confirmed data.
- **Tier bonus** — `applyTierBonusToStats` now uses `getAllStatKeys()` (essentials + secondaries). Confirmed correct vs Ricky Grant ELITE→STELLAR snapshot.

---

## Critical Facts (read before touching engine)

### OVR formula
```
OVR = floor(sum_of_all_15_stats / 15)
```
Confirmed 5× independently across multiple players. `qualityOvrDivisor = 1` in game_2025.json.

### Tier bonus formula
The game applies the tier stat increment to **`getAllStatKeys(roles)`** — role essentials + role secondaries. NOT just essentials.

```
OVR gain from tier = floor(increment × n_key_stats / 15)
  where n_key_stats = len(getAllStatKeys(player.role))
```

Confirmed: Ricky Grant ELITE→STELLAR (+20 per stat, 13 key stats for DL/ML/AML):
- 13 stats gained +20: all essentials (9) + secondaries (FITNESS, AGGRESSION, SPEED, CREATIVITY)
- 2 stats unchanged: HEADING, STRENGTH (not in any DL/ML/AML key set)
- OVR: 157 → 174 = +17 = floor(13 × 20 / 15) ✓

**Fix applied Sprint 9:** `coaches.tsx` (×2), `results.tsx`, `ovrProjector.ts` (×2) all use `getAllStatKeys`.

### Coaching XP vs drill XP
Coach sessions give ~4–5× more XP per session than regular drills. `baseXpPerSession=150` is calibrated to regular drills — cannot replicate coaching gain numbers exactly. Use ratio-based estimates from in-game coach preview ranges.

---

## Open Items (Priority Order)

| # | Area | Task | Priority |
|---|---|---|---|
| 5 | Premium sponsor cooldown | `isPremiumSponsor` stored but condition recovery reduction from premium milestones not modelled in engine. | Medium |
| 6 | CLI drill levels | `src/index.ts` prompts updated to new drill level names but not tested end-to-end. | Low |
| 7 | Squad-wide season simulator | Plan tab projects one player. ~+7 OVR/season from squad-wide L4 zero-drain Very Easy drilling. Not expressible in UI. | Low |
| — | Defending ×35 for Ricky Grant | Standard Defending ×35 (all 5 stats) at STELLAR not yet fully calculated and logged. Coaching preview screenshots exist in session transcript. | Next |
| — | Tier key-stat count for other roles | Confirmed for DL/ML/AML (13). GK predicted 11, midfielders predicted 10–12. Need one confirmed before/after per role group. | Data |

---

## Key Files

| File | Purpose |
|---|---|
| `profiles/game_2025.json` | ALL game constants — XP table, age/talent multipliers, statCap=340, baseXpPerSession=150, starDecayPerSession=1.0, drillLevelMultipliers, tierAttrAdditions |
| `src/types/resources.ts` | All TypeScript interfaces: GameProfile, ManagerProfile, DrillSession, InvestmentPlan, TierName, DrillLevel, TalentTier |
| `src/logic/xpEngine.ts` | XP math: `xpBaseForStat`, `xpNeededFor1Pct`, `estimateStatGainPct` (fractional float return), `applyTierBonusToStats` |
| `src/logic/ovrProjector.ts` | `applyDrillSessionsToStats`, `projectOvr`, `computeOvrFromStats`, `computeOvrWithPadding` (exported) |
| `src/logic/investmentEngine.ts` | `planPlayerInvestment`, `compareInvestmentScenarios` |
| `src/logic/controller.ts` | `getDrillRecommendations` — ROI sort (ascending avgWhiteStatValue), condition costs |
| `src/utils/roleWeights.ts` | `ROLE_CONSTRAINTS` (white/grey per role), `isWhiteStat`, `getWhiteStatKeys`, **`getAllStatKeys`** |
| `src/database/drillDatabase.ts` | `DRILL_LIST` — 24 drills, stats, baseLoss, isBase |
| `src/constants/theme.ts` | Design tokens — pitch-black bg, gunmetal surfaces, steelblue accent, hot-orange, pos/neg |
| `src/components/AppHeader.tsx` | 5-tab nav (horizontal ScrollView): SQUAD · PLAN · DRILLS · COACHES · RESULTS |
| `app/(tabs)/plan.tsx` | Plan tab — bordered config cards, auto-tier, stats-win baseline, TextInput sessions/greens |
| `app/(tabs)/coaches.tsx` | Coach tab — stat selector grid, sessions ×N, intensity/talent, OVR projection + tier preview |
| `app/(tabs)/results.tsx` | Results tab — chains sessions + tier + greens into sequential OVR projection |
| `app/(tabs)/drills.tsx` | Drills tab — ROI sort, fan club selector, zero-drain detection |
| `app/player/new.tsx` | Add player — role picker, stat grid, tier, talent, save |
| `app/player/[id].tsx` | Edit player — same as new.tsx + loads existing + delete |
| `data/CALIBRATION_LOG.md` | All confirmed game data: drill gains, OVR snapshots, tier upgrades, coaching projections |

---

## Engine Reference

### XP model
```
budget_per_stat  = sessionCount × baseXpPerSession (150) / drill.stats.length
xpCost_per_1%   = xpCostTable[statValue] / (ageMult × talentMult × greyMult × adMult × drillMult)
gain            = fractional; partial XP banks as carry toward next integer
```

### XP cost table (`profiles/game_2025.json`)
| Stat range | XP/1% |
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

### Age multipliers
17=1.10, 18=1.00, 19=0.90, 20=0.55, 21=0.40, 22=0.32, 23=0.28, 24=0.24, 25=0.22, 26=0.19, 27=0.16, 28=0.14, 29=0.12, 30+=0.10

### Tier attribute additions (per key stat)
None=0, Rare=+10, Elite=+30, Stellar=+50, Master=+80, Epic=+120, Legendary=+160

Increments (step-by-step): None→Rare=+10, Rare→Elite=+20, Elite→Stellar=+20, Stellar→Master=+30, Master→Epic=+40, Epic→Legendary=+40

### Tier points required to upgrade
None=0, Rare=100, Elite=90, Stellar=50, Master=25, Epic=15, Legendary=10

### Role constraints (white = essential = full XP; grey = secondary = 0.5× XP)
```
ST:  white=[FINISHING,SHOOTING,DRIBBLING,PASSING,POSITIONING,HEADING]  grey=[STRENGTH,SPEED,CREATIVITY]
GK:  white=[REFLEXES,AGILITY,ANTICIPATION,RUSHING OUT,COMMUNICATION,THROWING,KICKING,PUNCHING,AERIAL REACH,CONCENTRATION]  grey=[FITNESS,STRENGTH,AGGRESSION,SPEED,CREATIVITY]
AMC: white=[PASSING,DRIBBLING,SHOOTING,FINISHING,HEADING]  grey=[SPEED,CREATIVITY,FITNESS]
AML: white=[CROSSING,DRIBBLING,PASSING,SHOOTING,FINISHING]  grey=[FITNESS,SPEED,CREATIVITY]
AMR: same as AML
ML:  white=[CROSSING,PASSING,DRIBBLING,POSITIONING]  grey=[FITNESS,SPEED,CREATIVITY]
MR:  same as ML
MC:  white=[PASSING,DRIBBLING,SHOOTING,TACKLING,POSITIONING,BRAVERY]  grey=[FITNESS,STRENGTH,SPEED,CREATIVITY]
DMC: white=[TACKLING,MARKING,POSITIONING,HEADING,BRAVERY,PASSING]  grey=[FITNESS,STRENGTH,AGGRESSION]
DC:  white=[TACKLING,MARKING,POSITIONING,HEADING,BRAVERY]  grey=[STRENGTH,AGGRESSION]
DL:  white=[TACKLING,MARKING,POSITIONING,BRAVERY,CROSSING]  grey=[FITNESS,AGGRESSION,SPEED]
DR:  same as DL
```

### getAllStatKeys (key stats for tier bonus) — confirmed
```
DL/ML/AML: 13 stats = all essentials (9) + FITNESS, AGGRESSION, SPEED, CREATIVITY
           NOT key: HEADING, STRENGTH
           Confirmed by Ricky Grant ELITE→STELLAR snapshot ✓
GK:        predicted 11 = 10 essentials + 1 grey (likely FITNESS) — unconfirmed
Others:    use getAllStatKeys() output — confirmed count varies by role combo
```

---

## Confirmed Game Data

**Fan Club condition reduction** (L4 = 50%): `[0.10, 0.15, 0.20, 0.25, 0.50]` (L0 → L4)

**Zero-drain condition:** L4 Fan Club + Very Easy drill = 0% condition loss.

**Condition per green:** 15% per green.

**Drill condition loss** (base, before Fan Club reduction):
- Warm-Up: 0.5% | Video Analysis: 0.75% | Stretch: 0.75%
- Skill Drill: 1.5% | Hurdles: 1.5% | Slalom Dribble: 1.5% | Set-Piece Delivery: 1.5%
- Pass Go & Shoot: 2.25% | Shooting Technique: 2.25% | Sprints: 2.25% | Shuttle Runs: 2.25%
- Piggy in the Middle: 1.5% | Defensive Line: 1.5% | Defending Crosses: 1.5% | Hold the Line: 1.5%
- Press the Play: 2.25% | Wing Play: 3.0% | Long Run: 3.0% | Use Your Head: 3.0%
- Fast Counter-Attacks: 3.75% | Gym: 4.5% | Stop the Attacker: 4.5%
- 1-on-1 Finishing: 2.25% | Carioca with Ladders: 1.5% | Hurdle Jumps: 1.5%

**Calibration (Standard Attacking ×30, age 18, Normal, Medium):**
| Stat | Start | Observed | Model |
|---|---|---|---|
| Passing | 121 | +26–33 | ~27 ✓ |
| Dribbling | 132 | +20–27 | ~25 ✓ |
| Crossing | 132 | +20–27 | ~25 ✓ |
| Shooting | 129 | +21–29 | ~26 ✓ |
| Finishing | 127 | +22–30 | ~27 ✓ |

**Validated season meta (user-confirmed):** ~+7 OVR/season from squad-wide L4 zero-drain Very Easy drilling (all low white stats open, free ad drills for teamplay maintenance).

---

## Verification Checklist (before any push)

```bash
npm run typecheck   # must return zero errors — no exceptions
git push -u origin claude/continue-development-uXA5D
```

App updates on next open (EAS OTA). No store submission required.
