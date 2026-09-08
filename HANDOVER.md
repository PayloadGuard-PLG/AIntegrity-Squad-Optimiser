# AIntegrity Squad Optimiser — Agent Handover Brief

**Branch:** feature branches off `main` (dev) / `main` (OTA deploy)
**As of:** Sprint 38 — 2026-09-08
**Deploy:** Push to `main` triggers EAS OTA auto-deploy (Android only). NEVER push to `main` directly from dev work — merge only when releasing.

---

## Current State

React Native / Expo SDK 53 app. **5 tabs:** SQUAD · PLAN · DRILLS · COACHES · RESULTS.

All tabs functional. Engine calibrated against empirical session data (Normal talent × multiple players). OTA pipeline live.

### What works

- **SQUAD tab** — player list, tap → edit/delete, OVR badge, QualityMeter atom (10-bar), tier/age/role display, snapshot revert banner, NewRoleBar for new-role progress
- **PLAN tab** — select player → configure drills + tier + restorers → step-by-step OVR projection. Auto-selects best affordable tier. Stats-derived OVR baseline when stats entered.
- **DRILLS tab** — 40 drills (all roles). Fan Club surge controls (active flag + level, independent axes). Condition cost per cycle shown as raw plus the billed envelope — the charge is not a deterministic function of raw. Zero-drain is RETIRED (patched out; 1% session minimum). Drill presets (saved drill plans). **PUSH TO RESULTS** button saves the active preset to `drill_plan_history` table for import into Results.
- **COACHES tab** — stat selector grid (white/grey sections), ×N sessions input, talent read from player card. SCAN button scans a coach preview screenshot (ML Kit OCR). No tier section — tier is in Results only. Per-stat gain projection + OVR delta. APPLY TO PLAYER CARD writes stats back. Coach scan auto-saves to `coach_scan_history` table for import into Results.
- **RESULTS tab** — the single authoritative plan hub. Chains: **DRILL PLANS** (from drills history, amber, max 10) → **COACHING SESSIONS** (from coach history, max 5) → **TIER UPGRADE** → **CONDITION RESTORE** → PROJECT button → per-step OVR chain → APPLY FULL PLAN TO CARD write-back.
- **Add Player** (`/player/new`) — SCAN PLAYER CARD screenshot button (ML Kit OCR). 3-col DEF/ATT/PHY scan preview. Role picker, stat grid, tier, talent, save.
- **Edit Player** (`/player/[id]`) — same as add + load existing + delete + snapshot revert. Double-tap a player chip to navigate here from Coaches tab.
- **QualityMeter** (`src/components/atoms/QualityMeter.tsx`) — 10-bar vertical OVR indicator (max=180, 18 OVR/bar). `md` (8×3px) for roster/headers; `sm` (5×2px) for chips.
- **NewRoleBar** (`src/components/atoms/NewRoleBar.tsx`) — horizontal 5-segment gradient bar showing new-role training progress (0–50 pts).
- **SplashAnimation** (`src/components/SplashAnimation.tsx`) — ~3.2s animated launch sequence. Color `#cc1111` throughout.
- **TabBackground** (`src/components/TabBackground.tsx`) — per-tab SVG background art. Unique accent per tab: Squad=blue, Plan=green, Drills=amber, Coaches=purple, Results=red.
- **Scan rejection** — irrelevant images render full-width preview with 85% overlay + "INVALID IMAGE". Form state never overwritten on rejection.
- **New role OCR** — scanner detects `ROLE+` tokens and nearby point count. `newRole` + `newRolePoints` stored. DB migration m0007.

---

## Tab Architecture (Sprint 30)

Sprint 30 simplified the tab architecture. The old Squad Plan tab was removed. Results is now the single combined hub.

| Tab | Role | Key change in Sprint 30 |
|---|---|---|
| SQUAD | Roster management | Unchanged |
| PLAN | Single-player drill+tier projection | Unchanged |
| DRILLS | Browse drills, build/run presets, push to Results | `pushToResults()` now saves to `drill_plan_history` |
| COACHES | Scan coach → project coaching gains → apply | Tier section removed; coach scan auto-saves to history |
| RESULTS | Combined hub: drill plans + coach sessions + tier + condition | Full rewrite — picks from histories |

---

## Visual Design System

All stat surfaces share the same **DEF / ATT / PHY column colour language**:

