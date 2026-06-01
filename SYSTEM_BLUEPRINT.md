# SYSTEM BLUEPRINT
**AIntegrity Squad Optimiser**
Version: 1.1 · Updated: 2026-06-01 · Classification: Internal Architecture Reference

---

> **Summary.** Squad Optimiser is a deterministic, offline-first player development and
> coaching projection tool for competitive squad management. It ingests structured data from
> in-game screenshots via on-device optical character recognition, maintains a persistent
> local registry of players and their stats, and applies a formally-verified mathematical
> pipeline to project the outcome of any proposed coaching session before it is committed.
> All computation is deterministic and pure-functional; given the same inputs the engine
> always produces the same outputs. The system carries no network dependency at runtime —
> it runs entirely on-device. A three-layer formal verification stack (Dafny · Z3 · Crosshair)
> proves nineteen named safety properties over the core pipeline and gates every change to the
> main branch via CI.

---

## 1. Repository Layout

```
.
├── app/                              # Expo Router screen tree — UI only, no engine logic
│   ├── _layout.tsx                   # Root: DB bootstrap, splash gate, tab navigator
│   ├── (tabs)/
│   │   ├── _layout.tsx               # Tab bar configuration
│   │   ├── index.tsx                 # Squad registry — list, search, quick-select
│   │   ├── coaches.tsx               # Coaching session planner — scan → project → compare
│   │   ├── drills.tsx                # Drill scheduler — condition drain forecast
│   │   ├── plan.tsx                  # Development planning workspace
│   │   ├── results.tsx               # Historical coaching outcomes log
│   │   └── squad-plan.tsx            # Multi-player deployment configuration builder
│   ├── coach/
│   │   └── capture.tsx               # OCR capture flow for coach preview screenshots
│   ├── player/
│   │   ├── [id].tsx                  # Player detail / edit screen
│   │   └── new.tsx                   # Player intake form (manual entry)
│   └── compare.tsx                   # Side-by-side player comparison view
│
├── src/
│   ├── engine/                       # ★ Core deterministic math — no React, no I/O
│   │   ├── engineMath.ts             # All 16 projection stages (pure functions)
│   │   └── engineConstants.ts        # Typed re-exports from profiles/game_2025.json
│   │
│   ├── logic/                        # Orchestration and scanning pipelines
│   │   ├── coachScanner.ts           # OCR parser — coach preview screenshots
│   │   ├── coachPipeline.ts          # Post-scan routing: category resolution, fallbacks
│   │   ├── playerScanner.ts          # OCR parser — player card screenshots
│   │   ├── investmentEngine.ts       # Multi-session coaching projection orchestrator
│   │   ├── ovrProjector.ts           # OVR projector with training lock check
│   │   ├── customCoachEngine.ts      # Parameterised coaching session evaluator
│   │   ├── scenarioComparator.ts     # A/B scenario comparison engine
│   │   ├── fixtureEngine.ts          # Match scheduling logic
│   │   ├── zeroDrainEngine.ts        # Zero condition-drain drill detector
│   │   ├── zeroDrainProtocol.ts      # Zero-drain reporting and advisory
│   │   ├── mutantEngine.ts           # Edge-case and stress-scenario evaluator
│   │   ├── xpEngine.ts               # Legacy projection shim (deprecated)
│   │   ├── controller.ts             # High-level action controller
│   │   └── pickImage.ts              # Device camera/gallery abstraction
│   │
│   ├── services/                     # Database access layer (Drizzle ORM + expo-sqlite)
│   │   ├── playerService.ts          # Player CRUD, tier normalisation, snapshot management
│   │   ├── playerService.web.ts      # Web stub for playerService
│   │   ├── coachService.ts           # Coaching session record service
│   │   ├── coachHistoryService.ts    # Historical coaching outcomes
│   │   ├── drillPresetService.ts     # Saved drill schedule presets
│   │   ├── drillPlanHistoryService.ts# Drill plan history
│   │   ├── squadPlanService.ts       # Deployment configuration persistence
│   │   └── storageService.ts         # Generic key-value storage abstraction
│   │
│   ├── utils/                        # Stateless utility functions
│   │   ├── coachMath.ts              # Deprecated projection shim (backward compatibility)
│   │   ├── conditionEngine.ts        # Condition drain calculation helpers
│   │   ├── optimiserMath.ts          # Allocation optimisation utilities
│   │   ├── roleWeights.ts            # White/grey stat classification by player role
│   │   ├── modifiers.ts              # Modifier chain helpers
│   │   └── math.ts                   # General-purpose numeric utilities
│   │
│   ├── components/                   # Reusable UI components
│   │   ├── atoms/
│   │   │   ├── Chip.tsx
│   │   │   ├── CornerBrackets.tsx
│   │   │   ├── MonoLabel.tsx
│   │   │   ├── NewRoleBar.tsx
│   │   │   ├── OvrMovement.tsx
│   │   │   └── QualityMeter.tsx
│   │   ├── AppHeader.tsx
│   │   ├── CoachInputRow.tsx
│   │   ├── DrillSessionRow.tsx
│   │   ├── DrillTable.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── HelpModal.tsx
│   │   ├── InvestmentStepTable.tsx   # Per-stat gain breakdown table
│   │   ├── OVRBadge.tsx              # Overall rating badge
│   │   ├── PlayerCard.tsx            # Player summary card
│   │   ├── SplashAnimation.tsx       # Boot sequence animation
│   │   ├── StatGrid3Col.tsx          # Three-column stat grid
│   │   ├── TabBackground.tsx         # Per-tab ambient background art
│   │   └── TierBadge.tsx             # Player tier badge
│   │
│   ├── database/                     # Legacy database helpers
│   │   ├── drillDatabase.ts
│   │   └── playerSchema.ts
│   │
│   ├── db/                           # Active database layer
│   │   ├── schema.ts                 # Drizzle table definitions
│   │   ├── index.ts                  # Connection, migration runner, idempotency guards
│   │   └── index.web.ts              # Web stub
│   │
│   ├── hooks/
│   │   ├── useScanner.ts             # OCR scan lifecycle hook
│   │   ├── useSquad.ts               # Squad state hook
│   │   └── useSquad.web.ts           # Web stub
│   │
│   ├── constants/
│   │   └── theme.ts                  # Design system tokens
│   │
│   ├── types/
│   │   └── resources.ts              # Canonical TypeScript interfaces and union types
│   │
│   └── context/
│       └── ManagerContext.tsx        # Global manager context provider
│
├── profiles/
│   ├── game_2025.json                # ★ Live calibrated constants (OTA-updatable)
│   │                                 #   Single source of truth for every engine parameter.
│   │                                 #   Read by both engineConstants.ts and constants_pure.py.
│   ├── calibration_data.json         # Empirical observation log — evidence for every constant
│   └── player_seeds.json             # Canonical player records for squad re-population
│
├── verification/                     # Formal verification spec layer (Python)
│   ├── __init__.py
│   ├── constants_pure.py             # Python mirror of game_2025.json constants
│   ├── engine_pure.py                # Pure Python specification of engineMath.ts
│   ├── multipliers_pure.py           # Multiplier helper functions (pure Python)
│   ├── run_ts.ts                     # Persistent TS subprocess runner for equivalence tests
│   └── dafny/
│       ├── budget_model.dfy          # Dafny proofs P1–P4 (geometric budget series)
│       └── gain_engine.dfy           # Dafny proofs P5–P6 (gain loop bounds); NLSAT enabled
│
├── tests/
│   ├── proofs/
│   │   ├── __init__.py
│   │   ├── test_z3_properties.py     # Z3 SMT proofs P7, P10–P15, P18–P19
│   │   ├── test_crosshair_contracts.py # Crosshair symbolic contracts P5, P6, P8, P9, P16, P17
│   │   └── test_ts_equivalence.py    # Hypothesis differential: Python spec vs TS engine, ε=1e-10
│   ├── engine-test.ts                # Engine unit tests
│   ├── investment-test.ts            # Coaching projection tests
│   ├── projection-test.ts            # End-to-end projection regression tests
│   ├── drill-logic-test.ts           # Drill logic tests
│   ├── logic-test.ts                 # Scanner and pipeline tests
│   ├── storage-test.ts               # Database layer tests
│   └── sim-ala.ts                    # Long-form simulation test
│
├── drizzle/
│   └── migrations.ts                 # Compiled migration bundle for expo-sqlite
│
├── tools/
│   └── calibrate.ts                  # Offline constant back-calculation utility
│
├── docs/
│   └── formal-verification-gap-analysis.md  # Research: four open determinism gaps
│
├── .github/workflows/
│   ├── proofs.yml                    # CI: z3-crosshair + dafny (blocks merge to main)
│   └── eas-update.yml                # CI: OTA build and distribution (main only)
│
├── CLAUDE.md                         # Developer notes, calibration policy, sprint log
├── SYSTEM_BLUEPRINT.md               # This document (game-specific)
├── LOGISTICS_SYSTEM_BLUEPRINT.md     # Agnostic version (template for derived systems)
└── tsconfig.json
```

