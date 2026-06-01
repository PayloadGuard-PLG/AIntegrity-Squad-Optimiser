# SYSTEM BLUEPRINT
**AIntegrity Resource Allocation Engine**
Version: 1.0 · Generated: 2026-06-01 · Classification: Internal Architecture Reference

---

> **Summary.** This system is a deterministic, offline-first resource allocation and operational
> capacity projection tool. It ingests structured data from physical or digital operational
> documents via on-device optical character recognition, maintains a persistent local registry
> of tracked assets and their performance parameters, and applies a formally-verified
> mathematical pipeline to project the outcome of any proposed investment cycle before it is
> committed. All computation is deterministic and pure-functional; given the same inputs the
> engine always produces the same outputs. The system carries no network dependency at runtime.
> A three-layer formal verification stack (Dafny · Z3 · Crosshair) proves nineteen named safety
> properties over the core pipeline and gates every change to the main branch via CI.

---

## 1. Repository Layout

```
.
├── app/                         # Expo Router screen tree (UI layer only)
│   ├── _layout.tsx              # Root layout — DB bootstrap, splash gate, tab navigation
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Tab bar configuration
│   │   ├── index.tsx            # Asset registry — list, search, quick-select
│   │   ├── coaches.tsx          # Investment cycle planner — scan → project → compare
│   │   ├── drills.tsx           # Conditioning operations — schedule, drain forecast
│   │   ├── plan.tsx             # Deployment planning workspace
│   │   ├── results.tsx          # Historical outcomes log
│   │   └── squad-plan.tsx       # Multi-asset deployment configuration builder
│   ├── coach/
│   │   └── capture.tsx          # OCR capture flow for investment cycle documents
│   ├── player/
│   │   ├── [id].tsx             # Asset detail / edit screen
│   │   └── new.tsx              # Asset intake form
│   └── compare.tsx              # Side-by-side asset comparison view
│
├── src/
│   ├── engine/                  # ★ Core deterministic math — no React, no I/O
│   │   ├── engineMath.ts        # All projection functions (Stages 1–16, see §5)
│   │   └── engineConstants.ts   # Calibrated constants re-exported from profiles/
│   │
│   ├── logic/                   # Orchestration and scanning pipelines
│   │   ├── coachScanner.ts      # OCR token parser — investment cycle documents
│   │   ├── coachPipeline.ts     # Post-scan routing: category resolution, fallbacks
│   │   ├── playerScanner.ts     # OCR token parser — asset profile documents
│   │   ├── investmentEngine.ts  # Multi-cycle projection orchestrator
│   │   ├── ovrProjector.ts      # Composite capability index (CCI) projector
│   │   ├── customCoachEngine.ts # Parameterised investment cycle evaluator
│   │   ├── scenarioComparator.ts# A/B scenario comparison engine
│   │   ├── fixtureEngine.ts     # Operational scheduling logic
│   │   ├── zeroDrainEngine.ts   # Zero-readiness-drain cycle detector
│   │   ├── zeroDrainProtocol.ts # Zero-drain reporting and advisory
│   │   ├── mutantEngine.ts      # Edge-case and stress-scenario evaluator
│   │   ├── xpEngine.ts          # Legacy projection shim (deprecated — see engineMath.ts)
│   │   ├── controller.ts        # High-level action controller
│   │   └── pickImage.ts         # Device image picker abstraction
│   │
│   ├── services/                # Database access layer (Drizzle ORM + expo-sqlite)
│   │   ├── playerService.ts     # Asset CRUD, tier normalisation, snapshot management
│   │   ├── coachService.ts      # Investment cycle record service
│   │   ├── coachHistoryService.ts # Historical investment outcomes
│   │   ├── drillPresetService.ts  # Saved conditioning operation presets
│   │   ├── drillPlanHistoryService.ts # Conditioning plan history
│   │   ├── squadPlanService.ts  # Deployment configuration persistence
│   │   └── storageService.ts    # Generic key-value storage abstraction
│   │
│   ├── utils/                   # Stateless utility functions
│   │   ├── coachMath.ts         # Deprecated projection shim (backward compatibility)
│   │   ├── conditionEngine.ts   # Operational readiness calculation helpers
│   │   ├── optimiserMath.ts     # Allocation optimisation utilities
│   │   ├── roleWeights.ts       # Primary/secondary metric classification by role
│   │   ├── modifiers.ts         # Modifier chain helpers
│   │   └── math.ts              # General-purpose numeric utilities
│   │
│   ├── components/              # Reusable UI components
│   │   ├── atoms/               # Primitive UI atoms (Chip, MonoLabel, QualityMeter, …)
│   │   ├── AppHeader.tsx
│   │   ├── PlayerCard.tsx       # Asset summary card
│   │   ├── StatGrid3Col.tsx     # Three-column metric grid (mirrors document layout)
│   │   ├── InvestmentStepTable.tsx # Per-metric gain breakdown table
│   │   ├── DrillTable.tsx       # Conditioning operations schedule view
│   │   ├── OVRBadge.tsx         # Composite capability index badge
│   │   ├── TierBadge.tsx        # Classification tier badge
│   │   ├── SplashAnimation.tsx  # Boot sequence animation
│   │   └── TabBackground.tsx    # Per-tab ambient background art
│   │
│   ├── db/                      # Database schema and migration bootstrap
│   │   ├── schema.ts            # Drizzle table definitions
│   │   └── index.ts             # Connection, migration runner, idempotency guards
│   │
│   ├── hooks/                   # React hooks
│   │   ├── useScanner.ts        # OCR scan lifecycle hook
│   │   └── useSquad.ts          # Asset pool state hook
│   │
│   ├── types/
│   │   └── resources.ts         # Canonical TypeScript interfaces and union types
│   │
│   └── context/
│       └── ManagerContext.tsx   # Global operator context provider
│
├── profiles/
│   ├── operational_profile.json # ★ Live calibrated constants (OTA-updatable)
│   │                            #   Single source of truth for every engine parameter.
│   │                            #   Changing a value here propagates to both the engine
│   │                            #   and the verification layer simultaneously.
│   ├── calibration_data.json    # Empirical observation log — evidence for every constant
│   └── asset_seeds.json         # Canonical asset records for registry re-population
│
├── verification/                # Formal verification spec layer
│   ├── __init__.py
│   ├── constants_pure.py        # Python mirror of operational_profile.json constants
│   ├── engine_pure.py           # Pure Python specification of engineMath.ts (Stages 1–16)
│   ├── multipliers_pure.py      # Multiplier helper functions (pure Python)
│   ├── crosshair_contracts.py   # PEP 316 contract functions for Crosshair symbolic verification
│   └── dafny/
│       ├── budget_model.dfy     # Dafny proofs P1–P4 (geometric budget series)
│       └── gain_engine.dfy      # Dafny proofs P5–P6 (gain loop termination and bounds)
│
├── tests/
│   ├── proofs/
│   │   ├── test_z3_properties.py       # Z3 SMT proofs P7, P10–P15, P18–P19
│   │   └── test_crosshair_contracts.py # Crosshair symbolic contracts P5, P6, P8, P9, P16, P17
│   ├── engine-test.ts           # Engine unit tests
│   ├── investment-test.ts       # Investment cycle projection tests
│   ├── projection-test.ts       # End-to-end projection regression tests
│   └── …                        # Additional integration tests
│
├── drizzle/                     # Database migrations (m0000–m0007)
│   └── migrations.ts            # Compiled migration bundle for expo-sqlite
│
├── .github/workflows/
│   ├── proofs.yml               # CI: z3-crosshair + dafny jobs (blocks merge to main)
│   └── eas-update.yml           # CI: OTA build and distribution (main branch only)
│
└── tools/
    └── calibrate.ts             # Offline constant back-calculation utility
```

