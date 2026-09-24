# Backward audit of a trustworthy card-only Resource Coach predictor

Research branch, 24 September 2026. Production code and profiles are unchanged.

## Original result: score the decision separately from the displayed interval

The existing predictor and the shape candidate answer two different questions:
*What interval will the game print?* and *which available coach helps this player most?*
The first remains imperfect. In ten player-specific slates containing 3–5 actually
observed ordinary coach previews, the research shape candidate M** selected a
coach with only **0.05 displayed OVR midpoint regret per player** (maximum 0.5),
versus **0.60** (maximum 6) for selecting the coach with the greatest advertised
multiplier. It correctly ordered **60/61** coach pairs with different displayed
OVR midpoints, and **49/49** pairs whose observed OVR intervals did not overlap;
the largest-multiplier baseline scored 56/61 and 47/49. The mean regret gap is
almost entirely **one LJDark leo slate**: the largest-N selection has 6.0
displayed OVR midpoint regret there, while M** has zero; on the Mirsad Panic
slate M** instead loses by 0.5. The other eight slates have zero regret under
both policies. This sparse difference does not justify a universal decision
claim. OVR observations here
come from the game's separately displayed `ovrBoost`, not reconstructed card
totals. The model's sorting signal is its *predicted* sum of affected gains/15;
it is a ranking proxy, **not** an observed OVR, a guaranteed OVR formula, or a
currency-adjusted recommendation. The ten slates were visible during model
development and pairs within a slate are dependent. This is a prospective
product metric to freeze and test, not a validation claim.

## Reproducible backward comparison

Run from repository root:

```sh
OPENBLAS_NUM_THREADS=1 python tools/resource-coach-v2/trust_policy_20260924.py \
  --output calibration/resource-coach-identification/card-only-trust-results-20260924.json
```

The program refuses a changed 96-preview/341-row/30-player research pool by
checking event-ID SHA-256 `5ef2b6dca18247f37afc1371d0fb4016ee721ee6e51e5759b995b0097452197b`.
For every held-out player it fits each permitted family's free constants on the
other 29 players and then predicts every preview of the excluded player without
using any of that player's observed preview gains. Add `--include-rows` to
write a local complete row audit; the checked-in JSON contains compact metrics.
The family, young-grey
choice, alternative renderers, gates and decision metric were considered after
seeing the pool, so these are **player-disjoint retrospective estimates**, not
a prospective 90% proof. The old locked x59 observations retain their own
pre-registration; do not rewrite the old M* comparison to favor this new
renderer. The program independently replays the deployed V2 cold-start profile
and can emit each predicted and observed row for audit.

`inside` means the midpoint of the predicted interval lies inclusively in the
game's observed `[lo,hi]`; `overlap` means the intervals intersect. A whole
preview succeeds only if **all** its rows succeed. Zero-gain rows are included
in the table below; the three observed `[0,0]` rows are separately reported in
the JSON. Reported model intervals are never widened with a tolerance.

| Player-disjoint model and output | Rows inside | Whole previews inside | Mean absolute midpoint error | Overlap |
| --- | ---: | ---: | ---: | ---: |
| Deployed V2, card only, continuous | 70.7% | 47.9% | 3.836 | 91.8% |
| M1 continuous | 82.7% | 62.5% | 1.730 | 97.9% |
| M* continuous | 85.0% | 63.5% | 1.475 | 98.2% |
| M** continuous | 87.4% | 67.7% | 1.437 | 97.9% |
| M** independently nearest-rounded endpoints | **91.8%** | **77.1%** | **1.42** | **99.7%** |

The final row is a **post hoc challenger**. On the 338 nonzero rows it scores
92.0% inside, but it misses the old ≥75% per-player requirement for LJ Galileo
(13/18 = 72.2%, age 31/T2). The retrospective player-resampled 95% interval
for its pooled inside rate is [87.5%, 95.9%]; it does not account for choosing
this family and renderer after viewing these data. Its two predicted endpoints
are both *exact* for only 10.3% of rows, and both within one visible point for
48.7%. Thus 91.8% midpoint coverage is **not** 90% precise interval rendering.
The frozen x59 20-row subset is 100% inside for M** continuous, while the ten
new control slates are 89.0% continuous and 94.2% after rounding; neither is
a fresh untouched test of this combined candidate.

## Falsifications and opportunities