---

## 2. Module Map

### 2.1 Production Runtime Chain

| Module | File | Role |
|---|---|---|
| Calibrated Constants | `profiles/game_2025.json` | Single source of truth for all engine parameters. OTA-updatable. Loaded at module init by both TypeScript and Python layers. |
| Engine Constants | `src/engine/engineConstants.ts` | Typed re-exports of every constant from `game_2025.json`, each with calibration status and evidence chain in JSDoc. |
| Core Math Engine | `src/engine/engineMath.ts` | Pure functions for all 16 projection stages. No I/O. No React. Each stage independently tunable. |
| OCR Scanner — Coach Preview | `src/logic/coachScanner.ts` | Parses ML Kit token stream from coach preview screenshots; extracts stat names, baseline values, and gain ranges (+lo–hi). |
| OCR Scanner — Player Card | `src/logic/playerScanner.ts` | Parses ML Kit token stream from player card screenshots; extracts role configuration, age, tier, and stat values. |
| Scan Pipeline | `src/logic/coachPipeline.ts` | Routes scanner output: category resolution, full-category overrides for Standard/Extensive coaches, Reward Coach passthrough. |
| Coaching Engine | `src/logic/investmentEngine.ts` | Orchestrates multi-session coaching projections across a squad. |
| OVR Projector | `src/logic/ovrProjector.ts` | Projects overall rating; applies training lock check before drill simulation. |
| Condition Engine | `src/utils/conditionEngine.ts` | Computes condition drain per drill session. |
| Role Weights | `src/utils/roleWeights.ts` | Maps player role configuration to white/grey stat classification (union of all assigned positions). |
| Player Service | `src/services/playerService.ts` | Player CRUD, tier normalisation (`normaliseTier()`), snapshot management. |
| Database | `src/db/index.ts` | expo-sqlite connection, Drizzle migration runner (m0000–m0007), idempotency guards. |

