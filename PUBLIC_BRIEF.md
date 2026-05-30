# AIntegrity Squad Optimiser — Public Brief

**Decision-support tool demonstrating pure-function mathematical pipeline architecture.**

---

## Problem

Football management simulation games involve complex resource optimisation decisions: which players to train, in what order, how to allocate limited training sessions, and when diminishing returns make further investment suboptimal. The calculations involve exponential cost curves, compounding efficiency factors, and hard caps that interact in non-obvious ways.

This tool solves the optimisation problem with a rigorous mathematical pipeline — and in doing so demonstrates a pure-function architecture pattern applicable to any domain requiring deterministic, testable computation.

---

## Architecture

A 16-stage pure-function pipeline where each stage takes primitives and returns values. No side effects. No database access within the computation layer. Each stage can be tuned, tested, or replaced independently.

```
Pipeline order (enforced by game mechanics):
  Drills → Coaching → Tier Upgrade → Restorers (condition only)

Stage map:
   1. xpCostAtStat        — cost curve: C₀ × e^(stat/K)
   2. ageMultiplier        — age efficiency factor
   3. talentMultiplier     — talent tier efficiency factor
   4. greyMultiplier       — white vs grey stat weight (1.0x vs 0.22x)
   5. starDecayMultiplier  — intra-session decay every 20 OVR gained
   6. combinedMultiplier   — compounded efficiency (all factors in one place)
   7. coachBudgetPerStat   — XP available per stat for coaching session
   8. drillBudgetPerStat   — XP available per stat for drill session
   9. statGainFromBudget   — integral: stat points the budget buys
  10. ovrFromStats         — OVR formula: floor(sum / 15)
  11. tierOvrContrib       — tier's OVR contribution
  12. baseOvrFromTotal     — base OVR (total minus tier contrib)
  13. isTrainingLocked     — training lock check (base OVR ≥ 180%)
  14. conditionDrainPct    — condition lost per drill
  15. isZeroDrain          — zero-drain detection
  16. conditionRestoredPct — condition from restorers
```

---

## Key Mathematical Models

### Exponential Cost Model

Each stat point costs exponentially more than the last:

```
Cost(stat) = C₀ × e^(stat / K)
```

Where K (curvature constant) is calibrated at 47 based on empirical game data.

### Geometric Decay

Multi-session coaching follows diminishing returns:

```
Efficiency(session_n) = base × decay^n
```

### Star Decay

Intra-session efficiency penalty applied every 20 OVR gained — prevents runaway accumulation within a single session.

### 180-Rule

Hard cap on training once base OVR reaches 180%. The `isTrainingLocked` function implements the boundary check.

---

## Technology Stack

- **Core:** TypeScript (strict mode)
- **UI:** React Native with Expo SDK 53, Expo Router
- **Persistence:** SQLite via expo-sqlite, Drizzle ORM
- **OCR:** Google ML Kit Text Recognition (player stat extraction from screenshots)
- **Calibration:** JSON profiles per game version (profiles/)

---

## Design Principles

1. **Pure functions** — The engine layer (`src/engine/engineMath.ts`) has zero imports from React Native, zero database access, zero side effects. Every function takes primitives, returns a value.

2. **Testability** — Each of the 16 stages can be unit-tested in isolation with known inputs and expected outputs. No mocking required.

3. **Separation of concerns** — Logic (`src/logic/`), services (`src/services/`), engine (`src/engine/`), and UI (`app/`) are strictly separated. The engine knows nothing about persistence or presentation.

4. **Calibration-driven** — Game-version-specific constants live in JSON profiles, not hardcoded. The K-constant, cost curve parameters, and talent multipliers are all configurable without code changes.

5. **Domain modelling** — Concepts like White Stats, Grey Stats, Talent Tiers, Zero-Drain, and the 180-Rule are modelled explicitly as named functions, not magic numbers.

---

## Development Context

- **Timeline:** 3 months (March–May 2026)
- **Developer:** Solo — Steven Dark (Aberdeen, Scotland)
- **Method:** AI-directed development from a mobile device
- **Quality scores:** GitRoll 4.99/5.00 reliability, 4.99/5.00 security, 4.99/5.00 maintainability

---

## What This Demonstrates

1. **Mathematical modelling** — Exponential cost curves, geometric decay, compound multipliers implemented as a composable pipeline
2. **Pure-function architecture** — 16 stages with zero side effects, independently testable and replaceable
3. **Mobile-first development** — Full React Native application with OCR, SQLite, and offline-first architecture
4. **Domain-driven design** — Complex game mechanics modelled as explicit, named abstractions rather than procedural code
5. **Calibration engineering** — Empirically derived constants (K=47) with JSON-based per-version configuration

---

## Contact

For enquiries: see the [portfolio page](https://payloadguard-plg.github.io/payload-consequence-analyser/) or contact Steven Dark directly via [GitHub](https://github.com/DarkVader-PLG).
