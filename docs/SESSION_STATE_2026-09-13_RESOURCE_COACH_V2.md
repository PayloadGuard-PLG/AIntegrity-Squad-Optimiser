# Session State — Resource Coach V2 Post-Merge

Date: 2026-09-13
Main merge: `6edf357499d25d4ce22c5bf29adb9887d876747f`
PR: #134
Model: `ordinary-academy-two-regime-integrated-v2-2026-09-13`

## What is now production-testable

The Coaches tab contains the offline Resource Coach V2 test/calibration surface.
Ordinary transfer can produce cold-start intervals or use one separate preview
anchor from the same player state. Predictions and observations persist
separately; predicted stats are not written back to player facts. Reward and
unresolved classes abstain.

## Mathematical boundary

- `u = displayedStat - tierAddition` for WHITE; MID_GREY keeps displayed value.
- exposure = multiplier / exact affected-stat count; MID_GREY has its own fitted factor.
- integrated two-regime response, regular-source cap in transformed coordinates.
- negative transformed coordinates are valid.
- approximate OVR interval = summed affected-stat endpoint gains / 15.
- anchor cannot be the preview it predicts; zero-gain previews cannot fit anchors.
- Training Rate/Talent selector is manual hypothesis metadata and is not an input.

## Validation

Global grouped-player holdout: 42 previews, 133 stat intervals, 15 players;
stat endpoint MAE 7.5730; interval overlap 0.7820; OVR endpoint MAE 2.0407.
Separate ×26 anchor: stat endpoint MAE 2.8569; overlap 0.9286; OVR endpoint MAE 0.7041.

## CI / integrity

Resource Coach Node 24 contracts, TypeScript suite, Z3/CrossHair and Dafny all
passed before merge. Native SQLite explicitly enables foreign keys before Drizzle.

## Immediate evidence target

Find one ordinary multi-stat preview on one player with widely separated starting
values and known WHITE/MID_GREY classes. Capture all 15 stats/classes, exact
affected set, multiplier and every `+lo–hi` interval. This is the smallest clean
experiment for remaining stat-cost/display-class structure.

## PayloadGuard

PR #134 is a retained false-positive regression fixture: replacement-aware
structural continuity, raw `docs` substring semantic matching, and exit-code
enforcement all require work in PayloadGuard. See
`docs/audits/PR_134_PAYLOADGUARD_FALSE_POSITIVE_AUDIT.md`.
