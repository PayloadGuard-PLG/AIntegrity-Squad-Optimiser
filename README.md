# AIntegrity Squad Optimiser

A mobile-first investment planner for stat-based football management games. Answers the question every manager asks before spending resources: **which player, which drills, which tier — and exactly what OVR will they reach?**

Built with React Native / Expo SDK 53. Deployed via EAS OTA — no app store submission required for updates.

---

## What It Does

You have coaches, tier points, restorers, and a budget. You have a squad. You want a deterministic answer before committing anything.

The engine models each player's age, role, stat profile, talent tier, and current stat values — then projects an exact OVR outcome for any combination of coaching sessions, tier upgrade, and condition resources. All calculations are on-device. No accounts, no servers, no API calls.

---

## Six Tabs

| Tab | Purpose |
|---|---|
| **SQUAD** | All players — OVR, role, age, tier. Tap to edit. Scan a player card screenshot to auto-fill stats. One-step revert if you apply gains by mistake. |
| **PLAN** | Configure drills + tier + restorers for a player → step-by-step OVR projection with per-resource gain breakdown. |
| **DRILLS** | All 25 drills ranked by ROI (lowest white stat value first = cheapest XP). Fan Club level selector. Zero-drain detection at L4 + Very Easy. |
| **COACHES** | Select which stats a coaching block covers, enter session count (×N) → exact per-stat gains and OVR delta. Scan a coach preview screenshot to auto-fill. Tier upgrade card shows combined OVR. |
| **SQUAD PLAN** | Saved history of coaching projections per player — OVR before/after, stat gains, session count, tier, date. |
| **RESULTS** | Full OVR chain: multiple coaching blocks + tier upgrades + restorers in one sequential plan. Apply the full plan to a player card in one tap. |

---

## On-Device OCR Scanning

Tap **SCAN PLAYER CARD SCREENSHOT** in Add Player to extract all 15 stats, OVR, age, role, tier, and talent directly from a screenshot — no manual entry required. Coach preview screenshots can also be scanned from the Coaches tab (⊕ SCAN) to auto-fill session count.

All scanning uses **ML Kit on-device text recognition** (`@react-native-ml-kit/text-recognition`). Zero network requests. Zero API keys.

---

## Engine Overview

```
Coaching Sessions  →  Tier Upgrade  →  Restorers (condition only)
```

**Drills-first rule:** Always run coaching before tier upgrade. Tier raises base stat values permanently — drilling afterwards costs more XP per gain. Drills first maximises total gain per resource unit.

**XP model (calibrated):**
```
budget_per_stat = sessionCount × 150 (baseXpPerSession) / drill.stats.length
xpCost_per_1%  = xpCostTable[stat] / (ageMult × talentMult × greyMult × drillLevelMult)
gain           = fractional accumulation until budget exhausted or stat cap (340) reached
```

Validated against Standard Attacking ×30 real data (age 18, Normal talent, Medium intensity):

| Stat | Start | Observed | Model |
|---|---|---|---|
| Passing | 121 | +26–33 | ~27 ✓ |
| Dribbling | 132 | +20–27 | ~25 ✓ |
| Crossing | 132 | +20–27 | ~25 ✓ |

**OVR formula (confirmed):**
```
OVR = floor(mean(all 15 stats))
```

Confirmed from Sutters GK: sum 2,844 ÷ 15 = 189.6 → game displays **189** (truncated, not rounded).

**Tier bonus:** Applied to all 15 stats. Role stats (white + grey) receive the full tier increment; off-role stats get +1 flat. Validated against Ricky Grant Elite→Stellar (OVR 175 matched engine exactly).

---

## Visual Design

Stats are grouped into three columns — **DEF** (blue `#4A7FC1`), **ATT** (purple `#7C3AED`), **PHY** (burnt orange `#C05621`) — consistently across every screen that displays individual stats. White (essential) stats for a player's role appear at full column colour; grey (secondary) stats are dimmed. The column grouping is fixed to the stat, not the player.

---

## Architecture

