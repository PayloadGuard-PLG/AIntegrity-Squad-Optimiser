# Resource Coach experiment log

This directory is the version-controlled mirror of the app's immutable Resource Coach evidence.

## Contract

- Canonical run unit: one `resource-coach-experiment-v1` JSON file per empirical preview.
- Filename: `runs/<experimentId>.json`.
- A single experiment may contain multiple frozen model predictions; predictions do **not** create additional empirical observations.
- Predictions must be timestamped before `experiment.observedAt`.
- Exact empirical duplicates are retained for auditability but receive `fit_weight = 0` in fitting/aggregation views.
- `originPartition` and `currentPartition` are distinct. Pre-provenance legacy runs use `originPartition: null`; no origin is inferred after the fact.
- Existing run files are immutable. Corrections require a new experiment or explicit provenance/exclusion event, never an in-place rewrite.

## Google Sheet mirror

**Resource Coach Experiment Log — v1**

https://docs.google.com/spreadsheets/d/1Sgu5etUVWCmpigbsyA280x33MwnMLW7po9TLU3V4QmI/edit

The Sheet uses normalized tabs matching this schema: Experiments, Observed_Stats, Predictions, Predicted_Stats, Scores, Residuals, Partition_History, Model_Registry, Raw_JSON and Schema_Map.

## Add a run

Export **THIS EXPERIMENT** from the app and save the JSON locally:

```bash
node tools/resource-coach-v2/ingest-experiment.mjs path/to/export.json
node tools/resource-coach-v2/aggregate-experiment-log.mjs
```

The first command validates causal ordering and writes the immutable run. The second produces normalized CSVs and `summary.json` in `calibration/resource-coach-log/generated` by default.

## Corpus-wide longitudinal analysis

The log workflow does **not** evaluate one selected player at a time. Every run in `runs/` is analysed in the same batch against the complete versioned Resource Coach evidence available to the repository.

The automated corpus consists of:

- `calibration/longitudinal-corpus/canonical-corpus-v1.json.gz.b64`, a normalized immutable snapshot of the cleaned event-sourced workbook `Squad_Optimiser_Corpus_Calibration_Transfer_2026-09-12.xlsx` (28 stable players, 38 complete player states, 570 state-stat rows, 23 coach previews);
- every current immutable `resource-coach-experiment-v1` run.

The canonical snapshot is generated from observational sheets only. Derived workbook sheets are not treated as source truth.

Run the same analysis locally against the canonical snapshot:

```bash
node tools/resource-coach-v2/analyse-longitudinal-corpus.mjs \
  --corpus-dir calibration/longitudinal-corpus \
  --runs-dir calibration/resource-coach-log/runs \
  --out-dir /tmp/resource-coach-longitudinal \
  --top-n 20
```

Generated outputs:

- `form_intake.csv` — one normalized row per observed stat for **all** current experiments, including duplicate/fit weight, corpus envelope and strongest comparator metadata ready for metric/form intake.
- `experiment_matches.csv` — ranked granular coach-response comparators across the complete empirical corpus; the similarity value is descriptive retrieval only, not a fitted transfer law.
- `experiment_state_matches.csv` — ranked full-state analogues for every current experiment against all canonical player states. Exact re-observations are distinguished from nearest analogues; nearest matches never assert player identity.
- `state_comparisons.csv` — every unique same-player state pair. Changed states are explicitly labelled non-causal unless a direct transition is evidenced.
- `state_reobservations.csv` — repeated observations of the exact same player state, retained separately so repeated screenshots do not multiply longitudinal deltas.
- `player_longitudinal_profiles.csv` — one row per player identity summarising unique states, reobservations, pair counts, role/tier/age coverage and which dimensions actually vary.
- `corpus_control_pairs.csv` — exhaustive same-stat empirical pairs where zero, one or two tracked covariates differ. Exact single-variable cancellations are labelled explicitly but remain non-causal observations.
- `variable_identifiability.csv` — for each candidate variable, counts exact and near cancellation opportunities and reports whether the current corpus separates that variable or leaves it confounded/unsupported.
- `cohort_metrics.csv` — endpoint-preserving cohort summaries by stat, programme, coach, multiplier, age band, tier and display class.
- `summary.json` — corpus/run counts, cancellation coverage and integrity safeguards.

Low/high preview endpoints stay separate throughout. The analyser never replaces an observed interval with its midpoint, never lets an exact duplicate add empirical fitting weight, and never promotes a merely sequential pair of player states into a causal transition.

State-pair delta signs use observed timestamp order only when both timestamps are available and distinct. Otherwise the analyser uses a stable canonical order and marks the comparison `CANONICAL_NON_TEMPORAL_ORDER`; this prevents source traversal order from being mistaken for chronology. Identifiability labels describe available covariate cancellation only and are not effect estimates.

A covariate must be observed on both sides of a pair before it can count as controlled. Missing/unknown values are listed in `unobserved_variables`; such rows remain useful retrieval evidence but cannot qualify as exact or near cancellation for identifiability.

The GitHub Action uploads both the ordinary experiment-log aggregation and the longitudinal analysis bundle as a workflow artifact, so a new run automatically receives whole-corpus comparison without manually choosing a player or repeatedly invoking analysis per state.

For automated analysis, prefer repository JSON. For manual inspection and collaborative updating, append the same `resource-coach-experiment-v1` export to the Google Sheet. Never make the Sheet the only copy of an experiment.