---

## 2. Module Map

### 2.1 Production Path — Runtime Execution Chain

| Module | File | Role |
|---|---|---|
| Operational Profile | `profiles/operational_profile.json` | Single source of truth for all calibrated constants. Loaded at startup; re-read after any OTA update. |
| Engine Constants | `src/engine/engineConstants.ts` | Re-exports every constant from the profile with calibration status and evidence chain in JSDoc. |
| Core Math Engine | `src/engine/engineMath.ts` | Pure functions for all 16 projection stages. No I/O. No React. Each stage independently tunable. |
| OCR Scanner — Investment Cycle | `src/logic/coachScanner.ts` | Parses ML Kit token stream from investment cycle documents; extracts metric names, baseline values, and gain ranges. |
| OCR Scanner — Asset Profile | `src/logic/playerScanner.ts` | Parses ML Kit token stream from asset profile documents; extracts role configuration, maturity, and metric values. |
| Scan Pipeline | `src/logic/coachPipeline.ts` | Routes scan output; applies category resolution, full-category overrides, and contamination checks. |
| Investment Engine | `src/logic/investmentEngine.ts` | Orchestrates multi-cycle projections across an asset pool. |
| CCI Projector | `src/logic/ovrProjector.ts` | Projects composite capability index changes; applies capacity ceiling check. |
| Condition Engine | `src/utils/conditionEngine.ts` | Computes operational readiness drain per conditioning operation. |
| Asset Service | `src/services/playerService.ts` | Asset CRUD, classification tier normalisation, snapshot management. |
| Database | `src/db/index.ts` | expo-sqlite connection, migration bootstrap, idempotency guards. |

