# Said Haggag — 1-on-1 Finishing longitudinal observation (2026-09-24)

This is an **observed-result artifact** for the prospectively frozen Said Haggag control. It does not modify production prediction logic or any previously frozen prediction.

## Evidence inventory

- Google Drive provider items in the experiment/meta window: **163**
- Unique screenshot filenames: **152**
- Provider duplicate copies excluded from canonical counting: **11**
- Full provider manifest: `haggag-image-manifest-20260924.json`
- Canonical structured observation: `haggag-drill-observation-20260924.json`
- Google Sheet: **Resource Coach Experiment Log — v1**
  - `Haggag_Drill_Sequence`
  - `Haggag_Teamplay_Raw`
  - `Haggag_Image_Index`

## Endpoint result

Baseline card:

- OVR 96
- Tackling 82
- Dribbling 102
- Finishing 121

Final card:

- OVR 98
- Tackling 87
- Dribbling 110
- Finishing 129

Therefore the endpoint-visible gain is:

- Tackling **+5**
- Dribbling **+8**
- Finishing **+8**
- total **+21 visible stat points**

Directly rendered, deduplicated training-report gains account for **19** points:

- Tackling +4
- Dribbling +8
- Finishing +7

The endpoint therefore proves **two additional points occurred somewhere in the sequence**: one Tackling point and one Finishing point. Their exact run(s) are **not localized by the evidence**. The blank 14:11:36 report is a candidate observation gap, not proof that both points occurred on that run.

## Condition and recovery ledger

The drill UI independently displays **−1.35%** configured condition drain, consistent with 1.5 × 0.9.

Two explicit Haggag recoveries are recoverable from state transitions:

1. condition 29 → 89, rest inventory 5 → 1: **4 rests consumed**
2. condition 29 → 89, with rest inventory 1 before the transition and 7 afterward while tokens fall 50 → 40:
   - purchase **10 rests**
   - consume **4 rests**
   - 1 + 10 − 4 = 7

Baseline rest inventory was 7 and the first recovery starts at 5, so **two additional rests were consumed earlier**. Their exact action/recipient is not captured and is not assigned speculatively.

Thus:

- total inventory-ledger rest spend: **10**
- directly attributable Haggag recovery spend: **8**
- earlier unresolved spend: **2**

## Teamplay Form observations

Five captured Teamplay Form screenshots preserve 45 raw rows. Across those raw snapshot rows:

- −1%: **28**
- −2%: **17**

These are **not treated as 45 unique runs**, because the snapshots overlap. The raw rows are preserved verbatim in `Haggag_Teamplay_Raw`; minute labels alone are insufficient to deduplicate run identity.

The important directly supported conclusion is narrower: under the fixed −1.35% configuration, the game records individual Teamplay Form condition losses as integer **−1% or −2%**.

## Condition accounting

After the first recovery:

- 89 → 29 = **60 points lost**

After the second recovery:

- 89 → 54 = **35 points lost**

If the pre-sequence condition was 100, the first block is:

- 100 → 29 = **71 points lost**

which gives a total visible loss of **166**. Since 166 / 1.35 = 122.963..., the result is numerically very close to 123 nominal −1.35% runs. That is **suggestive, not a proved run count**, because the screenshot history does not independently enumerate every run.

## Research status

This sequence materially strengthens the observation-layer result:

- fractional configured drain is directly displayed upstream;
- integer −1/−2 per-run condition observations occur downstream;
- visible stat gains are sparse integer events;
- final stat endpoints require two points not localized by rendered gain rows.

It does **not** by itself prove deterministic fractional carry, stochastic quantization, or a specific Resource Coach renderer. Those remain competing mechanisms to test against the frozen coach predictions and subsequent preview evidence.
