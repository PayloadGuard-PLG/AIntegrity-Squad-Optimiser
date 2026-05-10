# AIntegrity Squad Optimiser — Agent Handover Brief

**Branch:** `claude/continue-session-UHXEX`
**As of:** Session UHXEX — 2026-05-10 (Sprint 13)
**Deploy:** `git push -u origin claude/continue-session-UHXEX` → GitHub Actions → EAS OTA → reopen app

---

## Current State

React Native / Expo app (also runs in browser via `npx expo start --web`). **5 tabs:** SQUAD · PLAN · DRILLS · COACHES · RESULTS.

All tabs functional. Engine calibrated against real data. OTA pipeline working.

### What works

- **SQUAD tab** — player list, tap → edit, OVR badge, tier/age/role display
- **SQUAD PLAN tab** — per-player run history from Coaches projections. OVR before/after, stat gains, tier, date, delete. Backed by `squad_plan_runs` DB table (migration 0004).
- **COACH CAPTURE screen** (`/coach/capture`) — calibration data logger. Squad auto-fill (copies stats/OVR/talent), per-stat lo/hi gain entry, live OVR boost preview, saves to Squad Plan. Accessible via `→ CAPTURE` button in Coaches tab.
- **COACHES tab** — 3-column stat grid (5 rows per section), 2× AD removed, SAVE RUN button persists to Squad Plan, CAPTURE link in header.
- **PLAN tab** — select player, configure drills + tier + greens → step-by-step OVR projection. Auto-selects best affordable tier. Stats-computed OVR baseline when stats entered. TextInput for greens and sessions. Smarter skip warnings.
- **DRILLS tab** — all 25 drills shown for all players (no role filter). ROI sort (lowest white stat value = cheapest XP). Fan Club L0–L4 selector. Zero-drain detection (VE+L4 = 0.375% → shows 0%). Condition cost display per drill (direct % matching game display).
- **COACHES tab** — stat selector grid (white/grey), session count ×N, intensity locked to Very Hard, talent read from player card. Per-stat gain projection + OVR output. TIER UPGRADE section shows combined coach+tier OVR. APPLY TO PLAYER CARD writes stats back.
- **RESULTS tab** — chains multiple coaching blocks + tier + greens into a full OVR plan. APPLY FULL PLAN TO CARD write-back.
- **XP engine** — fractional gains, calibrated `baseXpPerSession = 150`, no star decay, budget divided by drill stat count. Validated vs Standard Attacking ×30 real data.
- **Tier bonus** — role stats (white+grey via `getAllStatKeys`) get full increment; off-role stats get flat +1. Confirmed from Ricky Grant ELITE→STELLAR: 13 role stats +20, HEADING and STRENGTH (off-role for DL) each +1. OVR 175 matched engine exactly.
- **OVR formula** — `floor(mean(all 15 stats))`. Confirmed from Sutters GK: sum 2,844 ÷ 15 = 189.6 → displays 189.
- **GK role** — confirmed 10 white / 5 grey stats. Solo only. Stat grid complete (15 stats).
- **Talent** — stored on player card; read by Coaches and Results tabs.
- **Drill database** — 25 drills. All `baseLoss = 0.75`. Condition cost is level-based (not drill-based).
- **Tier bonus** — role stats (white+grey = `getAllStatKeys`) get full increment; off-role stats get +1 flat. Validated against Ricky Grant Elite→Stellar (OVR 175 matched exactly).
- **Player snapshot / revert** — APPLY TO CARD saves pre-apply state as a `snapshot` field. Orange banner on player edit screen; tap to revert with confirmation. DB migration 0003.

---

## Open Items (Priority Order)

| # | Area | Task | Priority |
|---|---|---|---|
| — | Beta testing | Ongoing — Squad Plan + Coach Capture are new; expect UX feedback from real use. | Immediate |
| — | Ball Control drill | Missing from `DRILL_LIST`. Trains Concentration, Dribbling, Heading, Creativity. Appears in game calibration data. Type TBC (possibly Attack). Add when type confirmed. | High |
| — | Condition validation | Confirm COND_LEVEL_MULTIPLIERS at Easy, Medium, Hard levels. Only VE and VH cross-checked so far. | Medium |
| 5 | Premium sponsor cooldown | `isPremiumSponsor` stored but condition recovery reduction from premium milestones not modelled in engine. | Medium |
| 6 | CLI drill levels | `src/index.ts` prompts updated to new drill level names but not tested end-to-end. | Low |
| 7 | Squad-wide season simulator | Plan tab projects one player. ~+7 OVR/season confirmed from squad-wide L4 Very Easy drilling. Not expressible in current UI. | Low |

---

## Key Files