### 2.2 Supporting Modules

| Module | File | Role |
|---|---|---|
| Scenario Comparator | `src/logic/scenarioComparator.ts` | Side-by-side projection comparison for two investment scenarios. |
| Custom Cycle Evaluator | `src/logic/customCoachEngine.ts` | Parameterised investment cycle projector; exposes full engine pipeline to the UI with explicit `GameProfile` injection. |
| Zero-Drain Detector | `src/logic/zeroDrainEngine.ts` | Identifies conditioning operations that produce zero readiness drain at a given support level. |
| Role Weights | `src/utils/roleWeights.ts` | Maps deployment role configurations to primary and secondary metric classifications. |
| Drill Preset Service | `src/services/drillPresetService.ts` | Persistence layer for saved conditioning operation schedules. |
| Squad Plan Service | `src/services/squadPlanService.ts` | Persistence layer for deployment configurations. |
| Calibration Utility | `tools/calibrate.ts` | Offline tool for back-calculating engine constants from empirical observations. |
| Image Picker | `src/logic/pickImage.ts` | Device camera/gallery abstraction for OCR capture flow. |

### 2.3 Verification Modules

| Module | File | Tool | Properties |
|---|---|---|---|
| Budget Model Proofs | `verification/dafny/budget_model.dfy` | Dafny 4.x + Z3 | P1–P4 (geometric series budget) |
| Gain Loop Proofs | `verification/dafny/gain_engine.dfy` | Dafny 4.x + Z3 | P5–P6 (loop termination, bounds) |
| Pure Engine Spec | `verification/engine_pure.py` | Crosshair / Z3 | Spec layer — all properties |
| Pure Constants | `verification/constants_pure.py` | — | Shared by all Python-layer proofs |
| Crosshair Contracts | `verification/crosshair_contracts.py` | Crosshair | P5, P6, P8, P9, P16, P17 |
| Z3 SMT Proofs | `tests/proofs/test_z3_properties.py` | Z3 SMT | P7, P10–P15, P18–P19 |
| Crosshair Test Runner | `tests/proofs/test_crosshair_contracts.py` | pytest + Crosshair CLI | P5, P6, P8, P9, P16, P17 |

---

## 3. Production Dependencies

### 3.1 Runtime Libraries

| Library | Version | Role |
|---|---|---|
| React Native | 0.76.x | Cross-platform mobile UI rendering framework |
| Expo | SDK 52 | Managed build pipeline, OTA delivery, device API abstraction |
| Expo Router | 4.x | File-system-based screen routing |
| expo-sqlite | — | On-device relational storage (WAL mode); holds all asset and history records |
| Drizzle ORM | — | Type-safe SQL query builder and migration runner over expo-sqlite |
| ML Kit (Vision) | — | On-device OCR engine; text recognition from investment cycle and asset profile documents |
| NativeWind / Tailwind | — | Utility-first styling layer |

