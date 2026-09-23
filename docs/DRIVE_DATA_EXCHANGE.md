# GitHub ↔ Google Drive data exchange

This bridge connects the Resource Coach evidence pipeline to the dedicated Google Drive folder **AIntegrity Squad Optimiser Data Exchange**.

## Topology

- `incoming` — source material deliberately placed here for GitHub collection.
- `analysis-output` — non-secret collection receipts written by GitHub Actions.
- `quarantine` — reserved for a later explicit remediation workflow. The initial bridge does **not** move files automatically.

Configuration is pinned in `calibration/drive-data-exchange.json`. Folder IDs are identifiers, not credentials.

GitHub authenticates as:

`aintegrity-drive-ingest@aintegrity-d623c.iam.gserviceaccount.com`

using repository Actions secret:

`GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`

The secret must contain the complete service-account JSON. It is read only by the collection step and is never written to an artifact or log.

## Collection contract

For each item in `incoming`:

1. Inventory immutable Drive metadata: file ID, name, MIME type, size, timestamps and Drive checksum where available.
2. Download only explicitly allow-listed evidence types and enforce the configured per-file byte limit.
3. Compute SHA-256 over the downloaded source bytes before analytical validation.
4. Preserve the downloaded source under the workflow's ephemeral raw-evidence directory.
5. For JSON:
   - `resource-coach-experiment-v1` is passed through the existing immutable `ingest-experiment.mjs` validator.
   - identical existing experiments are idempotent no-ops;
   - the same experiment ID with different content is rejected;
   - unsupported JSON schemas remain raw evidence and are not silently promoted into the experiment log.
6. Non-JSON evidence such as screenshots, CSV/XLSX and ZIP is staged as raw evidence only until a dedicated deterministic extractor exists.
7. Run the complete longitudinal analyser against a temporary run set consisting of the repository's immutable runs plus newly accepted Drive experiments.
8. Upload the provenance bundle as a GitHub Actions artifact.
9. Write a non-secret receipt JSON to Drive `analysis-output`.

## Non-destructive boundary

The initial bridge deliberately does **not**:

- modify repository evidence;
- commit collected files;
- overwrite an immutable experiment;
- delete a Drive source;
- move accepted Drive files;
- move rejected Drive files to quarantine;
- infer missing evidence from role tables or model output.

This lets GitHub and Drive exchange evidence immediately while keeping promotion into the repository behind an explicit review boundary.

## Supported source types

Current allow-list:

- JSON
- CSV
- XLS/XLSX
- PNG
- JPG/JPEG
- WEBP
- ZIP

Only sealed `resource-coach-experiment-v1` JSON is analytically ingested automatically. Other types are retained as provenance-backed raw evidence.

## Operational path

`Drive/incoming → metadata + SHA-256 → validation → temporary immutable run set → corpus-wide longitudinal analysis → GitHub artifact + Drive receipt`

A later promotion workflow can convert accepted staged evidence into a reviewable PR rather than committing directly to the calibration branch.