### 2.2 Supporting Modules

| Module | File | Role |
|---|---|---|
| Custom Coach Evaluator | `src/logic/customCoachEngine.ts` | Parameterised coaching session projector. Requires explicit `GameProfile` injection; deprecated shim removed Sprint 32. |
| Scenario Comparator | `src/logic/scenarioComparator.ts` | Side-by-side projection comparison for two coaching scenarios. |
| Zero-Drain Detector | `src/logic/zeroDrainEngine.ts` | Identifies drills that produce zero condition drain at a given fan club level. |
| Zero-Drain Protocol | `src/logic/zeroDrainProtocol.ts` | Reports zero-drain sessions and generates scheduling advisories. |
| Fixture Engine | `src/logic/fixtureEngine.ts` | Match scheduling logic — fixture calendar integration. |
| Drill Preset Service | `src/services/drillPresetService.ts` | Persistence for saved drill schedules. |
| Squad Plan Service | `src/services/squadPlanService.ts` | Persistence for multi-player deployment configurations. |
| Calibration Utility | `tools/calibrate.ts` | Offline tool for back-calculating engine constants from empirical game observations. |

### 2.3 Verification Modules

| Module | File | Tool | Properties |
|---|---|---|---|
| Budget Model Proofs | `verification/dafny/budget_model.dfy` | Dafny 4.x + Z3 | P1–P4: geometric series budget convergence |
| Gain Loop Proofs | `verification/dafny/gain_engine.dfy` | Dafny 4.x + Z3 + NLSAT | P5–P6: gain loop termination and bounds |
| Pure Engine Spec | `verification/engine_pure.py` | Crosshair + Z3 | Ground-truth specification layer for all Python-layer proofs |
| Pure Constants | `verification/constants_pure.py` | — | Loads `game_2025.json`; shared by all Python proofs |
| TS Runner | `verification/run_ts.ts` | Node.js subprocess | Persistent dispatcher called by Hypothesis equivalence tests |
| Z3 SMT Proofs | `tests/proofs/test_z3_properties.py` | Z3 SMT | P7, P10–P15, P18–P19 |
| Crosshair Test Runner | `tests/proofs/test_crosshair_contracts.py` | pytest + Crosshair CLI | P5, P6, P8, P9, P16, P17 |
| TS Equivalence Tests | `tests/proofs/test_ts_equivalence.py` | Hypothesis | Python spec vs TypeScript engine, ε=1e-10, 200 examples × 7 functions |

---

## 3. Production Dependencies

### 3.1 Runtime Libraries

| Library | Role |
|---|---|
| React Native 0.76.x | Cross-platform mobile UI rendering |
| Expo SDK 52 | Managed build pipeline, OTA delivery, device API abstraction |
| Expo Router 4.x | File-system-based screen routing |
| expo-sqlite | On-device relational storage (WAL mode) |
| Drizzle ORM | Type-safe SQL query builder and migration runner |
| ML Kit Vision (`@react-native-ml-kit/text-recognition`) | On-device OCR — processes coach preview and player card screenshots; no image data leaves the device |
| NativeWind / Tailwind | Utility-first styling |

