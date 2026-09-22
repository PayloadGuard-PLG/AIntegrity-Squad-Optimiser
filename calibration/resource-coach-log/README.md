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

For automated analysis, prefer repository JSON. For manual inspection and collaborative updating, append the same `resource-coach-experiment-v1` export to the Google Sheet. Never make the Sheet the only copy of an experiment.