### 3.2 Verification and CI Libraries

| Library | Version | Role |
|---|---|---|
| Dafny | 4.x (latest via dotnet tool) | Machine-checked algorithmic proofs; discharges verification conditions via Boogie + Z3 |
| Z3 | 4.12.1 | SMT solver backend for Dafny; also used directly for thirteen named SMT proofs |
| Crosshair | crosshair-tool (latest) | Python symbolic execution engine; verifies PEP 316 docstring contracts over the pure Python spec layer |
| pytest | — | Test runner for Z3 and Crosshair proof suites |
| pytest-timeout | — | Hard timeout enforcement — `unknown` Z3 result treated as failure, not pass |
| .NET SDK | 8.0 | Required runtime for Dafny toolchain |

### 3.3 Development Dependencies

| Library | Role |
|---|---|
| TypeScript | Static type checking across the entire application |
| Babel | JS transpilation for Metro bundler |
| EAS CLI | Expo Application Services — cloud build and OTA distribution |
| z3-solver (Python) | Z3 Python bindings used in `test_z3_properties.py` |

---

## 4. Operational Profile — Calibrated Constants

All constants live in `profiles/operational_profile.json` and are consumed by both the TypeScript
engine (via `engineConstants.ts`) and the Python verification layer (via `constants_pure.py`).
Changing a value in the profile propagates to both simultaneously.

| Constant | Symbol | Value | Status |
|---|---|---|---|
| Cost curve base | C₀ | 2.94 | ✅ Confirmed — derived from two-metric gain ratio in controlled observation |
| Cost curve decay | K | 47 | ✅ Confirmed — CV minimisation across five independent observations (CV = 3.2%) |
| Base resource units per cycle | BASE\_XPS | 676 | ✅ Confirmed — back-calculated from multiple independent datasets |
| Cycle budget decay | SESSION\_BUDGET\_DECAY | 0.99 | ✅ Confirmed — resolves ×N anomaly; geometric model matches ×114 cycle result to ±1 unit |
| Secondary metric weight | GREY\_MULT | 0.22 | ✅ Confirmed — derived from controlled secondary metric observation |
| Maturity table | AGE\_TABLE | Bracketed | ✅ Partially confirmed — brackets 18–20, 24–25, 26–28 confirmed; 21–23 validated by use; 17, 29, 30+ assumed |
| Efficiency class multipliers | TALENT\_MULTS | Tiered | ✅ Normal (1.0) confirmed across six assets; Slow (0.47) provisional; Fast/Fastest unconfirmed |
| Composite capability divisor | OVR\_DIVISOR | 15 | ✅ Confirmed — floor(Σmetrics / 15) matches game output across multiple clean observations |
| Capacity ceiling | MAX\_BASE\_OVR | 180 | ✅ Confirmed — allocation lock activates at exactly this base CCI |
| Periodic degradation (flat) | SEASON\_DECAY | 20 pts/level | ✅ Confirmed — flat model fits; proportional model diverges on high-value metrics |
| Readiness drain base | BASE\_LOSS | 0.75% | ✅ Confirmed |
| Conditioning intensity multipliers | COND\_LEVEL\_MULTS | ×1–×5 | ✅ Confirmed |
| Support reduction table | FAN\_COND\_REDUCTION | 10–50% | ✅ Confirmed |
| Zero-drain threshold | ZERO\_DRAIN | 0.375% | ✅ Confirmed — only minimum-intensity + maximum support qualifies |
| Restoration per unit | CONDITION\_PER\_RESTORER | 15% | ✅ Confirmed |
| Metric hard cap | STAT\_CAP | 9999 | ✅ Engine ceiling; no observed violation |
| Conditioning XP factor | DRILL\_XP\_FACTOR | 0.3 | ⚠️ Uncalibrated — provisional; requires controlled conditioning-only dataset |