### 3.2 Verification and CI Libraries

| Library | Version | Role |
|---|---|---|
| Dafny | 4.x (dotnet tool) | Machine-checked algorithmic proofs via Boogie + Z3 |
| Z3 | 4.12.1 | SMT solver backend for Dafny; also used directly for 11 named SMT proofs |
| Crosshair | crosshair-tool (latest) | Symbolic execution of PEP 316 docstring contracts over `engine_pure.py` |
| Hypothesis | latest | Property-based fuzzing for Python spec vs TypeScript engine equivalence |
| pytest + pytest-timeout | — | Proof runner; `unknown` Z3 result is a hard failure |
| .NET SDK 8.0 | — | Required runtime for Dafny toolchain |
| z3-solver (Python) | — | Z3 Python bindings used in `test_z3_properties.py` |

### 3.3 Development Dependencies

| Library | Role |
|---|---|
| TypeScript | Static type checking |
| tsx | Direct TypeScript execution (used by all `npm run test:*` scripts and `verification/run_ts.ts`) |
| EAS CLI | Cloud build and OTA distribution |
| Drizzle Kit | Migration generation (`npm run db:generate`) |

---

## 4. Calibrated Constants

All constants live in `profiles/game_2025.json`. Both `src/engine/engineConstants.ts` and
`verification/constants_pure.py` load from this single file. A constant change in the JSON
propagates to both the running engine and the proof layer simultaneously — any proof that
breaks after a constant change is a CI finding, not a merge blocker to silence.

**Calibration policy:** Every constant must be back-calculated from actual game screenshots
(before/after player card stats). Community data is not trusted. If there is no empirical
game observation backing a value, it is labelled ASSUMED.

| Constant | Key in JSON | Value | Status |
|---|---|---|---|
| XP cost curve base (C₀) | `xpCostBase` | 2.94 | ✅ Confirmed — Tackling-120 / Positioning-228 gain ratio (same session, same budget) |
| XP cost curve decay (K) | `xpCostDecayK` | 47 | ✅ Confirmed — CV minimisation across 5 Grant ×40 observations (CV 3.2%) |
| Base XP per session | `baseXpPerSession` | 676 | ✅ Confirmed — back-calculated from Grant ×40 Defending and Dallas ×4 Safeguard |
| Session budget decay | `sessionBudgetDecay` | 0.99 | ✅ Confirmed — geometric model matches LJDark Leo ×114 GK to ±1 OVR; resolves ×N anomaly |
| Grey stat weight multiplier | `greyWeightMultiplier` | 0.22 | ✅ Confirmed — Grant ×40 HEADING (grey, stat=155, +11–15 actual) |
| Age table | `ageTable` | Bracketed | ✅ Ages 18–20, 24–25, 26–28 confirmed; 21–23 validated by use; 17, 29, 30+ assumed |
| Talent multipliers | `talentMultipliers` | 5 tiers | ✅ Normal (1.0) confirmed across 6 players; Slow (0.47) provisional; Fast/Average/Fastest unconfirmed |
| OVR divisor | `totalAttributeCount` × `qualityOvrDivisor` | 15 | ✅ Confirmed — `floor(Σstats / 15)` matches all clean-integer test cases; `ceil` ruled out |
| Training lock threshold | `maxBaseOvr` | 180 | ✅ Confirmed — TRAIN button absent at exactly this base OVR |
| Tier stat additions | `tierAttrAdditions` | T0–T6 | ✅ T2→T3 (+20/white stat) confirmed from clean tier upgrade; grey stats receive 0 |
| Season decay per level | `seasonDecayPerLevel` | 20 pts | ✅ Confirmed — flat model; proportional model diverges on high-value stats |
| Condition drain base | `baseLossPerDrill` | 0.75% | ✅ Confirmed |
| Intensity multipliers | `condLevelMultipliers` | ×1–×5 | ✅ Confirmed from drill screenshots |
| Fan club condition reduction | `fanClubCondReduction` | 10–50% | ✅ Confirmed from fan club screenshots |
| Zero-drain threshold | `zeroDrainThreshold` | 0.375% | ✅ Confirmed — Very Easy + Fan Club L4 only |
| Condition per restorer | `conditionPerRestorer` | 15% | ✅ Confirmed |
| Stat hard cap | `statCap` | 9999 | Engine ceiling — no observed violation |
| Drill XP factor | `drillXpFactor` | 0.3 | ⚠️ Uncalibrated — requires controlled drill-only before/after dataset |

