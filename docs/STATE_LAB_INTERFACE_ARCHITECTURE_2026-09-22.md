# State Lab interface architecture — 2026-09-22

## Source visual

Selected visual target: **AIntegrity Squad Optimiser — Option Explorer / State Lab**, generated and selected on 2026-09-22.

Reference image dimensions: **941 × 1672 px**.

The visual is a design target, not a claim about current runtime fidelity. The current State Lab calculations remain authoritative; this document records how to build the interface around them.

## Product intent

State Lab should remove mental bookkeeping from player development without pretending that an optimised path guarantees a match result.

The screen answers:

1. **What is the player's current known state?**
2. **Which legal actions can I explore from here?**
3. **What becomes irreversible in the source game?**
4. **What exact stat / OVR consequences follow from each deterministic action?**
5. **Which parts are observed, calibrated, or unknown?**
6. **Can I discard the preview and explore a different branch before committing in game?**

The user remains the decision-maker. The optimiser exposes consequences.

## Component tree

```
StateLabRoute
├─ AppHeader
│  └─ top-level app navigation
├─ OptionExplorerHero
│  ├─ title: OPTION EXPLORER
│  ├─ subtitle
│  └─ model-boundary affordance
├─ PlayerStateCard
│  ├─ identity / age / OVR
│  ├─ established roles
│  ├─ current tier
│  ├─ selected playstyle + level
│  └─ deployed role
├─ ActionPathPanel
│  ├─ section header
│  ├─ reset preview
│  ├─ PathStepRow[]
│  │  ├─ ordered step number
│  │  ├─ action title
│  │  ├─ deterministic consequence summary
│  │  ├─ evidence state
│  │  └─ source-game reversibility badge
│  ├─ SeasonalFreeRoleCallout
│  └─ AddToPath affordance
├─ ProjectedResultPanel
│  ├─ projected OVR
│  ├─ white-stat count
│  ├─ key stat deltas
│  └─ full projected-stat detail affordance
├─ KnowledgeReferencePanel
│  └─ ReferenceTile[]
│     ├─ observed rule / mechanic
│     └─ evidence state
└─ StickyPlanBar
   └─ SAVE PLAN
```

## Code ownership

### Route orchestration

`app/(tabs)/state-lab.tsx`

Owns:
- selected player;
- preview selections;
- transition ordering;
- current resources;
- reset;
- save-plan intent;
- conversion from domain state to view model.

Does **not** own:
- tier math;
- white/grey rules;
- role adjacency;
- playstyle compatibility;
- coach model equations.

### Domain truth

`src/logic/stateTransitions.ts`
`src/utils/roleWeights.ts`
`src/data/playstyles.ts`
`src/data/mentors.ts`

These remain the sources of truth. UI components receive already-computed consequences.

### Presentational architecture

`src/components/state-lab/`

Initial contracts:
- `types.ts` — screen-level view model contracts;
- `StateLabPanels.tsx` — reusable panel primitives from the visual;
- further extraction should split PlayerStateCard / ActionPathPanel / ProjectedResultPanel once their data contracts stabilise.

### State-Lab-only visual tokens

`src/constants/stateLabVisual.ts`

The generated target uses a much richer violet / indigo / teal visual language than the current global black theme. Those tokens are scoped so we can reproduce the target without forcing a global redesign.

## View model

The route should converge on one render contract:

```ts
StateLabViewModel {
  player
  path[]
  resources[]
  projection
  references[]
  freeRoleAvailable
  canSavePlan
  modelBoundary
}
```

No component should recalculate game mechanics.

## Transition semantics

Every path step must expose **two different forms of reversibility**:

### Preview reversibility

Always reversible until the user leaves State Lab and performs the action in the game.

Resetting the preview discards the branch.

### Source-game reversibility

Stored on the transition:

- role established: **irreversible**
- tier purchased: **irreversible**
- playstyle learned/upgraded: **irreversible**
- deployed position: **reversible**
- coach/training action: persistent once consumed in game; preview remains discardable

The red/green badges in the visual refer to **source-game reversibility**, never to whether State Lab can reset the preview.

## Action-path model

The mock's strongest idea is the ordered **Action Path** rather than four disconnected setting panels.

A path is an ordered list of state transitions:

```
S0 current player
  -> role
S1
  -> coach interval (future)
S2
  -> tier
S3
  -> playstyle
S4
  -> deployment
S5 projected state
```

Order matters.

Examples:

- coach before tier can preserve better coach response;
- role before tier can make newly-white stats receive the tier increment;
- role after tier can cause newly-white stats to inherit the existing cumulative tier bonus;
- deployed position controls whether a position-constrained playstyle is active.

