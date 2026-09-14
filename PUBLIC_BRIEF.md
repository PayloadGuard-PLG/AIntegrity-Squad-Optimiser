# Squad Optimiser — Public Brief

**Author:** Steven Dark | Aberdeen, Scotland

---

## Framing

This is NOT a gaming app. It is a resource allocation optimizer that uses a mobile game as a controlled experimental environment.

The game provides what real-world logistics problems rarely offer: a closed system with observable inputs, deterministic outputs, and the ability to run controlled experiments from a phone. Every design decision in this project — the mathematical pipeline, the calibration methodology, the privacy model — is motivated by the problem of optimizing resource allocation under uncertainty, not by the game itself.

---

## What the "Game" Models

| Game Concept | What It Actually Is |
|-------------|---------------------|
| Players | Assets with measurable attributes |
| Drills | Resource investments with diminishing returns (geometric decay) |
| Tier upgrades | Irreversible state transitions that permanently alter the cost basis |
| The "one rule" (always drill before tier upgrade) | A sequencing constraint that minimises total resource expenditure |

The fundamental problem is: given a set of assets with exponentially increasing improvement costs and irreversible upgrade checkpoints, what is the optimal investment sequence to maximise value per unit of resource spent?

This is operations research.

---

## Mathematical Modelling

A 16-stage pure-function mathematical pipeline, where each stage is independently testable and tunable:

`xpCostAtStat` → `ageMultiplier` → `talentMultiplier` → `greyMultiplier` → `starDecayMultiplier` → `combinedMultiplier` → `coachBudgetPerStat` → `drillBudgetPerStat` → `statGainFromBudget` → `ovrFromStats` → (and additional projection stages)

Key mathematical properties:
- **Exponential cost curves** — each stat point costs exponentially more than the last, following C₀ × e^(stat/K) where K is a calibrated curvature constant
- **Geometric decay** — diminishing returns within training sessions (sessionBudgetDecay = 0.99), modelling resource exhaustion
- **Compounding multipliers** — talent, age, star rating, and grey stat penalties interact multiplicatively, creating a non-linear optimisation surface
- **Pure functions** — every stage takes inputs and returns outputs with no side effects, enabling compositional testing and formal reasoning

---

## Empirical Calibration

> "Community data is not trusted. Every engine constant must be back-calculated from actual game screenshots."

The calibration methodology treats the game as a black box and reverse-engineers its internal model through controlled observation:

| Epistemic Status | Meaning |
|-----------------|---------|
| **Confirmed** | Back-calculated from observed data with reproducible methodology |
| **Assumed** | No direct observation available — labelled explicitly as assumption |
| **Invalidated** | Previously confirmed but overturned by new evidence |

Example of self-correction: The Slow talent multiplier was originally confirmed at 0.47 based on observed data. When the budget model was revised from linear to geometric, this value was invalidated and recalculated. The invalidation is documented, not hidden.

This is the epistemic equivalent of a scientific lab notebook — every constant has a provenance chain, and corrections are visible in the record.

---

## Design Constraints

- **Zero network calls during operation** — no API keys, no telemetry, no analytics
- **All OCR runs on-device** via ML Kit — images processed in memory, never persisted or transmitted
- **All player data stays on device** — local SQLite database, no cloud sync
- **No account, no login** — the app functions without any form of user identity
- **No data leaves the phone** — every calculation runs on-device

---

## Privacy Model

This project demonstrates how data processing should work in privacy-constrained, low-connectivity environments:

1. **Capture** — camera captures game screen (image stays in memory)
2. **Extract** — on-device OCR extracts numerical values (ML Kit, no network)
3. **Process** — pure-function pipeline calculates projections (no side effects)
4. **Store** — results persist in local SQLite (no cloud, no sync)
5. **Display** — user views results on-device

At no point in this pipeline does data leave the device. There is no "backend." The phone is the entire system.

---

## Technical Stack

| Component | Technology |
|-----------|-----------|
| Framework | React Native (Expo) |
| Language | TypeScript |
| Database | SQLite (expo-sqlite) |
| OCR | Google ML Kit (on-device) |
| Updates | EAS OTA (Expo Application Services) |

---

## What This Project Demonstrates

- **Black-box reverse engineering of opaque systems** — extracting the mathematical model from a system with no public documentation through controlled experimentation
- **Empirical calibration under uncertainty** — every constant back-calculated from observation with explicit epistemic status labelling
- **Mathematical modelling with self-correcting methodology** — invalidated assumptions are documented and revised, not hidden
- **Privacy-first architecture design** — complete data processing pipeline with zero network dependency
- **Resource optimisation under constraints** — operations research applied to a tractable problem domain with measurable outcomes
