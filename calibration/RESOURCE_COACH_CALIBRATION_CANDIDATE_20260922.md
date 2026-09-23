# Resource Coach calibration candidate — 2026-09-22

## Purpose

This branch does **not** promote a new production transfer law. It wires the strongest
surviving 2026-09-21 structure into the existing calibration surface so future previews
can falsify it prospectively while preserving the 2026-09-13 V2 predictor as a baseline.

## Current evidence status

The shipped V2 baseline (`ordinary-academy-two-regime-integrated-v2-2026-09-13`) was
validated on 42 previews / 133 stat intervals / 15 players:

- grouped-player endpoint MAE 7.5730;
- interval overlap 0.7820;
- approximate OVR endpoint MAE 2.0407;
- a separate same-player x26 anchor reduced held-out endpoint MAE to 2.8569 and
  approximate OVR endpoint MAE to 0.7041.

The later 2026-09-21 system-identification work materially improved the structural model:

- WHITE coordinate: `u = displayedStat - tierAddition`;
- MID_GREY coordinate: `u = displayedStat`;
- below-zero renderer: `g = max(0,u+J) - max(0,u)`;
- marginal cost flat to a class threshold then exponential;
- candidate thresholds WHITE ~135, MID_GREY ~120;
- exponential slope beta ~0.0354;
- age-scale bands 17–21:8, 22–25:6, 26–29:4, 30–31:2, 32+:1;
- diagnostic shared dose `N^1.056 / p^1.073`;
- Reward represented as a dose modifier (~0.60 in this candidate);
- upper endpoint dose ~1.50 x lower.

A refined grouped-player replay reached about 2.64 endpoint MAE, 2.43 player-macro MAE
and 96.7% interval overlap. Recorded prospective Drill/Reward checks intersected all 9
stat intervals at about 1.56 endpoint MAE with 2/2 OVR intervals exact. A later
shared-dose held-out comparison intersected all 19 new stat ranges at about 1.84 mean
endpoint error. That 19-range check is useful but not deployment-blind because the model
development process had already seen related corpus structure.

A separate recent system-level projection estimated a goalkeeper path of approximately
140 -> 174 -> 194 -> 238 OVR; the observed final value was 237.5. This is retained as a
predictive sanity check on the composed planner, not used to fit the one-step Resource
Coach candidate.

Those results are **not enough to identify the final equation**. The same shared-dose
candidate still fails parts of the complete corpus, with a largest endpoint miss around
20 points. The strongest surviving conclusion is a shared latent stat-response layer
with programme/session-specific dose generation.

Still unresolved:

- exact Drill Session versus Skill Seminar dose laws;
- whether Skill Seminar `N^1.46 / p^0.75` is genuine or confounded;
- Focused coefficient — recent held-out comparisons did not require a separate penalty,
  but coefficient 1 versus a reduced value is still not identified;
- exact Reward scaling — the frozen 0.60 candidate value is a falsifiable test value,
  not an identified game constant;
- endpoint renderer;
- exact OVR preview construction.

## Calibration implementation

`src/logic/resourceCoachCandidate.ts` implements only the shared structural candidate.

The programme-family field (`unknown`, `drill-session`, `skill-seminar`) is persisted as
metadata but deliberately **does not alter the prediction yet**. This prevents a
provisional family coefficient from compensating silently for response-curve errors.

The UI exposes both:

1. **V2 baseline** — unchanged mathematical baseline.
2. **21 Sep calibration candidate** — shared latent/rectified diagnostic prediction.

Both snapshots are persisted with distinct model versions. Observed preview bounds remain
separate evidence.

## White/grey state

Affected stat class is now derived from the selected player's persisted established-role
state and current stat record. The user is no longer asked to re-confirm every WHITE/GREY
row. A manual override remains available only for direct contradictory game evidence.

Learning roles remain excluded because they are not part of the player's established
`role` state.

## Promotion criterion

Do not replace V2 or a future production predictor from retrospective fit alone. Promote
only after the candidate survives grouped historical replay **and** prospective previews
across multiple players, programme families, multipliers, affected-stat counts, ages and
WHITE/MID_GREY coordinates without family parameters masking response-model errors.