---

## 5. Full Pipeline Flow

The engine executes as a linear, deterministic pipeline. Each stage is a pure function
that takes primitives and returns a value. Stage numbers match the inline documentation
in `src/engine/engineMath.ts`.

---

### Step 0 — System Initialisation

**Trigger:** Application cold start.

1. `src/db/index.ts` opens the on-device SQLite database in WAL mode.
2. Drizzle migration runner checks `_journal.json` and applies any pending migrations (m0000–m0007) idempotently. New-role columns (`new_role`, `new_role_points`) guarded by `ensureNewRoleColumns()`.
3. `profiles/game_2025.json` is imported at module load time by `engineConstants.ts`; constants are exported as typed primitives. The Python verification layer (`constants_pure.py`) reads the same file at import time.
4. Splash animation plays (`SplashAnimation.tsx` — ~3.2s sequence); main tab navigator mounts.

---

### Step 1 — Data Ingestion (OCR)

**Trigger:** Manager initiates a scan from the coaching planner (`coaches.tsx`) or player intake screen (`app/player/new.tsx`).

1. `src/logic/pickImage.ts` invokes the device camera or gallery picker.
2. ML Kit Vision processes the image entirely on-device. No image data leaves the device.
3. ML Kit returns a flat token stream: `{ text, frame: { top, left, width, height } }[]`.

**Coach preview scan path (`coachScanner.ts`):**

4. Tokens sorted top-to-bottom, left-to-right.
5. Coach type (Standard / Focused / Extensive / Reward), category, and session count extracted independently from the header block — no combined regex.
6. For each stat row: locate the stat name token, then search **right of that token** within Y-tolerance (`t.left > tok.left`) for a baseline value and optional `+lo–hi` gain range. The right-filter prevents 3-column OCR bleed.
7. A `Map<statName, StatCapture>` deduplicates captures: prefer non-zero baseline; prefer narrower gain span as tiebreaker.
8. A secondary embedded-stat pass handles OCR block merges (adjacent columns collapsed — e.g. `"194 + 4-6 CROSSING"`). Candidates filtered to the coach's category before pattern matching.
9. Reward Coach flag (`isRewardCoach`) bypasses category filter and full-category override.

**Player card scan path (`playerScanner.ts`):**

4. Role detection anchored to a `"Roles:"` label Y-band (±28 px tolerance).
5. Greedy left-to-right parser consumes concatenated role tokens (e.g. `"DLAML"` → `["DL","AML"]`).
6. OCR correction map handles misrecognitions (e.g. `"TACKIING"` → `"TACKLING"`).
7. Tier matched against the seven-tier vocabulary (None/Rare/Elite/Stellar/Master/Epic/Legendary) and normalised to internal T0–T6 codes.

**Scan pipeline (`coachPipeline.ts`):**

- Standard and Extensive coaches: override partial detections with the full known category stat list (ML Kit cannot read `↑` arrow icons on non-highlighted rows).
- Focused and Reward coaches: trust scanner output directly — stat count is variable.
- Safeguard category maps to the same stat set as Defending (TACKLING, MARKING, POSITIONING, HEADING, BRAVERY) — not GK.

---

### Step 2 — Player Record Retrieval

1. `src/services/playerService.ts` queries the local SQLite registry for the selected player.
2. Record provides: all 15 stat values, role configuration, age, talent tier, classification tier, and current condition %.
3. `src/utils/roleWeights.ts` computes the **white/grey stat set** as the union of all assigned roles. White stats train at full efficiency; grey stats cost ~4.5× more XP per point (`GREY_MULT = 0.22` divisor on combined multiplier).

---

### Step 3 — Coaching Session Configuration

The manager confirms or overrides:
- Number of sessions (N) — scanned from the coach preview header (e.g. `×40`)
- Stats to coach (from the scan, or manually selected for Focused coaches)

---

### Step 4 — Geometric Budget Calculation

**Function:** `coachBudgetPerStat(sessions, selectedStats)` — Stage 4a in `engineMath.ts`

Each successive session of the same coach delivers slightly less XP than the prior (decay = 0.99):

```
effectiveSessions = (1 − 0.99^N) / (1 − 0.99)
budgetPerStat     = effectiveSessions × 676 / |selectedStats|
```

This series plateaus at large N: ×114 → 68.2 effective sessions (not 114). This is the
confirmed explanation for the ×N anomaly — ×20 and ×40 sessions produced similar gains
because the geometric sum plateaus.

