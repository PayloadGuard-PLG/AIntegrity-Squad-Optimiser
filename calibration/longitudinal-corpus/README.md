# Longitudinal corpus snapshot

`corpus-v1.json.gz.b64` is the workflow-readable normalization of the canonical workbook **Squad_Optimiser_Corpus_Calibration_Transfer_2026-09-12.xlsx**.

Source workbook SHA-256:

`afdc3b421cde5ce0a49bfe3e451157905b3e0962eb6e3ddbe544448842e23f70`

The snapshot contains only canonical observational/event-sourced sheets:

- PLAYERS
- PLAYER_STATES
- PLAYER_STATE_STATS
- COACH_DEFINITIONS
- COACH_INSTANCES
- COACH_AFFECTED_STATS
- COACH_PREVIEWS
- COACH_PREVIEW_STATS
- TRAINING_EVENTS
- TRAINING_STAT_DELTAS
- STATE_TRANSITIONS
- PROVENANCE

Derived workbook sheets are deliberately excluded. The workflow regenerates its own derived comparisons from the canonical rows.

## Longitudinal semantics

A stable player identity is not a player state. `previous_player_state_id` supplies ordering/linkage only; it does not become a causal state transition unless the corpus explicitly records that transition. `PREVIOUS_OBSERVED_STATE_NOT_ASSERTED_DIRECT_TRANSITION` therefore remains a longitudinal state comparison. `PREVIOUS_OBSERVED_STATE_EXACT_REOBSERVATION` is an exact re-observation, not a transition.

The current snapshot contains 28 stable players, 38 complete observed player states and 570 player-state stat rows. It also contains 23 coach previews / 345 preview-stat rows. The analyzer detects exact duplicate empirical response rows and assigns only the canonical copy analytical weight; duplicates remain present in the raw export.

## Automated analysis

`tools/resource-coach-v2/analyze-longitudinal-corpus.mjs` processes the complete corpus in one pass. It does not persistently select one player and rerun the corpus around that player.

Outputs include:

- `state_pairs.csv` — every same-player longitudinal state comparison, with transition semantics and stat deltas.
- `state_neighbours.csv` — nearest cross-player state analogues for every observed state.
- `response_rows.csv` — normalized observed coach-response rows with duplicate-evidence weighting.
- `response_analogues.csv` — cross-player coach-response analogues for every unique response row.
- `experiment_metrics.csv` — one intake/coverage row for every immutable app experiment in `calibration/resource-coach-log/runs/`.
- `experiment_state_neighbours.csv` — corpus-state matches for every experiment in the same run.
- `experiment_stat_analogues.csv` — historical response analogues for every observed stat in every experiment.
- `summary.json` / `summary.md` — corpus-wide integrity and coverage summary.

Similarity distances are deterministic retrieval heuristics. They are not fitted transfer equations and are never promoted to source truth.
