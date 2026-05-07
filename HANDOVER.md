# AIntegrity Squad Optimiser — Agent Handover Brief

**Branch:** `claude/continue-development-uXA5D`
**As of:** Sprint 8 — 2026-05-07 night
**Deploy:** `git push origin claude/continue-development-uXA5D` → GitHub Actions → EAS OTA → reopen app

---

## Current State

React Native / Expo app. **4 tabs:** SQUAD · PLAN · DRILLS · COACHES.

All tabs functional. Engine calibrated against real coaching data. OTA pipeline working.

### What works
- **SQUAD tab** — player list, tap → edit, OVR badge, tier/age/role display
- **PLAN tab** — select player, configure drills + tier + greens → step-by-step OVR projection. Auto-selects best affordable tier. Stats-computed OVR baseline when stats entered. TextInput for greens and sessions. Smarter skip warnings.
- **DRILLS tab** — drill recommendations sorted by ROI (lowest white stat value = cheapest XP). Fan Club L0–L4 selector. Zero-drain protocol detection at L4 + Very Easy. Condition cost display.
- **COACHES tab** *(new Sprint 8)* — stat selector grid (white/grey), session count × N, intensity picker, talent + 2× ad toggle, per-stat gain projection + OVR output.
- **XP engine** — fractional gains, calibrated `baseXpPerSession = 150`, no star decay, budget divided by drill stat count. Validated vs Standard Attacking ×30 real data.
- **GK role** — confirmed 10 white / 5 grey stats. Solo only.
- **Drill database** — 24 drills. Use Your Head and Stop the Attacker corrected from confirmed screenshots.

---

## Open Items (Priority Order)

| # | Area | Task | Priority |
|---|---|---|---|
| 4 | GK stat entry UI | `app/player/new.tsx` + `app/player/[id].tsx` always show outfield stats grid regardless of GK role. Need conditional GK_STATS grid when role = GK. | Medium |
| 5 | Premium sponsor cooldown | `isPremiumSponsor` stored but condition recovery reduction from premium milestones not modelled in engine. | Medium |
| 6 | CLI drill levels | `src/index.ts` prompts updated to new drill level names but not tested end-to-end. | Low |
| 7 | Squad-wide season simulator | Plan tab projects one player. User confirmed ~+7 OVR/season from squad-wide L4 zero-drain Very Easy drilling (all low white stats). Not expressible in current UI. | Low |
| — | Coaches tab: scenario validation | User will provide coaching scenarios from the game. Update intensity → multiplier mapping as data comes in. Each coach type in game (Standard/Focused/Extensive) maps to an approximate intensity level — to be confirmed per screenshot. | Next |

---

## Key Files

| File | Purpose |
|---|---|
| `profiles/game_2025.json` | ALL game constants — XP table, age/talent multipliers, statCap=340, baseXpPerSession=150, starDecayPerSession=1.0, drillLevelMultipliers, tierAttrAdditions |
| `src/types/resources.ts` | All TypeScript interfaces: GameProfile, ManagerProfile, DrillSession, InvestmentPlan, TierName, DrillLevel, TalentTier |
| `src/logic/xpEngine.ts` | XP math: `xpBaseForStat`, `xpNeededFor1Pct`, `estimateStatGainPct` (fractional float return) |
| `src/logic/ovrProjector.ts` | `applyDrillSessionsToStats`, `projectOvr`, `computeOvrFromStats`, `computeOvrWithPadding` (exported) |
| `src/logic/investmentEngine.ts` | `planPlayerInvestment`, `compareInvestmentScenarios` |
| `src/logic/controller.ts` | `getDrillRecommendations` — ROI sort (ascending avgWhiteStatValue), condition costs |
| `src/utils/roleWeights.ts` | `ROLE_CONSTRAINTS` (white/grey per role), `isWhiteStat`, `getWhiteStatKeys`, `getAllStatKeys` |
| `src/database/drillDatabase.ts` | `DRILL_LIST` — 24 drills, stats, baseLoss, isBase |
| `src/constants/theme.ts` | Design tokens — pitch-black bg, gunmetal surfaces, steelblue accent, hot-orange, pos/neg |
| `src/components/AppHeader.tsx` | 4-tab nav: SQUAD `/` · PLAN `/plan` · DRILLS `/drills` · COACHES `/coaches` |
| `app/(tabs)/plan.tsx` | Plan tab — bordered config cards, auto-tier, stats-win baseline, TextInput sessions/greens |
| `app/(tabs)/coaches.tsx` | Coach tab — stat selector grid, sessions ×N, intensity/talent, OVR projection |
| `app/(tabs)/drills.tsx` | Drills tab — ROI sort, fan club selector, zero-drain detection |
| `app/player/new.tsx` | Add player — role picker, stat grid (outfield; GK fix pending), tier, talent, save |
| `app/player/[id].tsx` | Edit player — same as new.tsx + loads existing + delete |

---

## Engine Reference

### XP model
```
budget_per_stat  = sessionCount × baseXpPerSession (150) / drill.stats.length
xpCost_per_1%   = xpCostTable[statValue] / (ageMult × talentMult × greyMult × adMult × drillMult)
gain            = fractional; partial XP banks as carry toward next integer
```

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

### Calibration data (Standard Attacking ×30, age 18, Normal, Medium)
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
None=0, Rare=+10, Elite=+30, Stellar=+50, Master=+80, Epic=+120, Legendary=+160 (per white stat)

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

**Fan Club condition reduction** (L4 = 50% — confirmed in-game):
`[0.10, 0.15, 0.20, 0.25, 0.50]` (L0 → L4)

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

**Validated season meta (user-confirmed):**
~+7 OVR/season from squad-wide strategy: L4 Fan Club zero-drain, all low white stats open, free ad drills for teamplay maintenance, Very Easy drills with 50% perfect conditions.

---

## Verification Checklist (before any push)

```bash
npm run typecheck   # must return zero errors — no exceptions
git push -u origin claude/continue-development-uXA5D
```

App updates on next open (EAS OTA). No store submission required.