**Proved:** P1 (budget > 0 when sessions > 0), P2 (budget monotone in sessions), P3 (geometric ≤ linear), P4 (zero sessions → zero budget). See `verification/dafny/budget_model.dfy`.

---

### Step 5 — Efficiency Multiplier Composition

**Function:** `combinedMultiplier(params)` — Stage 3 in `engineMath.ts`

All efficiency factors compose into a single divisor on the XP cost. Higher multiplier = cheaper per-point cost = more stat gain per XP.

```
η = ageMultiplier(age)
  × talentMultiplier(talent)
  × greyMultiplier(isWhite)
  × starDecayMultiplier(starsGainedThisSession)
  × twoxAdMultiplier (if 2× AD token active)
  × drillLevelMultiplier
```

| Stage | Function | Description |
|---|---|---|
| 2a | `ageMultiplier(age)` | Linear interpolation over bracketed age table (ages 17–30); peak at 17–21 (1.0–1.1), drops to 0.0 at 30 |
| 2b | `talentMultiplier(talent)` | Five-tier lookup (Slow 0.47⚠️ · Normal 1.0✅ · Average 1.1⚠️ · Fast 1.25⚠️ · Fastest 1.5⚠️) |
| 2c | `greyMultiplier(isWhite)` | 1.0 for white stats; 0.22 for grey |
| 2d | `starDecayMultiplier(stars)` | `STAR_DECAY^stars` — decays as OVR accumulates within a session |

**Proved:** P10 (η > 0 for all valid inputs), P11 (grey < white efficiency), P12 (talent tiers strictly ordered Slow < Normal < Average < Fast < Fastest), P13 (age multiplier non-increasing with age). See `tests/proofs/test_z3_properties.py`.

---

### Step 6 — Stat Gain Integral

**Function:** `statGainFromBudget(startStat, budget, η)` — Stage 5 in `engineMath.ts`

Iterates one stat point at a time from `startStat`. Each point costs:

```
cost(stat) = C₀ × exp(stat / K) / η     where C₀ = 2.94, K = 47
```

Loop terminates when budget exhausted or stat hard cap (9999) reached. A fractional
remainder is banked as sub-integer progress (partial point carry).

```
gain = 0
while remaining > 0 and current < STAT_CAP:
    cost = xpCostAtStat(current) / η
    if cost > remaining:
        gain += remaining / cost    // fractional carry
        break
    remaining -= cost
    gain      += 1
    current   += 1
```

**Proved:** P5 (gain ≥ 0), P6 (gain ≤ STAT_CAP − startStat). See `verification/dafny/gain_engine.dfy`.

---

### Step 7 — OVR Formula

**Function:** `ovrFromStats(stats)` — Stage 6 in `engineMath.ts`

```
OVR = floor( Σ(all 15 stats) / 15 )
```

`floor` confirmed: `ceil` ruled out by a clean integer-only tier upgrade (Grant T2→T3:
sum = 2615, `floor(2615/15)` = 174 ✅, `ceil` = 175 ✗). The earlier `ceil` hypothesis
was an artefact of fractional stat accumulation.

Tier bonuses are baked into the stat values, so the same formula covers both base OVR and
total OVR. `tierOvrContrib()` and `baseOvrFromTotal()` expose the two-component breakdown
shown in the game UI (e.g. "290 OVR = 152 + 138 Tier increase").

**Proved:** P14 (OVR deterministic), P15 (OVR non-decreasing under stat increase). See `tests/proofs/test_z3_properties.py`.

---

### Step 8 — Training Lock Check

**Function:** `isTrainingLocked(baseOvr)` — Stage 8 in `engineMath.ts`

```
locked = baseOvr ≥ 180
```

The ceiling applies to **base OVR only** (total OVR minus tier contribution). Tier bonuses
push total OVR well above 180 — individual stats can also exceed 180 via tier bonuses.
When seasonal decay drops base OVR below 180, the lock clears and training resumes.
The game displays "MAX STARS" and hides the TRAIN button when locked.

**Proved:** P18 (no false lockouts), P19 (no missed lockouts). See `tests/proofs/test_z3_properties.py`.

---

### Step 9 — Condition Drain

**Function:** `conditionDrainPct(drillIntensity, fanLevel)` — Stage 9 in `engineMath.ts`

For drill sessions:

```
drain = 0.75% × intensityMultiplier × (1 − fanClubReduction / 100)
```

| Intensity | Multiplier | Drain (L0 −10%) | Drain (L4 −50%) |
|---|---|---|---|
| Very Easy | ×1 | 0.675% | **0.375% → ZERO DRAIN** |
| Easy | ×2 | 1.35% | 0.75% |
| Medium | ×3 | 2.025% | 1.125% |
| Hard | ×4 | 2.70% | 1.50% |
| Very Hard | ×5 | 3.375% | 1.875% |