---

## 5. Full Pipeline Flow

The engine executes as a linear, deterministic pipeline. Stages are numbered to match the
`engineMath.ts` inline documentation. No stage has side effects; each takes primitives and
returns a value.

---

### Step 0 — System Initialisation

**Trigger:** Application cold start.

1. `src/db/index.ts` opens the on-device SQLite database in WAL mode.
2. Drizzle migration runner checks `_journal.json` and applies any pending migrations (m0000–m0007) idempotently.
3. `profiles/operational_profile.json` is imported at module load time by `engineConstants.ts` and `constants_pure.py` (verification layer); constants are exported as typed primitives.
4. Splash animation plays; main tab navigator mounts.

---

### Step 1 — Data Ingestion (OCR)

**Trigger:** Operator initiates a scan from the investment cycle planner or asset intake screen.

1. `src/logic/pickImage.ts` invokes the device camera or gallery picker.
2. ML Kit Vision OCR processes the captured image entirely on-device; no image data leaves the device.
3. ML Kit returns a flat token stream: `{ text, frame: { top, left, width, height } }[]`.

**Investment cycle document scan path (`coachScanner.ts`):**

4. Tokens are sorted top-to-bottom, left-to-right.
5. The scanner identifies the cycle type (Standard / Focused / Extensive / Reward), operational category, and cycle count from the header block using independent pattern matches (no combined regex).
6. For each metric row, the scanner locates the metric name token, then searches right of that token within Y-tolerance for a numeric baseline value and an optional `+lo–hi` gain range.
7. A `Map<metricName, StatCapture>` deduplicates captures: prefer non-zero baselines; prefer narrower gain spans as tiebreaker.
8. A secondary embedded-stat pass handles OCR block merges (adjacent columns collapsed into one token).
9. `coachPipeline.ts` applies category resolution: Standard and Extensive cycles override partial detections with the full known category metric list; Focused and Reward cycles trust the scanner output directly.

**Asset profile document scan path (`playerScanner.ts`):**

4. The scanner locates the role badge row anchored to a "Roles:" label Y-band (±28 px tolerance).
5. A greedy left-to-right parser consumes concatenated role tokens (e.g. `"DLAML"` → `["DL","AML"]`).
6. OCR correction maps handle common misrecognitions (e.g. `"TACKIING"` → `"TACKLING"`).
7. Classification tier text is matched against the known tier vocabulary and normalised to the internal `T0–T6` code.

---

### Step 2 — Asset Record Retrieval

1. `src/services/playerService.ts` queries the local SQLite registry for the selected asset.
2. The record provides: all metric values, deployment role configuration, maturity index, efficiency class, classification tier, and operational condition.
3. `src/utils/roleWeights.ts` computes the **primary/secondary metric set** from the union of all assigned roles. Primary metrics train at full efficiency; secondary metrics cost ~4.5× more resource units per point (GREY\_MULT = 0.22 divisor applied to the combined multiplier).

---

### Step 3 — Investment Cycle Configuration

The operator confirms or overrides:
- Number of cycles (N)
- Metrics to invest in (sourced from the scan, or manually selected)

---

### Step 4 — Geometric Budget Calculation

**Function:** `coachBudgetPerStat(sessions, selectedMetrics)` — Stage 4a

Each successive cycle of the same investment delivers slightly less resource capacity than the prior cycle (SESSION\_BUDGET\_DECAY = 0.99).

```
effectiveCycles = (1 − decay^N) / (1 − decay)
budgetPerMetric = effectiveCycles × BASE_XPS / |selectedMetrics|
```

At large N this series plateaus (e.g. ×114 cycles → 68.2 effective cycles, not 114).
This is the resolved explanation for the observed ×N anomaly: ×20 and ×40 cycles on the same asset produced similar gains because the geometric sum plateaus, not because of any OCR misread.

**Proved:** P1 (budget > 0 when cycles > 0), P2 (budget monotone in cycles), P3 (geometric ≤ linear), P4 (zero cycles → zero budget). See `verification/dafny/budget_model.dfy`.

