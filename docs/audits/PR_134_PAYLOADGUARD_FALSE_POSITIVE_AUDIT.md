# PR #134 — PayloadGuard false-positive and merge-readiness audit

Date: 2026-09-13

PR: #134 `Implement experimental resource-coach v2 predictions and offline calibration testing`

Audited head before this document commit: `df3e0ed4e7b5390bba79257720273b6808ad1dab`

Base: `main` at `d74037edc1103b2495b15fedbc6242ce2ab656e8`

PayloadGuard action pin used by this repository: `PayloadGuard-PLG/payload-consequence-analyser@d8435494e71ee713a7c7d4160bae182e14aef399` (`analyze.py` reports v1.1.0).

## Executive finding

PayloadGuard's `DESTRUCTIVE [CRITICAL]` result on PR #134 is a **false positive produced by two coupled classifier errors**:

1. Layer 4 treats intentional removal/replacement of named AST nodes in `app/(tabs)/coaches.tsx` as catastrophic structural deletion without reconciling the replacement architecture introduced by the same PR.
2. Layer 5b then treats the substring `docs` anywhere in the PR description as a claim that the PR is documentation-only/benign. Because Layer 4 has already incorrectly supplied `CRITICAL`, Layer 5b escalates the same underlying false premise to `DECEPTIVE_PAYLOAD`.

These are not two independent corroborating signals. Layer 5b is causally dependent on Layer 4's severity and therefore amplifies one false positive.

However, **PR #134 is not ready for approval yet**. The audit found two independent implementation blockers that are real and must be corrected before merge:

- the new `resource-coach-v2` Actions job is indented under `on:` rather than `jobs:` in `.github/workflows/proofs.yml`, so the Engine Proofs workflow is invalid/non-runnable for this PR head;
- runtime SQLite foreign-key enforcement is not explicitly enabled, while the new persistence design relies on foreign keys and the tests enable them manually. The production connection therefore does not currently prove the same integrity contract as the test database.

A third repository-level PayloadGuard issue is also confirmed: the composite action captures analyzer exit code `2` under `set +e` but never exits non-zero afterward. Consequently the GitHub `payloadguard` job can conclude **success** while reporting `DESTRUCTIVE`. The PR run demonstrates exactly this state.

---

## 1. Reproduction of the PayloadGuard result

Workflow run `34775947079`, job `103773952858` reported:

- 17 changed files;
- 12 added, 0 deleted, 5 modified;
- +1,160 / -286 lines, net +874;
- branch age 0 days;
- Layer 4: `CRITICAL`, `app/(tabs)/coaches.tsx`, 19 named nodes removed, 27.14% structural deletion ratio;
- Layer 5b: `DECEPTIVE_PAYLOAD`, matched keyword `docs`;
- analyzer exit code `2` (`DESTRUCTIVE`).

The Actions job itself nevertheless concluded `success`.

The `update` job was skipped because the workflow is running on `pull_request` and that job is explicitly `if: github.event_name == 'push'`. Its skipped state is not evidence that PayloadGuard blocked deployment.

## 2. False positive FP-134-L4: replacement architecture counted as destructive deletion

At the pinned action SHA, `StructuralPayloadAnalyzer.analyze_structural_drift()` computes:

```python
original_nodes = self._extract_core_nodes(self.original_code)
modified_nodes = self._extract_core_nodes(self.modified_code)
deleted_nodes = original_nodes - modified_nodes
added_nodes = modified_nodes - original_nodes

deletion_ratio = len(deleted_nodes) / len(original_nodes) if original_nodes else 0

is_destructive = (
    deletion_ratio > self.deletion_ratio_threshold
    and len(deleted_nodes) >= self.min_deletion_count
)
```

Default thresholds are 20% and 3 nodes.

For `coaches.tsx`, PayloadGuard observed 19 deleted nodes at 27.14%, which implies 70 original named nodes. The gate therefore fires mechanically even though `added_nodes` is computed and then not used to determine whether the deletion represents capability loss, responsibility transfer, extraction, or intentional safety removal.

The report lists removed nodes including:

- `ProjectionResult`
- `RewardPreviewResult`
- `StatGain`
- `TALENT_LABEL`
- `[focusedStatSel, setFocusedStatSel]`
- `[result, setResult]`
- `[rewardPreviewResult, setRewardPreviewResult]`
- `[saveConfirmed, setSaveConfirmed]`
- `applyGains`
- `canProject`

In this PR those removals are part of an explicit replacement:

