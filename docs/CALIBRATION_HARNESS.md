# Coach calibration harness v1

This harness makes the **production deterministic engine** the thing under test.
It does not contain a second coach formula.

## Data flow

`pre-outcome player + coach -> projectCoachAction -> deterministic point prediction -> observed game interval -> score`

Observed intervals never enter `projectCoachAction`. The experiment type keeps
`preOutcome` and `observed` structurally separate, and the engine adapter accepts
only `preOutcome`.

The current engine still reads its numerical constants from
`profiles/game_2025.json` through the existing engine path. Therefore editing a
calibration number there and rerunning this harness tests the **actual engine**,
not a calculator sitting beside it.

## Commands

```bash
npm run calibration:coach
npm run calibration:coach -- --id EXP-20260911-ROBERT-FOCUSED-OFFENSIVE-X26
npm run calibration:coach -- --json
npm run test:calibration
npm run test:calibration:baseline
npm run verify:calibration
```

`test:calibration` checks corpus integrity, determinism, the anti-leakage boundary
and the current residual direction. It is intended to stay green while models
are iterated.

`test:calibration:baseline` is deliberately different: it pins the exact output
of commit `d74037edc1103b2495b15fedbc6242ce2ab656e8`. A deliberate model change is
expected to make this test fail. That failure is the measured change, not a bug.
Do not update the baseline snapshot merely to make the test green.

## First two blind fixtures

The corpus starts with Robert Gavilán and Ross Ritchie against Training Camp /
Focused Offensive ×26. Both preserve the full pre-outcome 15-stat state, the old
externally frozen prediction, the exact observed intervals and `stateChanged=false`.

The current production engine baseline is intentionally captured. On both
players it predicts PASSING above the game interval and AGGRESSION below it. That
is a useful allocation failure, not something to average away.

## Adding an experiment

Add one object to `calibration/coach_experiments.v1.json` with:

- immutable `preOutcome.player`
- immutable `preOutcome.coach`
- optional external frozen prediction for provenance only
- exact observed stat/OVR intervals
- `stateChanged=false` for preview-only calibration

Then run `npm run test:calibration` before changing any model code.