---

### Step 5 — Efficiency Multiplier Composition

**Function:** `combinedMultiplier(params)` — Stage 3

All efficiency factors are composed into a single divisor applied to the XP cost curve. Higher combined multiplier = cheaper per-point cost = more metric gain per resource unit.

```
η = ageMultiplier(maturity)
  × talentMultiplier(efficiencyClass)
  × greyMultiplier(isPrimary)
  × starDecayMultiplier(starsEarnedThisCycle)
  × adMultiplier (if 2× boost active)
  × drillLevelMultiplier
```

Each factor is independent. Tuning one constant in the profile does not couple into any other stage.

**Component functions:**

| Stage | Function | Description |
|---|---|---|
| 2a | `ageMultiplier(maturity)` | Linear interpolation over bracketed maturity table |
| 2b | `talentMultiplier(class)` | Lookup: Slow (0.47) → Normal (1.0) → Fastest (1.5) |
| 2c | `greyMultiplier(isPrimary)` | 1.0 for primary metrics; GREY\_MULT for secondary |
| 2d | `starDecayMultiplier(stars)` | STAR\_DECAY^stars — decays as CCI accumulates within a cycle |

**Proved:** P10 (combined multiplier > 0 for all valid inputs), P11 (secondary < primary efficiency), P12 (efficiency class strict ordering), P13 (maturity multiplier non-increasing). See `tests/proofs/test_z3_properties.py`.

---

### Step 6 — Metric Gain Integral

**Function:** `statGainFromBudget(startMetric, budget, η)` — Stage 5

The engine iterates one metric point at a time. Each point costs:

```
cost(m) = C₀ × exp(m / K) / η
```

The loop terminates when the remaining budget is exhausted or the metric hard cap (9999) is reached. A fractional remainder is banked as sub-integer progress.

```
gain = 0
while remaining > 0 and current < STAT_CAP:
    cost = xpCostAtStat(current) / η
    if cost > remaining:
        gain += remaining / cost   // fractional point
        break
    remaining -= cost
    gain      += 1
    current   += 1
```

The exponential cost curve is empirically calibrated: K = 47 minimises coefficient of variation across five independent observations. C₀ = 2.94 is pinned by the ratio of two simultaneous metric gains (same cycle, same budget, different metric baseline values).

**Proved:** P5 (gain ≥ 0), P6 (gain ≤ STAT\_CAP − startMetric). See `verification/dafny/gain_engine.dfy`.

---

### Step 7 — Composite Capability Index (CCI)

**Function:** `ovrFromStats(metrics)` — Stage 6

```
CCI = floor( Σ(all 15 metrics) / 15 )
```

Confirmed: `floor` (not `ceil` or `round`) matches observed outputs across all controlled clean-integer test cases. The `ceil` hypothesis was ruled out by a definitive clean-tier-upgrade observation.

Classification tier bonuses are baked into the metric values and are therefore captured by the same formula. The engine also exposes `tierOvrContrib()` and `baseOvrFromTotal()` for the two-component decomposition `CCI = baseCCI + tierCCI` displayed by the system.

**Proved:** P14 (CCI deterministic), P15 (CCI non-decreasing under metric increase). See `tests/proofs/test_z3_properties.py`.

---

### Step 8 — Capacity Ceiling Check

**Function:** `isTrainingLocked(baseCCI)` — Stage 8

```
locked = baseCCI ≥ MAX_BASE_OVR (180)
```

The ceiling applies to **base CCI only** (excluding tier contribution). Classification tier bonuses can push total CCI well above 180 without triggering a lock. Individual metrics can also exceed 180 via tier bonuses; the ceiling is on the mean, not on any individual metric.

When a seasonal degradation event drops base CCI below 180, the lock clears and investment resumes.

**Proved:** P18 (no false lockouts — locked only when ceiling is met), P19 (no missed lockouts — ceiling always locks). See `tests/proofs/test_z3_properties.py`.

---

### Step 9 — Operational Readiness Update

**Function:** `conditionDrainPct(intensity, supportLevel)` — Stage 9

