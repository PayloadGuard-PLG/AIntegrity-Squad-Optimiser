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

- the immutable historical calibration tree pinned by `LONGITUDINAL_CORPUS_REF` in `.github/workflows/resource-coach-log.yml`;
- current `profiles/calibration_data.json` and `profiles/player_seeds.json` player-state evidence;
- every current immutable `resource-coach-experiment-v1` run.

Run the same analysis locally after materialising those sources:

```bash
node tools/resource-coach-v2/analyse-longitudinal-corpus.mjs \
  --corpus-dir /path/to/materialised-corpus \
  --runs-dir calibration/resource-coach-log/runs \
  --out-dir /tmp/resource-coach-longitudinal \
  --top-n 20
```

Generated outputs:

- `form_intake.csv` — one normalized row per observed stat for **all** current experiments, with corpus envelope and strongest comparator metadata ready for metric/form intake.
- `experiment_matches.csv` — ranked granular comparators across the complete empirical corpus; the similarity value is descriptive retrieval only, not a fitted transfer law.
- `state_comparisons.csv` — every available same-player state pair. Exact re-observations are distinguished from changed states. Changed states are explicitly labelled non-causal unless a direct transition is evidenced.
- `cohort_metrics.csv` — endpoint-preserving cohort summaries by stat, programme, coach, multiplier, age band, tier and display class.
- `summary.json` — corpus/run counts and integrity safeguards.

Low/high preview endpoints stay separate throughout. The analyser never replaces an observed interval with its midpoint, never lets an exact duplicate add empirical fitting weight, and never promotes a merely sequential pair of player states into a causal transition.

The GitHub Action uploads both the ordinary experiment-log aggregation and the longitudinal analysis bundle as a workflow artifact, so a new run automatically receives whole-corpus comparison without manually choosing a player or repeatedly invoking analysis per state.

For automated analysis, prefer repository JSON. For manual inspection and collaborative updating, append the same `resource-coach-experiment-v1` export to the Google Sheet. Never make the Sheet the only copy of an experiment.