Zero-drain fires when `drain < 0.375%`. Only Very Easy + Fan Club L4 qualifies.
Restorers recover 15% condition per unit, capped at 100%.

**Proved:** P16 (drain non-negative), P17 (more seasons → lower or equal stat values). See `tests/proofs/test_crosshair_contracts.py`.

---

### Step 10 — Season Decay

**Function:** `applySeasonDecay(stats, levelsPromoted, decayPerLevel)` — Stage 16 in `engineMath.ts`

At each season boundary, all stats drop by `20 × levelsPromoted` points, floored at zero.
White and grey stats degrade equally. Tier bonuses are **not** preserved across the boundary.

The flat model is confirmed: a proportional model diverges by 18–26 points on high-value
stats and is rejected by the empirical data.

---

### Step 11 — Output

The UI receives projected stat gain per attribute (fractional), projected OVR before and
after, and training lock status. The manager can compare scenarios, save the plan, or
trigger a new scan. No network call occurs at any point in the pipeline.

---

## 6. Formal Verification Summary

The verification stack proves nineteen named safety properties over the core engine pipeline.
All proofs run in CI on every pull request to main; a proof failure blocks merge.

`verification/engine_pure.py` is a pure, side-effect-free Python re-expression of
`src/engine/engineMath.ts`. The two must remain in sync — a divergence caught by a failing
proof is a bug in the spec, not a reason to weaken the property.

### 6.1 Dafny Machine-Checked Proofs (P1–P6)

Dafny 4.x discharges verification conditions via Boogie + Z3 4.12.1.
`budget_model.dfy` uses a recursive geometric sum (division-free) because Z3 cannot
discharge symbolic real division equalities over quantifier-free nonlinear real arithmetic.
`gain_engine.dfy` models the XP gain loop as a fuel-bounded recursive function. The NLSAT
solver (`smt.arith.solver=6`) is enabled on the gain engine verify step.

| Property | ID | Statement | File | Status |
|---|---|---|---|---|
| Positive budget | P1 | sessions > 0 ∧ \|stats\| > 0 → budget > 0 | `budget_model.dfy` | ✅ Verified |
| Monotone budget | P2 | sessions₁ > sessions₂ → budget₁ > budget₂ | `budget_model.dfy` | ✅ Verified |
| Geometric ≤ linear | P3 | effectiveSessions ≤ N | `budget_model.dfy` | ✅ Verified |
| Zero sessions → zero budget | P4 | sessions = 0 → budget = 0 | `budget_model.dfy` | ✅ Verified |
| Gain non-negative | P5 | budget > 0 ∧ η > 0 → gain ≥ 0 | `gain_engine.dfy` | ✅ Verified |
| Gain bounded by cap | P6 | gain ≤ STAT\_CAP − startStat | `gain_engine.dfy` | ✅ Verified |

**CI command:** `dafny verify --solver-path "$Z3_EXE" verification/dafny/budget_model.dfy`
**CI command:** `dafny verify --solver-path "$Z3_EXE" --boogie /proverOpt:O:smt.arith.solver=6 verification/dafny/gain_engine.dfy`

---

### 6.2 Crosshair Symbolic Contract Verification (P5, P6, P8, P9, P16, P17)

Crosshair symbolically executes `engine_pure.py` against PEP 316 docstring contracts.
A counterexample prints the violating inputs before failing.

| Property | ID | Statement |
|---|---|---|
| Gain non-negative | P5 | budget > 0 ∧ η > 0 → gain ≥ 0 |
| Gain bounded | P6 | gain ≤ STAT\_CAP − startStat |
| Gain monotone in budget | P8 | budget₁ ≥ budget₂ → gain(budget₁) ≥ gain(budget₂) |
| Gain monotone in multiplier | P9 | η₁ ≥ η₂ > 0 → gain(η₁) ≥ gain(η₂) |
| Season decay non-negative | P16 | `applySeasonDecay` never produces stat < 0 |
| Season decay non-increasing | P17 | more levels → lower or equal stat values |

---

### 6.3 Z3 SMT Proofs (P7, P10–P15, P18–P19)

Each proof encodes the **negation** of the property and asserts `unsat`. A satisfiable
result means a counterexample was found. `unknown` (timeout) is a hard failure — never
treated as a pass. Constants are wired from `constants_pure.py` and always reflect the
live `game_2025.json` values.