| Column | Hex | Stats |
|---|---|---|
| DEF | `#4A7FC1` | TACKLING, MARKING, POSITIONING, HEADING, BRAVERY, REFLEXES, AGILITY, ANTICIPATION, RUSHING OUT, COMMUNICATION |
| ATT | `#7C3AED` | PASSING, DRIBBLING, CROSSING, SHOOTING, FINISHING, THROWING, KICKING, PUNCHING, AERIAL REACH, CONCENTRATION |
| PHY | `#C05621` | FITNESS, STRENGTH, AGGRESSION, SPEED, CREATIVITY |

Each file that renders stat cells declares its own `STAT_COLS` / `COL_COLORS` / `statColor(stat)` helper (local, no shared import — avoids circular deps).

White stats (essential for role) render at full column colour. Grey stats use `cc + '44'` dimmed border, `inkMuted` label.

---

## Open Items (Priority Order)

| # | Area | Task | Priority |
|---|---|---|---|
| 1 | drillXpFactor calibration | `drillXpFactor = 0.3` is provisional. Needs actual before/after stat data from a controlled drill run to back-calculate the true factor. Do not change without real data. | High |
| 1a | Age-24 DMC player name | Saved as "Team: Insidious FC" — scanner read club name. Correct in DB. | Quick |
| 4 | New role — manual entry | `player/new.tsx` and `player/[id].tsx` have no UI fields for `newRole`/`newRolePoints`. Scanner populates on scan; manual entry not exposed. | Quick |
| 5 | Slow talent — no confirmed data point | Slow (0.47) **invalidated Sprint 34** — derived from LJDark Leo ×114 using linear budget. With geometric budget (`sessionBudgetDecay=0.99`), LJDark Leo result is consistent with Normal (1.0). Back-calculate from a confirmed-Slow player. | High |
| 6 | Fastest/Fast talent calibration | Currently community estimates (1.5 / 1.25). Needs known-talent players to confirm. | Medium |
| 9 | LJDark Leo talent unknown | Playstyle icon ≠ talent. Check Personal Trainer tab for the explicit Fastest/Fast/Average/Normal/Slow label. Determines whether LJDark Leo is the Slow recalibration candidate. | High |
| 7 | Premium sponsor cooldown | `isPremiumSponsor` stored but condition recovery cooldown reduction not modelled. | Low |
| 8 | Seasons planner | Project player across one full season including drills, tier, ~20% OVR decay. No implementation. | Low |

---

## Key Files

| File | Purpose |
|---|---|
| `profiles/game_2025.json` | ALL game constants — XP table, age/talent/drill multipliers, `baseXpPerSession=676`, `sessionBudgetDecay=0.99`, `drillXpFactor=0.3`, tier additions, condition model |
| `profiles/calibration_data.json` | Raw calibration observations — Ricky Grant, Ryan Rogers, LJDark Leo, Kevin McGinty |
| `profiles/player_seeds.json` | Definitive player records for DB re-entry if device is wiped |
| `src/types/resources.ts` | All TypeScript interfaces: GameProfile, DrillSession, InvestmentPlan, TierName, DrillLevel, TalentTier |
| `src/logic/xpEngine.ts` | XP math: `estimateStatGainPct` (fractional float), `qualityPctToOvr` (Math.floor), `applyTierBonusToStats` |
| `src/logic/customCoachEngine.ts` | `predictCustomDrill` — per-stat coaching gain prediction using real XP engine. `PlayerStats` requires `statValue` + `talent`; function requires `GameProfile` |
| `src/logic/ovrProjector.ts` | `computeOvrFromStats`, `computeOvrWithPadding`, `applyDrillSessionsToStats`, `projectOvr` |
| `src/logic/controller.ts` | `getDrillRecommendations` — ROI sort, condition costs |
| `src/logic/playerScanner.ts` | **⚠ CRITICAL** — on-device ML Kit OCR. Role detection anchored to "Roles:" label Y-band. Greedy role token parser for concatenated tokens. No API calls. |
| `src/logic/coachScanner.ts` | OCR for coach preview screenshots — type/category/multiplier; per-stat gain ranges; arrow indicator detection |
| `src/logic/coachPipeline.ts` | Post-OCR processing: discards image stat values, keeps stat names only, routes to XP engine |
| `src/utils/roleWeights.ts` | `ROLE_CONSTRAINTS`, `isWhiteStat`, `getWhiteStatKeys`, `getAllStatKeys`, `OUTFIELD_STATS`, `GK_STATS_ALL` |
| `src/database/drillDatabase.ts` | `DRILL_LIST` — 40 drills, each with fixed intensity, stats, baseLoss |
| `src/services/coachHistoryService.ts` | Save/load coach scan history per player for Results tab |
| `src/services/drillPlanHistoryService.ts` | Save/load drill plan history per player for Results tab |
| `src/services/drillPresetService.ts` | CRUD for `drill_presets` table |
| `src/services/squadPlanService.ts` | CRUD for `squad_plan_runs` (legacy history — kept for DB compatibility) |
| `src/db/index.ts` | DB setup + idempotent `ensure*` guards for all tables |
| `src/constants/theme.ts` | Design tokens — pitch-black bg, gunmetal surfaces, steelblue accent |
| `app/(tabs)/coaches.tsx` | Coaches tab — stat selector, projection, NO tier section (Sprint 30), apply/save |
| `app/(tabs)/results.tsx` | Results hub — drill plans + coach sessions + tier + condition (Sprint 30 full rewrite) |
| `app/(tabs)/drills.tsx` | Drills tab — browse, preset builder, push to Results |
| `app/(tabs)/plan.tsx` | Plan tab — single-player projection, step-by-step |
| `app/(tabs)/index.tsx` | Squad tab — roster |
| `app/player/new.tsx` | Add player — role picker, stat grid, tier, talent, scan |
| `app/player/[id].tsx` | Edit player — load existing, delete, snapshot revert |
| `CLAUDE.md` | Dev notes, sprint handovers, formula calibration history — read before touching scanner logic |

