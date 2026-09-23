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

Non-positive player stat values are not valid attribute observations in this analysis path and are treated as missing/sentinel values. Preview gain endpoints may legitimately be zero and remain preserved.