- `ResourceCoachLab` is added and mounted from `coaches.tsx`;
- the old single-value/session-decay projection path is removed;
- `src/logic/resourceCoachV2.ts` adds the interval model;
- `src/services/resourceCoachStore.ts` adds separate prediction/observation/calibration persistence;
- `src/db/resourceCoachSchema.ts` and `drizzle/001_resource_coach_v2.sql` add an evidence schema;
- `applyGains` / `applyAndSnapshot` are deliberately removed from this experimental predictor so forecast ranges cannot overwrite player facts;
- regression tests explicitly assert that this writeback path is absent.

This is a high-impact architectural change and deserves review, but the Layer 4 predicate cannot distinguish **architectural replacement** from **architectural destruction**. For this diff, `DESTRUCTIVE` is therefore not supported by the Layer 4 evidence alone.

### Required PayloadGuard architectural improvement

Layer 4 should retain the conservative deletion detector but add a replacement/capability-loss phase before promoting to `DESTRUCTIVE`. At minimum, the analyzer should record and reason over:

- deleted named nodes;
- added named nodes in the same file;
- imported replacement components introduced in the same hunk;
- new files referenced by those imports;
- call-site continuity (old handler removed but replacement component/function invoked);
- whole-file deletion versus modification;
- net churn and deleted-file count;
- deletion of safety/security/validation semantics as a distinct signal.

A replacement-aware downgrade must not simply cancel `N` deletions with `N` additions; that would be easy to evade with decoy nodes. The correct question is whether externally reachable responsibility/capability disappeared, moved, or was intentionally prohibited. Ambiguous replacements should become `REVIEW`, not automatically `SAFE`.

PR #134 should become a regression fixture: a large UI/domain extraction that removes >20% named nodes while preserving/replacing functionality must not be classified as catastrophic solely from raw node-name set subtraction.

## 3. False positive FP-134-L5B: `docs` substring creates a fabricated benign claim

At the pinned action SHA, `SemanticTransparencyAnalyzer.DEFAULT_BENIGN_KEYWORDS` contains:

```python
"minor fix", "minor syntax fix", "typo", "formatting", "cleanup", "docs",
"refactor whitespace", "small tweak", "cosmetic", "minor update"
```

The matcher is:

```python
matched_keyword = next(
    (kw for kw in self.benign_keywords if kw in self.pr_description), None
)
claims_benign = matched_keyword is not None
is_deceptive = claims_benign and self.actual_severity == "CRITICAL"
```

PR #134 contains `docs/RESOURCE_COACH_V2_TESTING.md` in the sentence pointing reviewers to testing instructions. The substring `docs` therefore becomes a synthetic assertion that the entire PR is benign/documentation-only.

That interpretation is contradicted by the PR description itself, which explicitly states that it replaces the Coaches projection UI, adds a two-regime interval model, adds SQLite tables, changes targeting, removes writeback, and adds a new CI job. The description is macro-scope and unusually explicit about architectural change.

Layer 5b then receives `CRITICAL` from the Layer 4 false positive and emits:

`DECEPTIVE_PAYLOAD — PR description deliberately contradicts catastrophic architectural changes.`

This is a **cascading false positive**. The semantic layer supplies no independent evidence of deception.

### Required PayloadGuard architectural improvement

- Never treat a path token such as `docs/...` as a scope claim.
- If documentation language is retained as a low-scope feature, require an explicit claim such as `docs only`, `documentation-only`, or equivalent sentence-level intent.
- Tokenize/parse claims rather than substring-searching the complete PR body.
- Track signal provenance/dependency. A semantic escalation whose `actual_severity` is derived solely from one structural signal must not be presented as independent corroboration.
- Avoid intent attribution such as `deliberately contradicts` unless deliberate concealment is actually evidenced. The safe output is `description/diff scope mismatch`.

PayloadGuard main has already moved beyond the v1.1.0 keyword-only design to a PR-MCI semantic model, but this repository remains pinned to the old SHA. Updating the pin should be evaluated after a regression run; it should not be treated as a substitute for fixing the structural replacement problem.

## 4. PayloadGuard gating defect: `DESTRUCTIVE` still gives a green job

The pinned `action.yml` runs the analyzer under `set +e`, records `$?`, exposes it as an output, but never re-emits the non-zero exit status:

```bash
set +e
python ...
EXIT=$?
echo "exit_code=$EXIT" >> "$GITHUB_OUTPUT"
...
```

There is no terminal `exit "$EXIT"` or equivalent failure step.

The current PayloadGuard main action retains the same pattern. Unless a separately configured Check Run is used and made required, a workflow that merely `uses:` the action can be green even when PayloadGuard reports `DESTRUCTIVE`.

PR #134 proves the defect operationally: analyzer exit `2`, job conclusion `success`.