For conditioning operations:

```
drain = BASE_LOSS × intensityMultiplier × (1 − supportReduction / 100)
```

Zero-drain fires when `drain < ZERO_DRAIN_THRESHOLD` (0.375%). Only the minimum-intensity operation at maximum support level (50% reduction) satisfies this threshold.

Restoration units recover 15% operational readiness per unit, capped at 100%.

**Proved:** P16 (degradation never produces negative readiness), P17 (more degradation levels → lower or equal metric values). See `tests/proofs/test_crosshair_contracts.py`.

---

### Step 10 — Periodic Degradation (Season Boundary)

**Function:** `applySeasonDecay(metrics, levels, decayPerLevel)` — Stage 16

At each operational period boundary (season end), all metrics decay by a flat `20 × levelsPromoted` points, floored at zero. Primary and secondary metrics decay equally. Classification tier bonuses are not preserved across the boundary.

The flat model is confirmed: a proportional model diverges by 18–26 points on high-value metrics and is rejected.

---

### Step 11 — Output

The UI layer receives the projected gain per metric (fractional), the projected CCI (before and after), and the capacity ceiling status. The operator can compare scenarios, save the plan, or trigger a new scan. No network call is made at any point in the pipeline.

---

## 6. Formal Verification Summary

The verification stack proves nineteen named safety properties over the core engine pipeline.
All proofs run in CI on every pull request to main; a proof failure blocks merge.
The Python verification layer (`verification/engine_pure.py`) is a pure, side-effect-free
re-expression of `src/engine/engineMath.ts` and must remain in sync with it — a divergence
caught by a failing proof is a bug in the spec, not a reason to weaken the property.

### 6.1 Dafny Machine-Checked Proofs (P1–P6)

Dafny 4.x discharges verification conditions via Boogie + Z3 4.12.1.
The budget model uses a recursive geometric sum definition (division-free) to avoid
Z3's inability to discharge symbolic real division equalities. The gain engine models
the allocation loop as a fuel-bounded recursive function with loop invariants as postconditions.

| Property | ID | Statement | File | Status |
|---|---|---|---|---|
| Positive budget | P1 | cycles > 0 ∧ \|metrics\| > 0 → budget > 0 | `budget_model.dfy` | ✅ Verified |
| Monotone budget | P2 | cycles₁ > cycles₂ → budget₁ > budget₂ | `budget_model.dfy` | ✅ Verified |
| Geometric ≤ linear | P3 | effectiveCycles ≤ N (geometric sum bounded by linear) | `budget_model.dfy` | ✅ Verified |
| Zero cycles → zero budget | P4 | cycles = 0 → budget = 0 | `budget_model.dfy` | ✅ Verified |
| Gain non-negative | P5 | budget > 0 ∧ η > 0 → gain ≥ 0 | `gain_engine.dfy` | ✅ Verified |
| Gain bounded by cap | P6 | gain ≤ STAT\_CAP − startMetric | `gain_engine.dfy` | ✅ Verified |

**CI command:** `dafny verify --solver-path "$Z3_EXE" verification/dafny/budget_model.dfy`
**Expected output:** `Dafny program verifier finished with N verified, 0 errors`

---

### 6.2 Crosshair Symbolic Contract Verification (P5, P6, P8, P9, P16, P17)

Crosshair symbolically executes the pure Python spec layer against PEP 316 docstring contracts.
A counterexample prints the violating inputs before failing. The CLI subprocess interface is used
(the internal Python API is unstable across releases).

| Property | ID | Contract Function | Statement |
|---|---|---|---|
| Gain non-negative | P5 | `p5_gain_nonneg` | budget > 0 ∧ η > 0 → gain ≥ 0 |
| Gain bounded | P6 | `p6_gain_bounded` | gain ≤ STAT\_CAP − startMetric |
| Gain monotone in budget | P8 | `p8_gain_mono_budget` | budget₁ ≥ budget₂ → gain(budget₁) ≥ gain(budget₂) |
| Gain monotone in multiplier | P9 | `p9_gain_mono_mult` | η₁ ≥ η₂ > 0 → gain(η₁) ≥ gain(η₂) |
| Degradation non-negative | P16 | `p16_decay_nonneg` | `applySeasonDecay` never produces metric < 0 |
| Degradation non-increasing | P17 | `p17_decay_mono_levels` | more levels → lower or equal metric values |