```
app/(tabs)/
├── index.tsx          — Squad list
├── plan.tsx           — Investment projection (drills + tier + restorers)
├── drills.tsx         — Drill recommendations ranked by ROI
├── coaches.tsx        — Coach session simulator (stat selector, OVR output, SAVE RUN)
├── squad-plan.tsx     — Saved projection history per player
└── results.tsx        — Full OVR chain (multi-block + tier + restorers)

app/
├── player/new.tsx     — Add player (OCR scan + manual entry)
├── player/[id].tsx    — Edit player (load existing, delete, snapshot revert)
└── coach/capture.tsx  — Coach Session Capture (calibration data logger)

src/
├── types/resources.ts       — All interfaces: GameProfile, ManagerProfile, DrillSession…
├── database/
│   ├── playerSchema.ts      — Player interface + SQLite schema
│   └── drillDatabase.ts     — DRILL_LIST: 25 drills with stats, baseLoss
├── logic/
│   ├── playerScanner.ts     — ML Kit OCR for player card screenshots (no API calls)
│   ├── coachScanner.ts      — ML Kit OCR for coach preview screenshots
│   ├── xpEngine.ts          — XP cost formula, estimateStatGainPct, applyTierBonusToStats
│   ├── ovrProjector.ts      — computeOvrFromStats, computeOvrWithPadding, applyDrillSessions
│   ├── investmentEngine.ts  — planPlayerInvestment, compareInvestmentScenarios
│   └── controller.ts        — getDrillRecommendations (ROI sort, condition costs)
├── utils/
│   ├── roleWeights.ts       — ROLE_CONSTRAINTS, isWhiteStat, getWhiteStatKeys, getAllStatKeys
│   └── conditionEngine.ts   — COND_LEVEL_MULTIPLIERS, calculateActualLoss
├── services/
│   ├── playerService.ts     — Player CRUD + applyAndSnapshot + revertToSnapshot
│   └── squadPlanService.ts  — saveRun, getRunsForPlayer, getAllRuns, deleteRun
├── context/ManagerContext.tsx — tierPoints, drillLevel, isPremiumSponsor state
└── components/
    ├── AppHeader.tsx         — 6-tab scrollable nav
    └── atoms/               — MonoLabel, Chip, CornerBrackets, OvrMovement

profiles/game_2025.json      — All game constants (XP table, age/talent multipliers, tier additions…)
drizzle/                     — SQLite migrations (0000–0004)
```

---

## Quick Start

```bash
npm install
npx tsc --noEmit     # zero errors required before any push
```

Requires a **dev build** (not Expo Go) — ML Kit is a native module. Build once with EAS, then all subsequent updates are OTA.

### Deploy (EAS OTA)

```bash
# Branch from main, make changes, then PR back
git checkout -b feature/my-change
git push -u origin feature/my-change
# Merge PR → GitHub Actions → EAS OTA → reopen app to receive update
```

Branch protection on `main` is intentional. All changes go through PRs. `main` = source of truth.

---

## Web App

The app runs in the browser via `npx expo start --web`. On web, `localStorage` replaces SQLite — Metro resolves the `.web.ts` variants automatically:

| Native | Web |
|--------|-----|
| `src/db/index.ts` (expo-sqlite) | `src/db/index.web.ts` (no-op migration) |
| `src/services/playerService.ts` (Drizzle) | `src/services/playerService.web.ts` (localStorage) |
| `src/hooks/useSquad.ts` (useLiveQuery) | `src/hooks/useSquad.web.ts` (useState + window events) |

OCR scanning is not available on web (ML Kit is native-only). All other tabs work fully.

### Build for static hosting

```bash
npx expo export -p web
# outputs to dist/ — deploy to GitHub Pages, Netlify, Cloudflare Pages, etc.
```

---

## Docs

| File | Content |
|---|---|
| [`WHITEPAPER.md`](./WHITEPAPER.md) | Full formula derivations, XP calibration, role weights, tier model, OCR system |
| [`DEVLOG.md`](./DEVLOG.md) | Sprint-by-sprint build history — what shipped, what broke, what's next |
| [`HANDOVER.md`](./HANDOVER.md) | Agent handover brief — current state, open items, key file map, engine reference |
| [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) | Open bugs + resolved issue log |
| [`data/CALIBRATION_LOG.md`](./data/CALIBRATION_LOG.md) | Calibration data used to validate the engine |

---

## Disclaimer

Unofficial and unaffiliated with any game developer or publisher. No game assets or proprietary data used. All calibration is based on publicly observable game behaviour. Personal, non-commercial use only.
