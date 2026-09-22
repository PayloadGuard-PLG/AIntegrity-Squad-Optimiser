# State-transition expansion — 2026-09-22

## Baseline and scope

Baseline: `main@98089c7eb78b03d7a0f7ff107a8d0588ada65fee`.

Open Resource Coach work is deliberately excluded from this feature branch:

- PR #137 — coach target-detection regression repair.
- PR #138 — Resource Coach provenance repair and system-identification analysis.

This expansion does not alter Resource Coach V2 mathematics, coach OCR, calibration constants, Reward transfer policy, or the calibration corpus.

## What already works

The app already has useful deterministic and evidence-qualified components:

- player OCR/state merge with explicit observed-vs-unread semantics;
- established roles separated from a learning role;
- tier bonuses and the 180 base-OVR lock;
- white/grey role derivation, including evidence-scoped role-set interactions;
- coach/drill projection seams with provenance-aware run storage;
- full-plan and squad-plan screens;
- one-level local snapshot/revert for app-side card edits.

The limiting factor is not another monolithic recommender. It is exposing the consequence graph so a player can compare legal paths without doing the arithmetic mentally.

## Design principle

The optimiser should make states and transitions explicit, not claim that an optimised path guarantees a match result.

A plan branch is reversible in the optimiser. Some source-game actions are not:

- role established: irreversible;
- tier purchased: irreversible;
- playstyle learned/upgraded: irreversible;
- deployed position: reversible;
- coach/training effects: persistent once actually consumed, but projections remain uncertain while calibration is ongoing.

The new planning types therefore carry `gameReversible` separately from preview reversibility.

## First implementation slice

### 1. Correct pure-MC white/grey state

Live pure-MC cards supplied on 2026-09-22 show:

- SHOOTING white;
- STRENGTH grey;
- 10 white attributes total.

The existing table had both SHOOTING and STRENGTH white, producing 11 whites for a pure MC. The new direct control falsifies that individual-role assignment.

One existing card-anchored control then exposed something more useful: Cieran Morgan (DMC/MC/AMC) still shows STRENGTH white, even though STRENGTH is grey for the individual MC, DMC and AMC role tables. That means a simple union of independent role masks is not sufficient for every role set.

The branch therefore:
- corrects pure MC to 10 whites;
- preserves Cieran's directly observed 14-white state;
- encodes the exact observed DMC+MC+AMC → STRENGTH-white interaction only;
- does **not** generalise a broader role-interaction law without more controls.

This is precisely the kind of state transition the option explorer should surface rather than hide inside a single OVR number.

### 2. Deterministic state-transition kernel

`src/logic/stateTransitions.ts` previews:

- adjacent role establishment;
- retroactive application of the current cumulative tier bonus to newly-white stats;
- tier upgrades;
- playstyle assignment/level metadata;
- deployed-role/playstyle activation.

It is pure and does not write the player DB.

### 3. Partial observed playstyle catalogue

The initial catalogue contains only playstyles observed in supplied live screens:

- Regista — MC/DMC;
- False Nine — ST/AMC;
- Target Man — ST;
- Stopper — DC;
- Full Back — DL/DR.

Levels retain the displayed x1/x2/x3/x4 progression. Match conversion is not inferred.

### 4. Partial observed mentor catalogue

The initial mentor data captures exact displayed flat boosts and tactic/signature labels for:

- Jonas Braun / The Analyst;
- Lewis Green / The Wing Commander;
- Rubén Herrera / The Saboteur.

Flat attribute boosts are deterministic. Percentage tactic/signature effects remain labelled modifiers; the app does not invent a win-probability conversion.

### 5. New pages

- **STATE LAB** — selected-player option explorer. Role, tier, playstyle and deployed-position branches are previewed without writing the player card.
- **REFERENCE** — currently observed playstyle and mentor data, with explicit incompleteness and uncertainty boundaries.

## State flow

```
observed player
  -> preview role branch
  -> preview tier branch
  -> preview playstyle
  -> preview deployed role
  -> compare resulting stats / OVR / active playstyle
```

Coach projections remain a separate calibrated/uncertain transition source. They can be composed into this graph later through the existing recommendation seam once the current system-identification work stabilises.

## What is intentionally not modelled yet

- exact Lineup Balance formula;
- opponent mentor, which is hidden pre-match;
- mentor percentage effects as goals/win probability;
- full playstyle catalogue;
- playstyle acquisition cost/point economy;
- role-training duration when the seasonal free role is unavailable;
- gem top-up exchange rates;
- opponent-card OCR and matchup ingestion.

These are extension seams, not blanks to fill with guesses.

## Next high-value slices

1. Complete playstyle catalogue from observed information screens.
2. Persist exact playstyle name and level separately from badge family.
3. Add matchup snapshot capture: own observed Defence/Midfield/Attack, opponent observed values, opponent player cards.
4. Add mentor comparison against the matchup snapshot using deterministic flat boosts plus labelled tactical modifiers.
5. Add opponent OCR only after the manual data path is stable.
6. Compose calibrated coach transitions into State Lab with interval propagation rather than midpoint laundering.
7. Add plan persistence/versioning so branches can be saved, compared and discarded without implying source-game reversibility.

## Safety boundary

No production coach/calibration code is changed by this slice. The new planner consumes existing deterministic rules and observed reference data only.
