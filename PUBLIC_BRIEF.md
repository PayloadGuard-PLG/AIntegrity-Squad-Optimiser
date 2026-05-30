# AIntegrity Squad Optimiser — Public Brief

A resource allocation optimiser that uses a mobile game as a controlled experimental environment for mathematical modeling, empirical calibration, and black-box reverse engineering.

**Author:** Steven Dark | Systems Architect | Aberdeen, Scotland

---

## What This Is — And What It Is Not

This is **not** a gaming app. It is a resource allocation engine that demonstrates:

- Black-box reverse engineering of opaque systems
- Empirical calibration under uncertainty with epistemic status tracking
- Mathematical modeling (exponential cost curves, geometric decay, compounding multipliers)
- Privacy-constrained, low-connectivity operation

The mobile game serves as a controlled experimental environment — a system with hidden internal mechanics that must be reverse-engineered through observation alone. The methodology is the point, not the game.

---

## Design Constraints

| Constraint | Implementation |
|---|---|
| **Zero network calls** | All processing runs entirely on-device. No API calls, no telemetry, no analytics. |
| **No accounts** | No user registration, no login, no authentication. The app is stateless with respect to external services. |
| **No telemetry** | No usage tracking, no crash reporting, no analytics SDK. |
| **On-device persistence** | SQLite via Drizzle ORM. All data stays on the device. |
| **On-device ML** | OCR scanning via Google ML Kit — images processed in memory, never persisted or transmitted. |

These constraints model privacy-constrained, low-connectivity operation — a design pattern relevant to edge computing, field-deployed systems, and environments where data must not leave the device.

---

## Methodology — Empirical Calibration

**Core principle:** *Community data is not trusted. Every constant must be back-calculated from actual observations.*

Each engine constant carries an epistemic status label:

| Status | Meaning |
|---|---|
| **Confirmed** | Back-calculated from game screenshots with documented evidence |
| **Assumed** | Reasonable estimate pending empirical validation |
| **Invalidated** | Previously assumed, proven incorrect by observation |

Examples of confirmed constants and their evidence:

| Constant | Value | Evidence |
|---|---|---|
| xpCostBase (C0) | 2.94 | Derived from Tackling-120 / Positioning-228 gain ratio (same session, same budget) |
| xpCostDecayK (K) | 47 | Calibration solver: minimises CV across 5 observations (CV=3.2%) |
| baseXpPerSession | 676 | Back-calculated from Standard Defending x40 (all 5 stats within game range) |
| greyWeightMultiplier | 0.22 | Back-calculated from grey stat observation (stat=155, +11-15 actual) |
| sessionBudgetDecay | 0.99 | Geometric model error -1 vs linear model error +9. Resolves anomaly conclusively. |
| OVR formula | floor(sum/15) | Confirmed from clean tier upgrade: sum=2615, floor(2615/15)=174, game shows 174 |

Every calibration observation is recorded with before/after screenshots, the player used, session count, and the mathematical derivation. See `CALIBRATION_RECORD.md` and `CLAUDE.md` for the full evidence table.

---

## Architecture — 16-Stage Pure-Function Pipeline

The mathematical engine is a pipeline of pure functions. Each stage is independently testable and tunable:

1. **Input normalisation** — player stats, age, role, talent tier
2. **Role classification** — white (essential) vs grey (secondary) stat identification
3. **Cost curve evaluation** — exponential model: C0 x e^(stat/K)
4. **Age multiplier application** — confirmed age brackets with decay factors
5. **Talent tier adjustment** — growth multiplier per talent classification
6. **Session budget calculation** — baseXpPerSession with geometric decay over multiple sessions
7. **Budget allocation** — even distribution across targeted stats
8. **Per-stat gain projection** — XP budget vs cost curve intersection
9. **Star decay application** — intra-session efficiency penalty every 20 OVR gained
10. **Tier bonus calculation** — white stat additions per tier level (T0-T6)
11. **OVR computation** — floor(sum_of_all_stats / 15)
12. **180-Rule enforcement** — training lock when base OVR reaches 180
13. **Condition drain modeling** — baseLoss x intensityMultiplier x (1 - fanReduction/100)
14. **Drill ROI ranking** — efficiency divided by condition cost, all 40 drills
15. **Sequential plan composition** — drills, coaching, tier, restorers in optimal order
16. **Projection output** — gain range (low-high) per stat, projected OVR, resource costs

No stage depends on network state, user accounts, or external services.

---

## OCR Scanning

On-device text recognition via Google ML Kit:

- **Player card scanning** — reads all 15 stats, OVR, age, role, and tier from a screenshot
- **Coach preview scanning** — extracts session count, stat highlights, and gain ranges from coach screens
- Images are processed in memory and never persisted or transmitted
- Multi-column layout handling with spatial filtering (left-to-right column isolation)

---

## Technology

| Component | Technology |
|---|---|
| Runtime | React Native (Expo SDK 53) |
| Language | TypeScript |
| Database | SQLite (expo-sqlite) + Drizzle ORM |
| OCR | Google ML Kit (Text Recognition) |
| Routing | Expo Router |
| Styling | Tailwind CSS (NativeWind) |

---

## What This Demonstrates

| Capability | Evidence |
|---|---|
| **Black-box reverse engineering** | Opaque game mechanics modeled from observation alone — no source code access, no documentation, no API |
| **Empirical calibration** | Every constant back-calculated from data with epistemic status tracking and documented evidence chains |
| **Mathematical modeling** | Exponential cost curves, geometric decay, compounding multipliers — each independently validated |
| **Privacy-first architecture** | Zero network calls, no accounts, no telemetry — models edge-computing design constraints |
| **Pure-function design** | 16-stage pipeline, each stage independently testable — no side effects, no shared mutable state |
| **On-device ML** | OCR pipeline handling multi-column layouts with spatial filtering — images processed in memory only |

---

## Classification

This brief contains **Tier 1 (Fully Public)** content only. See [`DISCLOSURE_STRATEGY.md`](https://github.com/PayloadGuard-PLG/payload-consequence-analyser/blob/main/DISCLOSURE_STRATEGY.md) in the PayloadGuard repository for the full classification framework.

---

*Built solo, from a phone, using AI-directed development. Three months. No team, no IDE, no desktop.*
