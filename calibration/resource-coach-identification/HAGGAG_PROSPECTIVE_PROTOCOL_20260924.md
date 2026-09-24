# Said Haggag prospective freeze — 24 September 2026

Status: **FROZEN BEFORE ANY RESOURCE COACH PREVIEW**.

Base research state: `research/fractional-observation-20260924@efdd9aaaedd75d970a30dbb0aebf1863867ba509`.
Preregistration: `PREREG-20260924-SHAPE-FIVE-MODEL`.

## Frozen player state

- Said Haggag, age 22, ST, T0, displayed OVR 96.
- Stat sum 1441; card mean 96.0666666667.
- No tier, role, special-ability, Personal Trainer, match, drill, recovery or Resource Coach intervention occurred between the captured card and this freeze.
- Screenshot provenance: user-supplied in-chat player card after signing.
- This player is not in the 30-player fitting pool and therefore enters the preregistered **primary arm**.

## First reveal

Open **Standard Attacking ×5, Drill Session, p=3** only after this branch is committed.

Affected stats and frozen displayed prediction intervals:

| Stat | Start | YG | SD22 | M1 | M* | M** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| PASSING | 102 | [13,21] | [11,19] | [13,22] | [13,21] | [13,21] |
| DRIBBLING | 102 | [13,21] | [11,19] | [13,22] | [13,21] | [13,21] |
| FINISHING | 121 | [13,20] | [11,18] | [11,17] | [10,16] | [11,16] |

The raw pre-render values are preserved in `frozen-predictions-20260924-haggag-shape-five-model.json`.

## Reveal protocol

1. Open the same Standard Attacking ×5 preview twice, with no state change between opens.
2. Capture both full preview screens. Do **not** start the Resource Coach.
3. Only after the reveal is recorded, begin the fractional-state drill sequence if desired.
4. For that sequence: same player, same 1-on-1 Finishing drill, Campus condition-drain modifier unchanged at -10%, twenty uninterrupted one-drill sessions, no recovery/match/other drill between sessions.
5. Record ordered condition loss, all visible stat changes, full card, and the same ×5 coach preview after each session.
6. Do not refit or edit any frozen prediction after observing a preview.

## Verification

The prediction generator was reimplemented directly from the pinned formulas/constants in:
- `tools/resource-coach-v2/structure_audit.py`
- `tools/resource-coach-v2/shape_models.py`
- `tools/resource-coach-v2/freeze_shape_test.py`
- `calibration/resource-coach-identification/shape-models-20260924.json`

For age 22/T0 the young-grey special case is inactive; all five predictions therefore reduce to the same deterministic equations used by the repository generator, with the appropriate frozen parameter set.
