# Squad Optimiser

A mobile-first decision engine that answers the question every manager asks before spending resources: **"Given exactly what I have right now, which player should I invest in, in what order, and what rating will they reach?"**

Built with React Native / Expo. Runs as a CLI today; mobile app in active development.

---

## What It Does

You have coaches, tier points, greens, and a budget. You have two players. You want a deterministic answer before committing anything.

Squad Optimiser models your resource pool against each player's age, current rating, role, and stat profile — then produces a ranked, step-by-step investment plan:

```
Alpha Striker (18yo, OVR 120) — Elite Chest coaches → Stellar
─────────────────────────────────────────────────────────────
Step 1  Apply Attacking ×30      120.0 → 130.3   (+10.3)   FREE
Step 2  Apply Defending ×40      130.3 → 140.2   (+9.9)    FREE
Step 3  Apply Physical ×28       140.2 → 152.0   (+11.8)   FREE
Step 4  Tier upgrade → Stellar   152.0 → 202.0   (+50.0)   600 pts
Step 5  100 greens (×1.3 bonus)  202.0 → 210.7   (+8.7)    100 greens
─────────────────────────────────────────────────────────────
Final OVR: 210.7   Total gain: +90.7
```

Then it compares that against every other candidate in your squad and tells you who benefits most from those exact resources.

---

## Key Features

- **Coaches-first enforcement** — the engine always applies coaches before tier upgrades. This is a hard rule, not a suggestion, and the step output makes the reasoning explicit.
- **Manager style modes**
  - `FTP` — owned coaches only, no store purchases
  - `Hybrid` — include store coaches up to a token budget you set
  - `PTW` — use all available coaches regardless of cost
- **OVR projection formula** — calibrated from empirical training data: age-based diminishing returns, stat-level gain factors, session-type bonuses (Seminar vs Training), and role-specific white/grey stat weighting.
- **Scenario comparison** — feed in N players, same resource pool; get back a ranked table and a plain-English recommendation.
- **Squad persistence** — add players once, plan against them anytime. File-based JSON for CLI; SQLite (Drizzle ORM) for the mobile app.
- **Drill optimiser** — Fan Club level-aware drill selection with condition cost modelling and Zero-Drain protocol detection.

---

## Architecture

```
src/
├── types/resources.ts          — Coach, ManagerProfile, InvestmentPlan, TierName types
├── database/playerSchema.ts    — Player interface + squad persistence
├── logic/
│   ├── ovrProjector.ts         — Step-by-step OVR chain (coaches → tier → greens)
│   ├── investmentEngine.ts     — Style-filtered planning + recommendation assembly
│   ├── scenarioComparator.ts   — Multi-player ranking for shared resource pool
│   ├── controller.ts           — Drill selection orchestration
│   ├── mutantEngine.ts         — Green efficiency + premium bonus modelling
│   └── zeroDrainProtocol.ts    — Zero-condition-loss drill protocol
├── utils/
│   ├── coachMath.ts            — Gain formula: age factor, stat curve, session bonus
│   ├── roleWeights.ts          — Role constraints and white/grey stat classification
│   └── conditionEngine.ts      — Condition cost per drill type
└── services/storageService.ts  — Load/save squad JSON
```

---

## Getting Started

```bash
npm install
npm run cli            # interactive squad manager
tsx tests/investment-test.ts   # run scenario test
npm run typecheck      # tsc --noEmit
```

### CLI options

```
1. View Squad
2. Drill Optimiser
3. Add Player
4. Plan Investment
5. Compare Players
6. Exit
```

---

## Status

| Area | Status |
|---|---|
| Coach gain formula | Empirically calibrated — formula refinement pending research docs |
| Drill optimiser | Complete |
| Investment engine | Complete |
| Scenario comparator | Complete |
| CLI | Complete |
| Mobile UI (Expo) | In progress — next sprint |
| Screenshot OCR | Stub — planned |
| Drizzle DB migrations | Stub — pending schema stabilisation |

---

## Docs

- [`DEVLOG.md`](./DEVLOG.md) — sprint-by-sprint build history
- [`WHITEPAPER.md`](./WHITEPAPER.md) — formula derivations, calibration data, design decisions

---

## Disclaimer

This project is entirely unofficial and unaffiliated with any game developer, publisher, or platform. No game assets, trademarks, or proprietary data are used or reproduced. All formula calibration is based on publicly observable behaviour. This tool is for personal, non-commercial use.