---

## Database Schema

Tables managed by `src/db/index.ts` with idempotent `ensure*` guards:

| Table | Migration | Purpose |
|---|---|---|
| `players` | m0001+ | Player records — stats, role, tier, talent, age, OVR, snapshot |
| `players.new_role` | m0007 | New-role training target (text) |
| `players.new_role_points` | m0007 | Progress toward new role unlock (0–50) |
| `squad_plan_runs` | m0004 | Legacy coaching run history (still populated by Coaches SAVE RUN) |
| `drill_presets` | ensureDrillPresetsTable | Named drill collections in Drills tab |
| `coach_scan_history` | ensureCoachHistoryTable | Coach scan results → available in Results COACHING SESSIONS |
| `drill_plan_history` | ensureDrillPlanHistoryTable | Pushed drill plans → available in Results DRILL PLANS |

---

## Critical Native Dependencies

**Zero LLM API calls. No Anthropic key, no OpenAI key, nothing.** All intelligence is on-device OCR or pure math.

| Package | Purpose | Must not be removed |
|---|---|---|
| `@react-native-ml-kit/text-recognition` | On-device OCR — player card + coach preview scanning | Yes |
| `expo-image-picker` | Camera + gallery access | Yes |
| `expo-sqlite` | Local DB — players, plan history, presets | Yes |

---

## Engine Reference

### OVR formula (confirmed — Math.ceil, Sprint 27)
```
OVR = ceil( sum(all 15 stats) / 15 )
```
Confirmed from 4 data points: McGinty (99.53→100), Rogers (120.6→121), Grant T2 (157.0→157), Grant T3 (175.4→176). Fixed in `qualityPctToOvr()` in `xpEngine.ts`. Any doc that says `floor` is stale.

### XP model (Sprint 31 — separate budgets for coaches and drills)
```
coach budget   = sessionCount × 450 (baseXpPerSession) / selectedStats.count
drill budget   = cycles × 450 × 0.3 (drillXpFactor) / drill.stats.length

xpBase(stat)   = 2.94 × exp(stat / 55)          [exponential model, Sprint 25]
xpCost(stat)   = xpBase(stat) / (ageMult × talentMult × greyMult × drillLevelMult)

drillLevelMult = profile.drillLevelMultipliers[drill.intensity]  (drills only)
drillLevelMult = 1.0 for ALL coach sessions (no intensity adjustment)
```

`drillXpFactor = 0.3` is **provisional** — uncalibrated. Needs real drill session before/after data.

### Age multipliers (from game_2025.json — confirmed)
17=1.10, 18=1.00, 19=1.00, 20=1.00, 21=0.85, 22=0.85, 23=0.85, 24=0.72, 25=0.72, 26=0.61, 27=0.61, 28=0.61, 29=0.50, 30+=0.

### Condition model
```
conditionLoss = 0.75 × condLevelMultipliers[intensity] × (1 − fanClubCondReduction[fanLevel])
isZeroDrain   = conditionLoss < 0.38   (only VE+L4 = 0.375%)
```