A scanner whose core contract is “block destructive diffs pre-merge” should provide an explicit enforcement mode, for example:

```yaml
with:
  fail-on: destructive
```

and then terminate the composite action non-zero after report/comment/check-run publication when the configured threshold is met. Reporting and enforcement should be distinct documented modes so consumers can choose audit-only versus merge-gating behavior without ambiguity.

## 5. Real PR blocker B-134-01: Engine Proofs workflow is malformed

PR #134 adds this block before the existing `jobs:` key:

```yaml
on:
  pull_request:
    branches:
      - main
  workflow_dispatch:
    ...

  resource-coach-v2:
    runs-on: ubuntu-latest
    steps:
      ...

jobs:
  ts-suite:
    ...
```

`resource-coach-v2` is therefore nested beneath `on:` rather than beneath `jobs:`. It is not a job definition in the workflow graph.

The PR head has no `Engine Proofs` workflow run even though the PR targets `main`, consistent with the modified workflow not being accepted/scheduled as intended.

### Required correction

Move the block beneath `jobs:`:

```yaml
jobs:
  resource-coach-v2:
    runs-on: ubuntu-latest
    steps:
      ...

  ts-suite:
    ...
```

After correction, require a fresh PR run and confirm all existing jobs plus `resource-coach-v2` execute from the new head SHA.

## 6. Real PR blocker B-134-02: test DB enables foreign keys; production DB does not

`tests/resource-coach-v2-test.ts` creates its in-memory database with:

```ts
raw.exec('PRAGMA foreign_keys=ON; ...');
```

The test then verifies `PRAGMA foreign_key_check` and confirms orphan OVR inserts fail.

Production opens the Expo database in `src/db/index.ts` with:

```ts
export const expoDb = openDatabaseSync('squadoptimiser.db', {
  enableChangeListener: true
});
```

No repository code currently enables `PRAGMA foreign_keys = ON` on that connection.

The new schema relies on foreign keys for at least:

- prediction → model version;
- observation rows → unique preview parent;
- OVR observation → unique preview parent;
- player calibration → model version.

Expo's SQLite documentation shows foreign-key enforcement being explicitly enabled with `PRAGMA foreign_keys = ON`; it should not be assumed from table declarations alone.

The production contract must match the test contract. Prefer enabling the pragma once immediately after opening the native connection, or before any transaction in the resource-coach store. Do **not** attempt to enable it from inside an already-open transaction: SQLite foreign-key mode changes are not effective in the middle of a transaction.

A useful regression assertion is to query `PRAGMA foreign_keys` through the production-compatible store adapter and require `1` before schema writes occur.

## 7. PR #134 code audit — positive findings

Subject to the two blockers above, the core change is internally coherent:

- no files are deleted;
- the diff is net additive (+874 lines);
- Reward and unresolved transfer classes abstain from numeric prediction;
- the manual Training Rate classification is not used as a model input;
- predicted intervals are no longer applied to the player card;
- predictions and observed previews are persisted separately;
- the calibration anchor is prevented from scoring itself by an input signature that ignores cosmetic coach renaming/order but includes player state and model coordinates;
- age/tier/state/model-version changes invalidate a stored anchor at prediction time;
- zero-gain observations are preserved but rejected as calibration anchors;
- the OVR parent-key repair is structurally sensible once foreign-key enforcement is guaranteed;
- the analytical TypeScript inverse has an independent synthetic numerical quadrature/Brent reference generator rather than merely testing the implementation against itself;
- the experimental/holdout limitations are stated in the UI/docs rather than represented as an identified exact game law.

These findings support treating the PayloadGuard `DESTRUCTIVE` result as false for this PR. They do **not** override the two real merge blockers.

## 8. Approval decision

**Current decision: DO NOT APPROVE / DO NOT MERGE YET.**

This decision is **not** based on PayloadGuard's destructive classification. That classification is false for the reasons above.

Approval conditions:

1. Move `resource-coach-v2` under `jobs:` in `.github/workflows/proofs.yml`.
2. Explicitly enable and verify SQLite foreign-key enforcement in the native runtime connection before resource-coach persistence transactions.
3. Run the corrected `Engine Proofs` workflow on the resulting PR head and confirm `resource-coach-v2`, `ts-suite`, `z3-crosshair`, `dafny`, and the remaining existing proof jobs execute successfully.
4. Re-run/reassess PayloadGuard. Its current v1.1.0 result should be recorded as a false-positive regression case rather than bypassed silently.
5. Re-audit only the delta from this audited head plus the audit-document commit.

Once those conditions are satisfied, there is no blocker in this audit that inherently prevents approval of the Resource Coach V2 testing architecture.