| Property | ID | Statement |
|---|---|---|
| Zero multiplier → zero gain | P7a | η ≤ 0 → gain = 0 |
| Zero budget → zero gain | P7b | budget ≤ 0 → gain = 0 |
| Combined multiplier positive | P10 | η > 0 for all valid component values |
| Grey < white efficiency | P11 | greyMult(grey) < greyMult(white) |
| Talent strict ordering | P12 | Slow < Normal < Average < Fast < Fastest (strictly) |
| Age multiplier non-increasing | P13 | older age → mult ≤ younger |
| OVR deterministic | P14 | same stat sum → same OVR |
| OVR non-decreasing | P15 | stat sum increases → OVR does not decrease |
| No false lockouts | P18 | baseOvr < 180 → not locked |
| No missed lockouts | P19 | baseOvr ≥ 180 → locked |
| Lock bijection | P18+P19 | locked ↔ baseOvr ≥ 180 (exhaustive) |

**CI command:** `pytest tests/proofs/ -m proof -v --timeout=60`

---

### 6.4 Hypothesis Equivalence Tests (Gap 3)

200 random inputs per function, comparing Python spec (`engine_pure.py`) against the
TypeScript engine (`engineMath.ts`) to ε = 1e-10. A divergence means the spec has
drifted from the implementation.

Functions covered: `coachBudgetPerStat`, `statGainFromBudget`, `ovrFromStats`,
`combinedMultiplier`, `applySeasonDecay`, `isTrainingLocked`, `conditionDrainPct`.

**CI command:** included in the `z3-crosshair` job pytest run above.

---

### 6.5 CI Gate

Both `z3-crosshair` and `dafny` jobs must pass before any pull request can merge to main.
A failing proof is a finding against the engine as it exists — not a reason to weaken the
property or alter the engine to make it pass. Main branch triggers EAS OTA to production
devices; the proof gate is the last line of defence before field deployment.

---

### 6.6 Open Verification Gaps

Details and recommended approaches in `docs/formal-verification-gap-analysis.md`.

| Gap | Description | Status |
|---|---|---|
| Gap 3 | TypeScript ↔ Python spec equivalence | ✅ Closed — Hypothesis differential tests (Sprint 36, PR #115) |
| Gap 4 | Fractional gain branch (`remaining/cost`) conservatively modelled as `0.0` in `gain_engine.dfy` | ⚠️ Partial — NLSAT enabled (Sprint 36); exact proof still pending |
| Gap 1 | OCR output enters engine without formally-bounded validation layer | Open — Zod schema + boundary type proof needed |
| Gap 2 | Calibration constants carry unquantified uncertainty; ~88 observations needed for ±5% CI | Ongoing — Bayesian inference on existing data |

---

## 7. Tier System

### 7.1 Game Display → Internal Code Mapping

| Game Display | Internal | Colour |
|---|---|---|
| None | T0 | `#6b7280` grey |
| Rare | T1 | `#60a5fa` blue |
| Elite | T2 | `#34d399` green |
| Stellar | T3 | `#22d3ee` cyan |
| Master | T4 | `#a78bfa` purple |
| Epic | T5 | `#fb923c` orange |
| Legendary | T6 | `#fbbf24` gold |

### 7.2 Tier Stat Additions (Cumulative from T0, White Stats Only)

| Tier | Addition |
|---|---|
| T0 | 0 |
| T1 | +10 |
| T2 | +30 |
| T3 | +50 |
| T4 | +80 |
| T5 | +120 |
| T6 | +160 |

Tier bonuses apply to **white (role-primary) stats only**. Grey (role-secondary) stats receive
zero tier increment — confirmed from Grant T2→T3: every white stat +20 exactly, HEADING and
STRENGTH +0.

---

## 8. Role System and Stat Whiteness

`isWhiteStat(roles, statName)` returns true if the stat is essential for **any** of the
player's roles (union rule). A player with roles DL + ML + AML has the union of all three
positions' white stats.

`getAllStatKeys(roles)` returns only role-relevant stats (not all 15 game stats).

White stats cost 1× XP per point. Grey (non-essential) stats cost ~4.5× more (`GREY_MULT = 0.22`).

### Key Role Notes

- **Safeguard** coach category → same stats as Defending (TACKLING, MARKING, POSITIONING, HEADING, BRAVERY)
- **DMC** — STRENGTH is grey, SPEED is grey; 9 essential, 6 secondary
- **Reward Coaches** — may boost cross-category stats (e.g. MARKING + POSITIONING + AGGRESSION on a Safeguard Reward Coach); handled via `isRewardCoach` flag

---

*Document maintained by the system architect. File paths, constant values, calibration
status, and proof counts are the authoritative record. Engine constant changes must be
accompanied by empirical evidence in `profiles/calibration_data.json`. Proof status must
reflect the latest CI run.*