### Tier attribute additions (white stats only)
T0=0, T1=+10, T2=+30, T3=+50, T4=+80, T5=+120, T6=+160 (cumulative from baseline).
Step increments: T1=+10, T2=+20, T3=+20, T4=+30, T5=+40, T6=+40.

### XP cost table (stepped fallback)
| Stat | XP/1% |
|---|---|
| 0–59 | 8 |
| 60–79 | 10 |
| 80–99 | 20 |
| 100–119 | 30 |
| 120–139 | 40 |
| 140–159 | 50 |
| 160–179 | 60 |
| 180–199 | 80 |
| 200–219 | 150 |
| 220–239 | 200 |
| 240–259 | 260 |
| 260–279 | 340 |
| 280–339 | 440 |

Exponential model (`2.94 × exp(stat/55)`) supersedes this table when `xpCostBase` and `xpCostDecayK` are present in the profile.

### Role constraints (white = essential = full XP, grey = 0.5× XP)

```
GK:  white(11)=[REFLEXES,AGILITY,ANTICIPATION,RUSHING OUT,COMMUNICATION,THROWING,KICKING,PUNCHING,AERIAL REACH,CONCENTRATION,FITNESS]
     grey(4)=  [STRENGTH,AGGRESSION,SPEED,CREATIVITY]

ST:  white(9)=[POSITIONING,HEADING,PASSING,DRIBBLING,SHOOTING,FINISHING,STRENGTH,SPEED,CREATIVITY]
     grey(6)= [TACKLING,MARKING,BRAVERY,CROSSING,FITNESS,AGGRESSION]

DL/DR: white(8)=[TACKLING,MARKING,POSITIONING,BRAVERY,CROSSING,FITNESS,AGGRESSION,SPEED]
       grey(7)= [HEADING,PASSING,DRIBBLING,SHOOTING,FINISHING,STRENGTH,CREATIVITY]

AML/AMR: white(8)=[PASSING,DRIBBLING,CROSSING,SHOOTING,FINISHING,FITNESS,SPEED,CREATIVITY]
         grey(7)= [TACKLING,MARKING,POSITIONING,HEADING,BRAVERY,STRENGTH,AGGRESSION]

AMC: white(8)=[HEADING,PASSING,DRIBBLING,SHOOTING,FINISHING,FITNESS,SPEED,CREATIVITY]
     grey(7)= [TACKLING,MARKING,POSITIONING,BRAVERY,CROSSING,STRENGTH,AGGRESSION]

ML/MR: white(7)=[POSITIONING,PASSING,DRIBBLING,CROSSING,FITNESS,SPEED,CREATIVITY]
       grey(8)= [TACKLING,MARKING,HEADING,BRAVERY,SHOOTING,FINISHING,STRENGTH,AGGRESSION]

MC:  white(10)=[TACKLING,MARKING,POSITIONING,BRAVERY,PASSING,DRIBBLING,FITNESS,STRENGTH,SPEED,CREATIVITY]
     grey(5)=  [HEADING,CROSSING,SHOOTING,FINISHING,AGGRESSION]

DMC: white(9)= [TACKLING,MARKING,POSITIONING,HEADING,BRAVERY,PASSING,FITNESS,AGGRESSION,CREATIVITY]
     grey(6)=  [DRIBBLING,CROSSING,SHOOTING,FINISHING,SPEED,STRENGTH]

DC:  white(5)=[POSITIONING,HEADING,FITNESS,STRENGTH,AGGRESSION]
     grey(10)=[TACKLING,MARKING,BRAVERY,PASSING,DRIBBLING,CROSSING,SHOOTING,FINISHING,SPEED,CREATIVITY]
```

Multi-role white union: `isWhiteStat(roles, stat)` returns true if essential for ANY of the player's roles.

---

## Projection Honesty Contract — read before touching the seam

`src/logic/recommendation.ts` is the single domain seam for Drills, Coaches and
Results. It implements no mathematics of its own. Four rules are load-bearing;
each has a test that fails if it is undone.

1. **Coach classification gates the transfer function.** Ordinary Academy coaches
   use the calibrated geometric budget. Reward Coaches do not — matched previews
   falsify the ordinary transfer function (empty interval intersection across
   three observations), and no replacement is calibrated. They return
   `projectionStatus: 'unavailable'` carrying the observed intervals, with **no**
   `projectedStats` and **no** post-action OVR: unchanged values would be
   indistinguishable from a prediction of zero gain.