State Lab must therefore store path order explicitly instead of treating options as independent toggles long term.

## Evidence states

Every rule shown in the interface should map to one of:

- **confirmed** — deterministic and regression-pinned;
- **observed** — directly read from current game screens / player cards;
- **calibrating** — current empirical model, such as Resource Coach;
- **unknown** — not modelled.

The visual should never collapse these into a single confidence badge.

## Coaches

Resource Coach stays separate while calibration continues.

When composed into State Lab, a coach step must carry an interval:

```
Finishing 135 -> 147..150
OVR 148.5 -> 153.2..155.3
```

Do not silently replace intervals with midpoints.

The path engine should propagate `lo/hi` through later deterministic tier/role transitions.

## Playstyles

Playstyle support is primarily a compatibility problem, not a win-probability problem.

State Lab should show:

- playstyle name;
- level / displayed effect multiplier;
- compatible owned roles;
- compatible prospective roles;
- active/inactive at the selected deployed position.

This directly answers questions such as:

> If I add DMC, does this player's existing Regista remain usable there?

It should **not** convert `Effect ×4` into a fabricated goal or win value.

## Seasonal free role

The screen has an explicit seasonal resource:

`1 free role addition per season`

The optimiser should treat that as a resource state, not as a property of one player.

When unavailable, the same branch can remain visible but must say:

`ROLE TRAINING REQUIRED · TIME NOT YET MODELLED`

This keeps the action graph complete without inventing duration.

## Projected result

The visual intentionally makes consequences visible before commitment:

- OVR: current -> projected;
- white stat count: current -> projected;
- stat deltas;
- final role set;
- final tier;
- playstyle activity;
- resource shortage / coverage.

OVR should be presented as a consequence, not as the sole optimisation objective.

## Knowledge reference

The bottom reference strip is not decoration. It externalises rule provenance.

Examples already justified by current evidence:

- Pure MC -> 10 white stats.
- MC + DMC -> Aggression + Heading newly white.
- DMC + MC + AMC -> observed role-set interaction: Strength becomes white.
- mentor flat stat boosts -> deterministic.
- playstyle role compatibility -> observed.

Each tile should link to the relevant reference page or evidence record later.

## Future squad layer

The player-development screen should remain composable with a later squad layer rather than absorb it.

A later **Squad Impact** panel can consume the final player state and show:

- lineup OVR delta;
- observed Defence / Midfield / Attack balance delta;
- positional replacement;
- active playstyle changes;
- formation coverage.

The exact Lineup Balance formula is still unknown. Until identified, store and compare observed game values rather than fabricate internal weights.

## Future matchup / mentor layer

Mentor selection belongs after squad state is known.

Inputs:

- own final XI state;
- opponent OCR snapshot;
- opponent player stat shape;
- opponent formation;
- available mentor catalogue.

Outputs:

- exact flat attribute effects;
- game-stated tactic/signature modifiers;
- which opponent attributes / zones are targeted;
- unknown variable: opponent mentor.

Do not convert tactic percentages into guaranteed outcomes without calibration.

## Responsive behaviour

### Phone / narrow web

Primary target.

- one vertical column;
- sticky Save Plan control at bottom;
- action steps full width;
- projected metrics stacked or 2-up only when readable;
- horizontal tab chrome may scroll.

### Tablet / wide web

- content max width ~940 px;
- player summary can split identity / state horizontally;
- projected result can use 3-column layout;
- reference tiles can become a horizontal grid.

The path itself should remain vertical because ordering is semantically meaningful.

## Accessibility

- never rely on red/green alone for reversibility;
- badges must include text;
- touch targets >= 44 px where practical;
- stat deltas need signed text;
- active playstyle must include ACTIVE/INACTIVE wording;
- evidence states must be readable text, not only color.

## Build order

1. Extract PlayerStateCard.
2. Replace the current four independent State Lab sections with an ordered ActionPathPanel while preserving the same transition functions.
3. Add ProjectedResultPanel.
4. Add ResourceStatus rows and Save Plan snapshot.
5. Add coach interval steps only after current calibration stabilises.
6. Add squad impact / balance as a separate derived panel.
7. Add mentor matchup after opponent OCR exists.

## Non-goals for this slice

- exact recreation of every icon from the generated image;
- changes to Resource Coach V2;
- full playstyle catalogue;
- exact Lineup Balance reverse engineering;
- opponent mentor prediction;
- match outcome prediction.

The architecture is deliberately deterministic where the game rules are known and explicit about uncertainty everywhere else.