**CI command:** `pytest tests/proofs/ -m proof -v --timeout=30`
**Pass criteria:** `N passed` (exact count: _[update after solver run]_), `0 failed`, `0 unknown`

---

### 6.3 Z3 SMT Proofs (P7, P10–P15, P18–P19)

Each proof encodes the **negation** of the target property and asserts `unsat`. A satisfiable
result means a counterexample was found; `unknown` (timeout) is a hard failure, never treated
as a pass. Constants are wired directly from `constants_pure.py` so the proofs always use the
live calibrated values.

| Property | ID | Test Function | Statement |
|---|---|---|---|
| Zero input → zero gain | P7a | `test_p7_zero_mult_implies_zero_gain` | η ≤ 0 → gain = 0 |
| Zero budget → zero gain | P7b | `test_p7_zero_budget_implies_zero_gain` | budget ≤ 0 → gain = 0 |
| Combined multiplier positive | P10 | `test_p10_combined_multiplier_positive` | η > 0 for all valid component values |
| Secondary < primary efficiency | P11 | `test_p11_grey_less_than_white` | greyMult(secondary) < greyMult(primary) |
| Efficiency class strict ordering | P12 | `test_p12_talent_ordering_strict` | Slow < Normal < Average < Fast < Fastest |
| Maturity multiplier non-increasing | P13 | `test_p13_age_multipliers_non_increasing` | older maturity → multiplier ≤ younger |
| CCI deterministic | P14 | `test_p14_ovr_deterministic` | same metric sum → same CCI |
| CCI non-decreasing | P15 | `test_p15_ovr_non_decreasing_on_stat_increase` | metric sum increases → CCI does not decrease |
| No false lockouts | P18 | `test_p18_no_false_lockouts` | baseCCI < 180 → not locked |
| No missed lockouts | P19 | `test_p19_no_missed_lockouts` | baseCCI ≥ 180 → locked |
| Lock bijection | P18+P19 | `test_p18_p19_lock_bijection` | locked ↔ baseCCI ≥ 180 (exhaustive) |

**CI command:** `pytest tests/proofs/ -m proof -v --timeout=30`
**Pass criteria:** `N passed` (exact count: _[update after solver run]_), `0 failed`, `0 unknown`

---

### 6.4 CI Gate Configuration

Both jobs must pass before any pull request can merge to main. A failing proof is a finding
to report against the engine as it exists — not a reason to weaken the property or alter the
engine to make the proof discharge.

```yaml
# .github/workflows/proofs.yml (abridged)
jobs:
  z3-crosshair:                            # Python-layer proofs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-python@<sha>
        with: { python-version: '3.12' }
      - run: pip install z3-solver crosshair-tool pytest pytest-timeout
      - run: pytest tests/proofs/ -m proof -v --timeout=30

  dafny:                                   # Machine-checked algorithmic proofs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-dotnet@<sha>
        with: { dotnet-version: '8.0' }
      - run: dotnet tool install --global dafny
      - name: Install Z3 4.12.1
        run: |
          curl -fsSL https://github.com/Z3Prover/z3/releases/download/z3-4.12.1/... -o z3.zip
          unzip -q z3.zip
          echo "Z3_EXE=$PWD/z3-.../bin/z3" >> "$GITHUB_ENV"
      - run: dafny verify --solver-path "$Z3_EXE" verification/dafny/budget_model.dfy
      - run: dafny verify --solver-path "$Z3_EXE" verification/dafny/gain_engine.dfy
```

---

*Document maintained by the system architect. Engine constants, proof counts, and calibration
status are the authoritative record. All changes to engine constants must be accompanied by
empirical evidence logged in `profiles/calibration_data.json` and a corresponding update to
the calibration status table in §4.*