2. **An unclassified entry abstains — it is not "ordinary".** Coach history
   recorded before classification existed carries no marker of which kind it was,
   and Reward Coaches wear the same Standard/Extensive label, so the two are
   indistinguishable after the fact. Such rows read as `'unknown'` and abstain.
   They are identified by a `transfer_class_source` column (provenance), **not**
   by the stored class: an earlier migration already back-filled every
   pre-existing row with the literal `'ordinary'`, so the value can no longer
   identify them. Only `'observed'` provenance is trusted.

3. **A plan containing an un-projectable action is not totalled.** Results blocks
   the whole total and says why, rather than skipping the action or substituting
   zero. A partial total is a fabricated number.

4. **Star-band position is never laundered into certainty.** A card shows integer
   attributes; the sub-integer progress behind them is never displayed. A
   projection adds a computed gain `g` to an unknown starting fraction `ε`, so the
   result still carries `ε` — adding a known quantity to an unknown baseline
   leaves the uncertainty exactly where it was. `positionEvidence` is therefore
   `'lower-bound'`, and does **not** improve because our own model produced a
   decimal. Where attributes are missing, padding substitutes the player's
   overall and the position is not a bound in either direction — that abstains as
   `'unknown'`.

**Evidence grades mean what they say.** `'calibrated'` is reserved for constants
with a confirming game observation (Normal ×1.0; the 180 training lock).
`starDecayPerSession = 0.85` is graded `'assumed'`: observing that training gets
harder past a star fixes the *sign* of the effect, not the magnitude — any factor
in (0,1) fits the same observation.

---

## Confirmed Game Data

**OVR:** `Math.floor(sum/15)` — Sprint 27's `ceil` was an artefact of fractional stat accumulation and was overturned in Sprint 33 by a clean integer-only tier upgrade (sum 2615 → game 174; `ceil` gives 175). Do not reinstate `ceil`.

**Tier bonus:** White (essential) stats only — grey role stats and off-role stats receive 0. Confirmed Sprint 16.

**Zero-drain: RETIRED.** The game patched it. Every session is charged a **1% minimum**, so chasing sub-threshold drills is a penalty, not an exploit. `zeroDrainThreshold` remains in the profile only so it is not re-derived; nothing should branch on it.

**Charged condition is not a deterministic function of raw.** Raw is exact and matches the pre-confirm dialog; the charge is a distribution whose spread scales with the number of drills. Report a range, never a point estimate. Full evidence and the falsified models: `PRINCIPIA.md` Book III.

**Condition per restorer:** 15%.

**Fan Club condition reduction:** L0=10%, L1=15%, L2=20%, L3=25%, L4=50% — stored as FRACTIONS of 1 and applied as `(1 − r)`. A second `/100` was a live defect in the verification layer until Sprint 38; it is fixed on both sides.

**Surges have two independent axes:** `active` (loyalty-gated, resets each season) and `level` (chant-driven). A banked level confers **nothing** while inactive. Only Perfect Conditions is consumed by the engine.

**baseXpPerSession = 676 — an INTERVAL, not a point.** 676 is the FLOOR. Re-solving the calibration observations from their stated intervals rather than their midpoints admits **675–930**. The game states a range and never says where the expectation sits inside it, so back-calculating from `(lo+hi)/2` manufactures a precision the observation does not contain. Every projection is therefore at the conservative end of what the evidence permits. 676 is deliberately left unchanged rather than replaced with another convenient point.

**Budget is geometric, not linear:** `effectiveSessions = (1 − 0.99^N)/(1 − 0.99)`, plateauing at 100. This is what resolves the long-standing ×N anomaly (×20 ≈ ×40); star decay plays no part in the budget.

**LJDark Leo:** Age 18, Slow talent (×0.7), T0→T2 after ×114 Extensive GK + T1 + T2. Before: 143 OVR. After: 191 OVR. App prediction matched.

**Calibration players:** Ricky Grant (DL/ML/AML, age 20, Normal ×1.0), Ryan Rogers (AML/ML/DL, age 20, Normal ×1.0), Kevin McGinty (AMC, age 27, Normal ×1.0), LJDark Leo (GK, age 18, Slow ×0.7), Cptn Dallas (AMR/MR/DR, age 23, Normal ×1.0), Rayne (ML/DL/DC, age 21, Normal ×1.0).

---

## Verification Checklist (before any push)

```bash
npx tsc --noEmit   # must return zero errors
git push -u origin claude/test-connection-I2s8B   # dev branch only
# NEVER push directly to main — EAS OTA fires on merge to main
```

**Git discipline:** Always develop on `claude/test-connection-I2s8B`. Commit messages max 256 chars. Push to main only on explicit release instruction from Steve.
