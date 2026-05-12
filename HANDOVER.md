# AIntegrity Squad Optimiser — Agent Handover Brief

**Branch:** `main` (PRs #19–21 merged 2026-05-12)
**As of:** Sprint 16 — 2026-05-12 (Session CAQUS)
**Deploy:** Create a new branch from `main`, push, PR back. EAS OTA auto-fires on merge to `main` (Android only).

---

## Current State

React Native / Expo SDK 53 app (also runs in browser). **6 tabs:** SQUAD · PLAN · DRILLS · COACHES · SQUAD PLAN · RESULTS.

All tabs functional. Engine calibrated against empirical session data. OTA pipeline live.

### What works

- **SQUAD tab** — player list, tap → edit/delete, OVR badge, tier/age/role display, snapshot revert banner
- **SQUAD PLAN tab** — per-player history of saved coaching projections. OVR before/after, stat gains, session count, tier, date, delete. Backed by `squad_plan_runs` DB table (migration 0004).
- **COACH CAPTURE screen** (`/coach/capture`) — calibration data logger. Navigate to it via the PROJECT button after a coach scan, or directly from the app. Squad auto-fill copies stats/OVR/talent from player card. Per-stat lo/hi gain entry (tap to expand). Live OVR boost preview. Saves to Squad Plan.
- **COACHES tab** — 3-col stat selector grid (white/grey sections), ×N sessions input, intensity locked to Very Hard, talent read from player card. SCAN button scans a coach preview screenshot and pre-fills session count. Per-stat gain projection + OVR delta. TIER UPGRADE section shows combined coach+tier OVR. APPLY TO PLAYER CARD writes stats back. SAVE RUN persists to Squad Plan.
- **PLAN tab** — select player, configure drills + tier + restorers → step-by-step OVR projection. Auto-selects best affordable tier. Stats-derived OVR baseline when stats entered.
- **DRILLS tab** — all 25 drills for all players (no role filter). ROI sort (lowest white stat = cheapest XP). Fan Club L0–L4 selector. Zero-drain detection (VE+L4 = 0.375%). Condition cost per drill.
- **RESULTS tab** — chains multiple coaching blocks + tier + restorers into a full OVR plan. APPLY FULL PLAN TO CARD write-back.
- **Add Player** (`/player/new`) — SCAN PLAYER CARD screenshot button (ML Kit OCR, no API). 3-col DEF/ATT/PHY scan preview. Role picker, stat grid, tier, talent, save.
- **Edit Player** (`/player/[id]`) — same as add + load existing + delete + snapshot revert.

### Visual Design System

All stat surfaces share the same **DEF / ATT / PHY column colour language**:

| Column | Hex | Stats |
|---|---|---|
| DEF | `#4A7FC1` | TACKLING, MARKING, POSITIONING, HEADING, BRAVERY, REFLEXES, AGILITY, ANTICIPATION, RUSHING OUT, COMMUNICATION |
| ATT | `#7C3AED` | PASSING, DRIBBLING, CROSSING, SHOOTING, FINISHING, THROWING, KICKING, PUNCHING, AERIAL REACH, CONCENTRATION |
| PHY | `#C05621` | FITNESS, STRENGTH, AGGRESSION, SPEED, CREATIVITY |

Each file that renders stat cells declares its own `STAT_COLS` / `COL_COLORS` / `statColor(stat)` helper (local, no shared import — avoids circular deps). Pattern to copy when adding new stat surfaces:

```typescript
const STAT_COLS = {
  DEF: new Set(['TACKLING','MARKING','POSITIONING','HEADING','BRAVERY','REFLEXES','AGILITY','ANTICIPATION','RUSHING OUT','COMMUNICATION']),
  ATT: new Set(['PASSING','DRIBBLING','CROSSING','SHOOTING','FINISHING','THROWING','KICKING','PUNCHING','AERIAL REACH','CONCENTRATION']),
  PHY: new Set(['FITNESS','STRENGTH','AGGRESSION','SPEED','CREATIVITY']),
};
const COL_COLORS = { DEF: '#4A7FC1', ATT: '#7C3AED', PHY: '#C05621' } as const;
function statColor(stat: string): string {
  if (STAT_COLS.DEF.has(stat)) return COL_COLORS.DEF;
  if (STAT_COLS.ATT.has(stat)) return COL_COLORS.ATT;
  return COL_COLORS.PHY;
}
```

White stats (essential for role) render at full column colour. Grey stats (secondary/non-role) use `cc + '44'` or `'55'` dimmed border, `inkMuted` label.

---

## Open Items (Priority Order)

| # | Area | Task | Priority |
|---|---|---|---|
| 1 | OCR — roles | Token-exact matching is now in place. Still possible to get zero roles if the screenshot crops the role badges. Add a fallback: if no roles detected, keep the previously selected roles (don't wipe them). | Medium |
| 2 | Touch Training drill | In `DRILL_LIST` as of Sprint 15. Stats: `['CONCENTRATION','DRIBBLING','HEADING','CREATIVITY']`, intensity Very Easy, baseLoss 0.75. Type TBC. | Resolved |
| 3 | Condition validation | Confirm `COND_LEVEL_MULTIPLIERS` at Easy and Hard levels. Only VE and VH cross-checked against real screenshots. | Medium |
| 4 | Coach Capture → real calibration | The Capture screen is built but gains entered there don't update `game_2025.json` or the XP engine. Future: use captured lo/hi to back-solve actual XP budget and validate against model. | Low |
| 5 | Premium sponsor cooldown | `isPremiumSponsor` stored but condition recovery reduction from premium milestones not modelled in engine. | Low |
| 6 | CLI drill levels | `src/index.ts` updated to new drill level names but not tested end-to-end. | Low |
| 7 | Squad-wide season simulator | Plan tab projects one player. ~+7 OVR/season confirmed from squad-wide L4 Very Easy drilling. Not expressible in current UI. | Low |
| 8 | AppHeader 6th tab | SQUAD PLAN is in the tab bar but the AppHeader scrollable nav still shows 5 tabs. Confirm SQUAD PLAN appears in `src/components/AppHeader.tsx` `NAV_ITEMS` array. | Quick check |

---

## Key Files

| File | Purpose |
|---|---|
| `profiles/game_2025.json` | ALL game constants — XP table, age/talent multipliers, statCap=9999 (inert sentinel; real gate is maxBaseOvr=180), baseXpPerSession=150, drillLevelMultipliers (XP only), tierAttrAdditions |
| `src/utils/conditionEngine.ts` | Condition model — `COND_LEVEL_MULTIPLIERS` (VE×1→VH×5), `FAN_CLUB_REDUCTIONS`, `calculateActualLoss` |
| `src/types/resources.ts` | All TypeScript interfaces: GameProfile, DrillSession, InvestmentPlan, TierName, DrillLevel, TalentTier |
| `src/logic/xpEngine.ts` | XP math: `estimateStatGainPct` (fractional float), `applyTierBonusToStats` |
| `src/logic/ovrProjector.ts` | `computeOvrFromStats`, `computeOvrWithPadding`, `applyDrillSessionsToStats`, `projectOvr` |
| `src/logic/controller.ts` | `getDrillRecommendations` — ROI sort, condition costs |
| `src/utils/roleWeights.ts` | `ROLE_CONSTRAINTS`, `isWhiteStat`, `getWhiteStatKeys`, `getAllStatKeys`, `OUTFIELD_STATS`, `GK_STATS` |
| `src/logic/playerScanner.ts` | **⚠ CRITICAL** — on-device ML Kit OCR. `Y_TOL=28` (stat names), `Y_TOL_VAL=20` (values), `Y_BELOW=40`, cap 500. Role detection: token split + fullText regex backup. Name filter rejects digit-prefixed blocks. No API calls. |
| `src/logic/coachScanner.ts` | OCR for coach preview screenshots — type/category/multiplier from header; per-stat gain ranges from highlighted rows |
| `src/logic/pickImage.ts` | Gallery/camera picker wrapper; shared `picker.active` flag |
| `src/hooks/useScanner.ts` | React hook wrapping `scanPlayerCard` |
| `src/database/drillDatabase.ts` | `DRILL_LIST` — 25 drills, all `baseLoss = 0.75` |
| `src/constants/theme.ts` | Design tokens — pitch-black bg, gunmetal surfaces, steelblue accent |
| `src/components/AppHeader.tsx` | Scrollable tab nav |
| `src/services/squadPlanService.ts` | CRUD for `squad_plan_runs`: saveRun, getRunsForPlayer, getAllRuns, deleteRun |
| `app/(tabs)/coaches.tsx` | Coaches tab — stat selector, projection, tier upgrade, apply/save |
| `app/(tabs)/squad-plan.tsx` | Squad Plan tab — per-player run history |
| `app/coach/capture.tsx` | Coach Capture screen — calibration logger |
| `app/player/new.tsx` | Add player — role picker, stat grid, tier, talent, scan |
| `app/player/[id].tsx` | Edit player — load existing, delete, snapshot revert |

---

## Critical Native Dependencies

**Zero LLM API calls. No Anthropic key, no OpenAI key, nothing.** All intelligence is on-device OCR or pure math.

| Package | Purpose | Must not be removed |
|---|---|---|
| `@react-native-ml-kit/text-recognition` | On-device OCR — player card scanning | Yes |
| `expo-image-picker` | Camera + gallery access | Yes |
| `expo-sqlite` | Local DB — players, squad plan runs | Yes |

**Rule:** Any PR removing `src/logic/playerScanner.ts`, `src/logic/pickImage.ts`, or these packages must explicitly justify what replaces the functionality. Never remove as "cleanup".

---

## Engine Reference

### XP model
```
budget_per_stat  = sessionCount × 150 (baseXpPerSession) / drill.stats.length
xpCost_per_1%   = xpCostTable[statValue] / (ageMult × talentMult × greyMult × drillLevelMult)
gain             = fractional float; OVR = floor(mean(all 15 stats))
```

### Condition model
```
conditionLoss = 0.75 × COND_LEVEL_MULTIPLIERS[drillLevel] × (1 − FAN_CLUB_REDUCTIONS[fanLevel] / 100)
isZeroDrain   = conditionLoss < 0.5%   (only fires at VE+L4 = 0.375%)
```
COND_LEVEL_MULTIPLIERS: VE=1, Easy=2, Medium=3, Hard=4, VH=5

### XP cost table
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

### Tier attribute additions (per stat, applied to WHITE/essential stats only)
None=0, Rare=+10, Elite=+30, Stellar=+50, Master=+80, Epic=+120, Legendary=+160

### Tier points to upgrade
Rare=100, Elite=90, Stellar=50, Master=25, Epic=15, Legendary=10

### Role constraints (white = essential = full XP, grey = 0.5× XP)
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

**OVR formula:** `floor(mean(all 15 stats))` — confirmed from Sutters GK (sum 2,844 ÷ 15 = 189.6 → displays 189).

**Tier bonus:** Applied to WHITE (essential) stats only — grey role stats and off-role stats receive 0. Confirmed from direct game observation (Sprint 16). Earlier Sprint 12 calibration claimed role stats (white+grey); that has been superseded.

**Zero-drain:** VE + L4 = 0.375% → shown as 0%. Only this combination.

**Condition per restorer:** 15%.

**Fan Club condition reduction:** L0=10%, L1=15%, L2=20%, L3=25%, L4=50%.

**Calibration data (Standard Attacking ×30, age 18, Normal talent, Medium):**
| Stat | Start | Observed | Model |
|---|---|---|---|
| Passing | 121 | +26–33 | ~27 ✓ |
| Dribbling | 132 | +20–27 | ~25 ✓ |
| Crossing | 132 | +20–27 | ~25 ✓ |
| Shooting | 129 | +21–29 | ~26 ✓ |
| Finishing | 127 | +22–30 | ~27 ✓ |

---

## Verification Checklist (before any push)

```bash
npx tsc --noEmit   # must return zero errors
git push -u origin <your-branch>
# EAS OTA fires automatically on merge to main
```

**Branching convention:** Always branch from `main`. Dev branches are workspaces only. Merge to `main` when done. `main` = source of truth.