| File | Purpose |
|---|---|
| `profiles/game_2025.json` | ALL game constants — XP table, age/talent multipliers, statCap=340, baseXpPerSession=150, starDecayPerSession=1.0, drillLevelMultipliers (XP only), tierAttrAdditions |
| `src/utils/conditionEngine.ts` | Condition model — `COND_LEVEL_MULTIPLIERS` (VE×1→VH×5), `FAN_CLUB_REDUCTIONS`, `calculateActualLoss(baseLoss, fanLevel, drillLevel)` |
| `src/types/resources.ts` | All TypeScript interfaces: GameProfile, ManagerProfile, DrillSession, InvestmentPlan, TierName, DrillLevel, TalentTier |
| `src/logic/xpEngine.ts` | XP math: `xpBaseForStat`, `xpNeededFor1Pct`, `estimateStatGainPct` (fractional float return) |
| `src/logic/ovrProjector.ts` | `applyDrillSessionsToStats`, `projectOvr`, `computeOvrFromStats`, `computeOvrWithPadding` (exported); tier bonus uses `getAllStatKeys` |
| `src/logic/investmentEngine.ts` | `planPlayerInvestment`, `compareInvestmentScenarios` |
| `src/logic/controller.ts` | `getDrillRecommendations` — ROI sort, condition costs, no efficiency filter |
| `src/utils/roleWeights.ts` | `ROLE_CONSTRAINTS` (white/grey per role), `isWhiteStat`, `getWhiteStatKeys`, `getAllStatKeys` |
| `src/database/drillDatabase.ts` | `DRILL_LIST` — 25 drills, all `baseLoss = 0.75`, stats, isBase |
| `src/constants/theme.ts` | Design tokens — pitch-black bg, gunmetal surfaces, steelblue accent, hot-orange, pos/neg |
| `src/components/AppHeader.tsx` | 5-tab scrollable nav: SQUAD · PLAN · DRILLS · COACHES · RESULTS |
| `app/(tabs)/plan.tsx` | Plan tab — bordered config cards, auto-tier, stats-win baseline, TextInput sessions/greens |
| `app/(tabs)/coaches.tsx` | Coaches tab — stat selector, ×N sessions, VH locked, talent from card, tier upgrade card, apply-gains |
| `app/(tabs)/drills.tsx` | Drills tab — all drills, ROI sort, fan club selector, zero-drain detection |
| `app/(tabs)/squad-plan.tsx` | Squad Plan tab — per-player run history, OVR deltas, stat gains, delete |
| `app/coach/capture.tsx` | Coach Capture screen — calibration data logger, squad auto-fill, lo/hi gains, OVR boost preview |
| `src/services/squadPlanService.ts` | CRUD for squad_plan_runs: saveRun, getRunsForPlayer, getAllRuns, deleteRun |
| `app/(tabs)/results.tsx` | Results tab — full OVR chain: coaching blocks + tier + greens, apply full plan |
| `app/player/new.tsx` | Add player — role picker, stat grid (GK or outfield), tier, talent, save |
| `app/player/[id].tsx` | Edit player — same as new.tsx + loads existing + delete |

---

## Engine Reference

### XP model
```
budget_per_stat  = sessionCount × baseXpPerSession (150) / drill.stats.length
xpCost_per_1%   = xpCostTable[statValue] / (ageMult × talentMult × greyMult × adMult × drillLevelMult)
gain            = fractional; partial XP banks as carry toward next integer
OVR             = floor(mean(all 15 stats))
```

### Condition model
```
conditionLoss = 0.75 × COND_LEVEL_MULTIPLIERS[drillLevel] × (1 − FAN_CLUB_REDUCTIONS[fanLevel] / 100)
isZeroDrain   = conditionLoss < 0.5%   (fires at VE+L4 = 0.375%)
```

COND_LEVEL_MULTIPLIERS: Very Easy=1, Easy=2, Medium=3, Hard=4, Very Hard=5

### XP cost table (profiles/game_2025.json)
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

### Calibration data
Standard Attacking ×30, age 18, Normal talent, Medium intensity:
| Stat | Start | Observed | Model |
|---|---|---|---|
| Passing | 121 | +26–33 | ~27 ✓ |
| Dribbling | 132 | +20–27 | ~25 ✓ |
| Crossing | 132 | +20–27 | ~25 ✓ |
| Shooting | 129 | +21–29 | ~26 ✓ |
| Finishing | 127 | +22–30 | ~27 ✓ |

### Age multipliers
17=1.10, 18=1.00, 19=0.90, 20=0.55, 21=0.40, 22=0.32, 23=0.28, 24=0.24, 25=0.22, 26=0.19, 27=0.16, 28=0.14, 29=0.12, 30+=0.10

### Tier attribute additions
None=0, Rare=+10, Elite=+30, Stellar=+50, Master=+80, Epic=+120, Legendary=+160 (per stat — applied to ALL 15 stats, not just white)

### Tier points required to upgrade
None=0, Rare=100, Elite=90, Stellar=50, Master=25, Epic=15, Legendary=10

### Role constraints (white stats = essential = full XP; grey = secondary = 0.5× XP)
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

---

## Confirmed Game Data

**Fan Club condition reduction** (confirmed): `[0.10, 0.15, 0.20, 0.25, 0.50]` (L0 → L4)

**Condition loss formula** (confirmed Sprint 11):
- baseLoss = **0.75% for all drills** (level-based, not drill-specific)
- `COND_LEVEL_MULTIPLIERS`: VE×1, Easy×2, Medium×3, Hard×4, VH×5
- VE+L4 = 0.375% → displays as **0%** (zero drain)
- Easy+L4 = 0.75% → not zero drain

**Condition per green:** 15% per green.

**OVR formula:** `floor(mean(all 15 stats))` — truncation confirmed from Sutters GK snapshot.

**Tier bonus:** Applied to all 15 stats (white + grey). Confirmed from Ricky Grant ELITE→STELLAR (13/15 stats +20 each; 2 at cap).

**Zero-drain condition:** VE + L4 = 0.375% < 0.5% threshold → shown as 0% in game. Only fires at this combination.

**Validated season meta (user-confirmed):**
~+7 OVR/season from squad-wide strategy: L4 Fan Club zero-drain, all low white stats open, free ad drills for teamplay maintenance, Very Easy drills.

---

## Verification Checklist (before any push)

```bash
npm run typecheck   # must return zero errors — tsconfig baseUrl deprecation warning is pre-existing, ignore it
git push -u origin claude/continue-session-UHXEX
```

App updates on next open (EAS OTA). No store submission required.
