# Squad Optimiser — Enterprise Overview

**Version 1.0 — Sprint 27**

---

## What It Is

Squad Optimiser is a mobile decision-support application for managers of football simulation games that use a stat-based player rating system. It turns three inputs — a player's current stats, a resource budget, and a target outcome — into a deterministic, step-by-step investment plan.

It is an offline-first, zero-API tool. No data leaves the device. No cloud subscription is required to run projections.

---

## The Problem It Solves

Football simulation games offer multiple resource types (training sessions, tier upgrade points, condition items) that each affect player ratings differently. Without tooling, managers must estimate outcomes by feel, often committing premium resources to suboptimal sequences.

The cost of a wrong choice compounds: applying a tier upgrade before training increases the baseline stat values the XP engine must work against, permanently raising the per-point cost of future training. The correct sequence — always drills before tier upgrade — is not obvious from in-game UI alone.

Squad Optimiser makes the correct sequence explicit and quantifies exactly how many sessions, at what cost, produce what rating.

---

## Core Features

### OVR Projection Engine

Given a player's 15 individual stat values, the engine computes:
- Per-stat XP cost at current value using a calibrated exponential cost curve
- Projected stat gain from a given training block (session count × drill type × intensity)
- New OVR after training, tier upgrade, or both — in the correct application order
- Warnings when training is locked (base OVR ≥ cap), when stats are missing, or when selected drills don't apply to the player's role

The OVR formula is verified empirically from device screenshots: `OVR = ceil(mean of all 15 stats)`.

### Calibrated XP Model

The training cost model uses a continuous exponential curve derived from observed game data:

```
cost(stat) = 2.94 × exp(stat / 55)
```

This was validated against controlled coaching observations across multiple stat ranges (60–260). The model correctly explains why high-value stats (200+) train orders of magnitude slower than low-value ones.

Age, talent tier, stat whiteness (role-essential vs secondary), drill intensity, and ad multipliers are all factored in. The formula structure is confirmed against published community research.

### Role-Aware Stat Classification

Each player position has a defined set of essential stats (white) and secondary stats (grey). Grey stats train at half the XP efficiency of white stats. When a player holds multiple positions, the white set is the union of all positions' essential lists — this maximises projection accuracy and matches the in-game mechanic.

Stat whiteness is determined at projection time from the player's current role selection, not hardcoded per player.

### On-Device OCR — Player Card and Coach Preview

The app scans in-game screenshots using ML Kit text recognition (on-device, no network). Two scanner types:

**Player Card Scanner** — extracts player name, age, roles, tier, talent, OVR, and all 15 stat values from a screenshot of the player's profile card.

**Coach Preview Scanner** — extracts coach type (Standard / Focused / Extensive), category (Attacking / Defending / Physical / Safeguard), session multiplier, and the specific stats the coach boosts. Two states are handled: when a player is selected (gain ranges visible) and when no player is selected (arrow indicators only).

All extraction is performed on-device. No image data is transmitted. No AI or cloud inference is used at any point.

### Tier Upgrade Modelling

Tier upgrades add a flat bonus to each essential (white) stat. The bonus is role-specific — secondary stats and off-role stats receive nothing. The engine applies tier upgrades in the correct post-training position and recomputes OVR from the full updated stat set.

Tier progressions are modelled step by step (T0 → T1 → T2 → …) so multi-tier upgrade paths show incremental OVR gains and point costs at each step.

### Condition and Drill Drain Model

Each drill has a fixed condition cost per run:
```
conditionLoss = 0.75% × intensityMultiplier × (1 − fanClubReduction)
```

At the highest fan club level (50% reduction) combined with the lowest intensity, condition loss rounds to zero — enabling continuous drilling with no condition drain. The engine identifies this zero-drain state and flags it explicitly.

---

## Architecture

### Runtime Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK 53) |
| Routing | expo-router (file-based) |
| Local DB | SQLite via Drizzle ORM + expo-sqlite |
| OCR | ML Kit text recognition (on-device) |
| Language | TypeScript (strict) |

### Data Flow

```
Game screenshot
    ↓ ML Kit OCR (on-device)
    ↓ playerScanner.ts / coachScanner.ts
    ↓ extracted stat values + coach metadata
    ↓ ovrProjector.ts + xpEngine.ts
    ↓ per-step OVR projection
    ↓ UI display (coaches.tsx / results.tsx)
```

No step in this chain makes a network request. The profile parameters (`profiles/game_2025.json`) are bundled at build time.

### Key Modules

| Module | Role |
|---|---|
| `src/logic/xpEngine.ts` | XP cost model, OVR formula, tier bonus application, age/talent multipliers |
| `src/logic/ovrProjector.ts` | Full projection chain: drills → tier → condition |
| `src/logic/coachScanner.ts` | Coach preview OCR: type/category/multiplier, highlighted stat detection |
| `src/logic/playerScanner.ts` | Player card OCR: stats, roles, tier, talent, OVR |
| `src/logic/coachPipeline.ts` | Post-OCR consolidation: discards image values, resolves stat names, dispatches to projection engine |
| `src/database/drillDatabase.ts` | Drill catalogue: 40 drills across 4 types and 5 intensities |
| `profiles/game_2025.json` | Calibrated game parameters: XP curve, age table, tier additions, drill multipliers |

### Local Database (SQLite)

Player records, saved projection runs, and drill presets are stored in a device SQLite database managed by Drizzle ORM. Migrations are incremental and idempotent. No sync, no remote storage, no account required.

---

## Privacy and Security

- **Zero network calls during operation.** No API keys. No telemetry. No analytics.
- **All OCR runs on-device** via ML Kit. Images are processed in memory and never persisted or transmitted.
- **All player data stays on device.** The SQLite database is local only. No backup to cloud services is performed by the app.
- **No account, no login.** The app functions entirely without user authentication.

---

## Accuracy and Calibration

The projection engine is calibrated against observed in-game data, not theoretical models:

| Parameter | Calibration source |
|---|---|
| OVR formula | 4 player/tier snapshots — all match `ceil(mean(15 stats))` |
| XP cost curve | Gain ratio between two stats at stat values 120 and 228 in the same coaching session |
| baseXpPerSession | Standard Defending ×40 on a confirmed Normal talent player, age 20 |
| Age multipliers | Community-verified table across all age bands |
| Condition formula | Direct in-game screenshot verification across all intensity levels and fan club levels |

Projections are estimates. The game has internal state (fractional stat accumulation, unobservable carryover) that is not accessible from screenshots. Actual results will differ by small amounts from projections.

Known limitations: talent tier multipliers for above-Normal talent are community estimates, not empirically confirmed against known-talent calibration players. The ×N anomaly (whether doubling session count yields proportional or sub-linear gains) is under investigation.

---

## Deployment

The app is distributed via EAS (Expo Application Services) as an Android APK. OTA (over-the-air) updates are delivered on the `main` branch. Development and feature work is committed to a separate branch before merging.

The app does not require Play Store distribution — it can be installed directly from a build URL on any Android device.

---

## Development Status

| Feature | Status |
|---|---|
| OVR projection engine | Production — calibrated, verified |
| Player card OCR | Production — role anchoring, multi-role detection |
| Coach preview OCR | Production — handles player-selected and no-player states |
| Drill catalogue (40 drills) | Production |
| Tier upgrade modelling | Production |
| Condition drain model | Production |
| Drill preset saving | Production |
| New role training progress | Production |
| Team Play system modelling | Not modelled — documented only |
| Squad-wide aggregate projection | Not modelled — single-player projection only |
| ×N session scaling formula | Under investigation |