| Candidate explanation or policy | Result and consequence |
| --- | --- |
| An equal or nearly solved dose plus only a display correction | Shape changes M1→M** improve continuous held-out coverage 82.7→87.4%; rounding alone improves deployed V2 only 70.7→74.8%. Dose is plausibly reusable, but the response shape is not settled. |
| Nearest integer endpoint renderer | M** rises 87.4→91.8% inside; endpoint MAE slightly improves 1.548→1.506 and overlap rises 97.9→99.7%. Suggestive, not unique proof. |
| Floor both endpoints | **92.4%** midpoint coverage, greater than nearest, but worse endpoint MAE (~1.597) and overlap (~98.8%). This falsifies midpoint coverage as a sufficient optimisation target. |
| Round and collapse only the midpoint | **94.1%** midpoint coverage, but endpoint MAE ~5.15 and overlap ~94.1%; an invalid uncertainty representation. |
| Average M* and M** | Midpoint MAE improves 1.437→1.415 while inside falls 87.4→85.3%; a point-loss win can be a range-loss defeat. |
| Gate by model agreement | Selecting the half of previews with least M1/M*/M** disagreement gives only 81.0% row coverage and 56.2% whole-preview coverage. Shared misspecification makes consensus a bad trust score. |
| Gate by *minimum native predicted interval width* across a preview | Retaining the widest 77/96 previews (268 rows) yields 91.4% raw inside and 77.9% whole previews; retaining 48/96 (151 rows) gives 97.4% and 91.7%. Thresholds and selection were examined after outcomes, and selection favors easy high-dose cases; this cannot be labeled universal accuracy. |
| Historical out-of-regime cases | The 37 separately quarantined HIST rows score ~2.7% inside under full-fit M**. Some have state/tier provenance errors or different season/level. A truthful compatibility gate is necessary; these rows cannot be silently pooled or treated as modern ordinary previews. |

The observation of fractional 1.35% condition drain displayed as integer −1%
or −2%, the long repeated-drill experiment, and Personal Trainer's nearly
60-point interior four-OVR steps establish that *some* subsystems accumulate or
render fractional quantities. They do **not** establish a shared Resource Coach
dose law or uniquely select floor, nearest, carry, stochastic allocation, or
the 180 endpoint regime. Previous research on the ordered drill records found
no drill-derived response transfer that improved the blind coach controls;
the older studies remain in their own files. An honest coach forecast can use a
fractional latent response followed by a separately tested renderer without
asserting identical training formulas.

## The path to a trusted production level

1. Keep the existing production boundary and its explicit unsupported-state
   abstention. Put M** plus independent nearest rounding on the **research**
   branch as the exact frozen challenger; use only pre-preview card values,
   official affected-stat list, position/chips, tier, age, and advertised dose.
   Never calibrate from a target preview. Show the full forecast interval and a
   separately labeled coach ranking or observed price/boost tradeoff.
2. Score the challenger on **at least 150 newly recorded nonzero rows in about
   40 previews**, with >=4 new players and the age composition in the standing
   shape preregistration, ideally >=12 new players. Freeze every card-state
   prediction before revealing any preview and compare current deployed cold
   V2, M*, raw M**, nearest M**, floor M**, and largest-N coach choice.
   Audit `[0,0]`, true printed endpoints, visible OVR and credit price
   separately. Preserve the old preregistered *continuous* metric.
3. Require pooled nearest-rendered midpoint inside >=90%, overlap >=98%,
   preview-cluster bootstrap 95% lower bound >=80%, and each player with >=8
   rows >=75% inside and mean relative bias <=8%. Report complete-preview and
   endpoint errors as guardrails even if a pooled score passes. Independently
   test whether the candidate lowers OVR ranking regret relative to N at equal
   or explicitly price-adjusted costs. A high pooled rate with systematic
   old-player or narrow-preview failure is not a universal player promise.
4. If the unfiltered prospective claim fails but a *frozen*, card-only
   minimum-width gate succeeds with enough retained previews and no per-player
   violation, label its **conditional** coverage and publish its abstention
   rate. Never report conditional coverage as coverage of all players.

The smallest immediate falsifier is one previously unseen **31-year-old T2
outfielder** with complete same-state card/role/tier/club-level metadata and
four ordinary coach previews spanning small and large N/p, before any training.
Commit all model and renderer predictions before opening previews. Capture all
printed stat endpoints, separately displayed OVR boosts and credit costs. This
tests the one observed player failure, age/shape transfer, renderer floor versus
nearest, and whether card-only coach ranking is useful. A single player cannot
establish the 90% population claim; the larger registration specifies that gate.

## Provenance and limits

Primary inputs are `shape_models.py`'s quality-filtered pool and control
observations, `shape-models-20260924.json`, the frozen tests, the current V2
profile and its code, `STRUCTURE_AUDIT_20260924.md`, `PRINCIPIA`, the separate
drill/coach research branch, the six `/Susan's desk/` research documents, and
the connected Resource Coach experiment sheet. The sheet currently contains
only a few rows and cannot substitute for the on-repo quality-filtered corpus;
one Gilmartin preview has a 252/253 starting-Passing mismatch and is excluded.
Its `Residuals` tab marks that excluded row with fit weight 1 while the
`Scores` tab uses 0; the repository collector reads the observation tabs, so
this discrepancy is a data-quality warning rather than evidence of fit
contamination. Old archived tier pairings and the distinct Reward coach regime
remain out of scope. No in-game coach was purchased in this research.
