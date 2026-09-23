# Canonical longitudinal corpus snapshot

`canonical-corpus-v1.json.gz.b64` is the workflow-readable normalized snapshot of:

`Squad_Optimiser_Corpus_Calibration_Transfer_2026-09-12.xlsx`

Source workbook SHA-256:

`afdc3b421cde5ce0a49bfe3e451157905b3e0962eb6e3ddbe544448842e23f70`

The snapshot is derived only from the canonical observational/event-sourced workbook sheets. Derived analysis sheets are not source truth.

Canonical source counts:

- 28 stable player identities
- 38 complete immutable player states
- 570 player-state stat rows
- 7 coach definitions
- 25 coach instances
- 23 coach previews
- 345 coach-preview stat rows
- 79 explicit affected-stat gain intervals, including the observed exact zero interval for Neri Finishing

The compact snapshot stores the player states and previews in the analyser's supported `players` / `experiments` representation. GitHub Actions decodes it in memory; the original workbook hash is retained in the snapshot and Resource Coach manifest.

## Direct display-class provenance companion

`display-class-evidence-v1.json.gz.b64` restores one field that the compact snapshot normalization omitted: the directly observed white/mid-grey display class for each coach-preview stat.

It is derived from the **same byte-identical pinned workbook** above, not from role tables or model output. The workbook's `COACH_PREVIEW_STATS` sheet explicitly stores `display_class`, independently from `coach_affected`. Every preview/stat class was cross-checked against the independently stored `PLAYER_STATE_STATS` observation for the same player-state/stat.

Evidence counts:

- 345 preview-stat display-class observations across 23 previews
- 241 `WHITE`
- 104 `MID_GREY`
- 79 rows with explicit gain endpoints, including Neri Finishing `0–0`
- 0 missing player-state cross-checks
- 0 display-class cross-check mismatches

Companion file SHA-256: `ee97b07648af03f575319a79f15893adbf090a506318b1c399b626cd87675cfd`.

The analyser keys this evidence by `preview_id + stat`. It may fill a **missing** historical class only. It never overwrites an existing non-null class, never derives class from a role map, and fails the analysis if direct evidence conflicts with an existing observed class.

Non-positive player stat values are not valid attribute observations in this analysis path and are treated as missing/sentinel values. Preview gain endpoints may legitimately be zero and remain preserved.

The analyser also emits `experiment_state_matches.csv`, ranking every current experiment state against the complete canonical state set using transparent structural fields (tier, age, roles) and full shared-stat vector error. A non-exact nearest state is always labelled as an analogue rather than an identity claim.
