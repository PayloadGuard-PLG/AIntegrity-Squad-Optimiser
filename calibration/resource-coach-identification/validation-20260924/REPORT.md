# Ordinary Resource Coach: independent validation, 24 September 2026

Research only. Repo input: PR #157 head `b7df869ddad595e075c323b52f728d1c0cfd539d`, stacked on open PR #156. The answer key is the game's **displayed preview intervals**, not measured gains after applying a coach. This replay independently evaluates recorded ranges; the original screenshot pixels were not present in the accessed repository or Drive log, so the screenshot references are provenance claims pending image inspection. Neither previous assistant predictions nor frozen model output are scored as truth.

## Exact sample and method

The PR #157 primary slice comprises 15 ordinary coach preview events in **six player states**: Howden (2 events, 16 affected rows), Ripley (2, 16), McCluskey (4, 20), Galileo (2, 16), Rodger (3, 7), Ferguson (2, 5). These are 80 observed stat rows, rotated to 127 directed anchor-to-target predictions (26 event pairs). Twenty-two archive/chat events have screenshot or conversation references; seven singletons cannot enter leave-one-coach-out scoring. Each target is a different event with the same recorded player/state key; no target outcome enters the fitted anchor amplitude. The `CUR-20260910-*` state keys span events from 11–12 September, and equality of keys is weaker than pixel verification of a still-identical player state. Shared starting stats/classes do not contradict those keys, but do not prove every unshared stat stayed fixed.

The archived September 13 data has 130 ordinary rows with known class, but its own metadata calls it a **secondary transcription, not verified pixels**. Its screenshot filename or text reference is treated by PR #157 as a direct-screenshot grade. The chat file has 12 ordinary observed rows in four events, of which only Ferguson's two events form a pair; frozen predictions/point fields are ignored. The clean canonical workbook produces 37 eligible ordinary rows in seven events, but only Scott Ritchie's two events form a pair (10 directed predictions); it is scored separately. Reward is excluded. The two duplicated September 22 log entries have an inconsistent Passing baseline (252 versus preview 253), and canonical PRV-0017–0020 have provenance conflicts. PRV-0022 is a duplicate. Those rows are excluded from the clean comparisons; a conflict-included sensitivity is reported below. Canonical training-camp rows with transfer class `training_camp` do not satisfy the ordinary transfer-class rule, matching PR #157's ingestion.

The primary evidence has only T0/T2/T3 and ages 19/21/23/28/31. No eligible 26–27, 29–30, or 32+ state, and no validated repeated Reward event, enters this score. The only eligible Skill Seminar state is Ferguson. There is no eligible same-state Standard versus Focused comparison that isolates coach shape with the same family, multiplier, affected stat and p.

## Reproduced model

For WHITE, `u = s - Δ(T)` with Δ(T0..T6) = `[0,10,30,50,80,120,160]`; for MID_GREY, `u = s`. The threshold `h` is 132.6 (WHITE) or 120.1 (MID_GREY). Marginal cost is flat below `h` and `exp((u-h)/K)` above it with `K=26.05`. An input budget `B` moves the latent coordinate by

```
J(u,B) = B                                      if u<h and B<=h-u
       = h-u + K log(1+(B-(h-u))/K)             if u<h and B>h-u
       = K log(1+B/(K exp((u-h)/K)))             if u>=h.
g(u,B) = max(0,u+J(u,B)) - max(0,u).
```

The lower and upper budgets are `B_lo=C_P A(a) N/p` and `B_hi=1.529 B_lo`; age bands are 8 (17–21), 6 (22–25), 4 (26–29), 2 (30–31), 1 (32+). One anchor event gives one `C_P`: invert each anchor stat against both observed endpoints by squared error, average its implied lower budgets, then divide by `A(a)N/p`. No other quantity is fitted in any ablation. The model produces continuous endpoints; metrics use those endpoints without rounding to displayed integers. IoU is intersection length / enclosing union length. Endpoint MAE averages the absolute low and high errors. Positive signed residual means predicted midpoint is high.

## Results

| Evidence / sensitivity | Directed stats | States | Midpoint MAE | Inside observed | Interval overlap | Endpoint MAE | Mean IoU | Signed residual |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Referenced screenshot/chat primary | 127 | 6 | 2.304 | 94.5% | 100% | 2.556 | .693 | +.596 |
| Exclude same coach ×106/×114 close transfers | 63 | 3 | 2.610 | 92.1% | 100% | 2.644 | .653 | +.229 |
| Same programme family anchor and target | 78 | 5 | 1.700 | 96.2% | 100% | 2.089 | .755 | +.435 |
| Canonical clean Scott Ritchie pair | 10 | 1 | 13.900 | 20% | 40% | 14.232 | .188 | −2.178 |
| Canonical including disputed PRV-0017–0020 | 54 | 5 | 7.811 | 27.8% | 64.8% | 7.977 | .250 | −.572 |

PR #157's 127 / 94.5% / 100% headline reproduces to numerical precision. **Ninety-six of 127** scores target Extensive Safeguard, and **64** are direct same-coach ×106↔×114 close transfers. A player-weighted mean midpoint MAE is 3.465 and mean player inside rate is 86.4%, rather than the pooled 2.304 / 94.5%. Within 76 predictions sharing a stat with the anchor, blindly copying its observed midpoint gives MAE 5.987 versus the model's 1.910; a response to dose is useful. The global `C=1.324` ablation scores MAE **1.609** on these same 127 targets, better than fitted `C_P` at 2.304, though its inside rate is slightly lower (92.9% versus 94.5%). The global value was already fitted in earlier research and is not an independent prospective baseline.

| Player | n | Midpoint MAE | Inside | Signed residual | Mean IoU |
|---|---:|---:|---:|---:|---:|
| Willie Howden | 16 | .703 | 100% | −.08 | .80 |
| Lt Ripley | 16 | .958 | 100% | −.25 | .85 |
| Garry McCluskey | 60 | 1.343 | 98.3% | −.07 | .76 |
| Ryan Rodger | 14 | 4.183 | 92.9% | −.34 | .53 |
| LJ Galileo | 16 | 5.352 | 87.5% | +3.84 | .47 |
| Willie Ferguson | 5 | 8.249 | 40% | +5.64 | .24 |

By target family: Drill Session 98 rows, MAE 1.60, 98.0% inside, signed −.06; Training Camp 24 rows, MAE 3.94, 91.7% inside, signed +2.22; Skill Seminar 5 rows, MAE 8.25, 40% inside, signed +5.64. By class: WHITE 112 rows, MAE 2.11, 95.5% inside; MID_GREY 15 rows, MAE 3.77, 86.7% inside. All further age, tier, N, p, stat, coach and source detail is in `validation.json` and `predictions.csv`; these strata are strongly confounded by player and coach mix.

## Fixed-component ablations

Every row below changes just the named component while recalibrating the **one anchor amplitude** with the alternative response. No threshold, slope, shape factor or second parameter is refitted. Thus a large deterioration establishes dependence on the fixed profile, not unique recovery of a source-game constant.

| Profile | Midpoint MAE | Inside | Endpoint MAE | Mean IoU |
|---|---:|---:|---:|---:|
| Current | 2.304 | 94.5% | 2.556 | .693 |
| No WHITE tier subtraction | 8.098 | 61.4% | 8.310 | .440 |
| One shared WHITE/GREY threshold (126.35) | 4.428 | 79.5% | 4.501 | .570 |
| No age scaling | **2.304** | **94.5%** | **2.556** | **.693** |
| No N dependence | 15.485 | 48.0% | 15.499 | .350 |
| No p allocation | 14.562 | 55.1% | 14.807 | .412 |
| N^1.4 in place of N | 6.850 | 52.0% | 7.085 | .426 |
| p^.75 in denominator | 5.036 | 59.8% | 5.281 | .475 |
| Linear response | 23.402 | 19.7% | 24.454 | .145 |
| Smooth exponential from all starting coordinates | 11.331 | 55.1% | 11.557 | .361 |
| No visible-gain rectification | **2.304** | **94.5%** | **2.556** | **.693** |
| Fixed global amplitude 1.324 | **1.609** | 92.9% | **1.784** | **.757** |
| Upper/lower budget ratio 1 instead of 1.529 | 2.382 | 91.3% | 6.971 | 0 |
| K=47 | 6.986 | 54.3% | 7.237 | .428 |
| h WHITE/GREY = 135/120 | 2.429 | 91.3% | 2.663 | .686 |

Age scaling cancels *algebraically* under state-local calibration: `C_P = B_anchor/(A(a)N_anchor/p_anchor)` and so `B_target = B_anchor (N_target/p_target)/(N_anchor/p_anchor)` for the same age. This experiment contains **zero information** about the age law. Rectification is inactive on all tested rows and is likewise unidentifiable here. Tier subtraction changes the fit, but `s−Δ(T)−h` means a tier-dependent threshold shift can mimic the same coordinate on tested WHITE rows. Exact Δ and h are not separately identified. The flat/exponential family is strongly preferred over the two fixed alternatives tested; this does not identify its exact breakpoint or K. A rho of 1 collapses intervals to points and cannot match widths, but does not uniquely determine 1.529. N and p scaling matter in fixed ablations, while the decisive unequal-p and widely different-N comparisons mix coaches and families; the exact powers remain conditional.

## Failure and provenance analysis

Ferguson's Focused Defending ×20/p1 anchor implies `C_P≈1.660`; his Standard Attacking ×33/p4 anchor implies `≈1.295` for the same state. The Focused→Standard direction misses three of four target midpoints above the displayed ranges (Crossing, Finishing, Passing); Standard→Focused predicts Positioning midpoint inside but 6.52 below observed centre. Shape, programme dose, per-stat allocation and response can each contribute; two unmatched coaches cannot distinguish them. Galileo's two Extensive anchors imply similar amplitudes (1.569/1.580), but even their **own anchor fit** has endpoint MAE 5.12/5.60, a warning that a shared budget across affected stats is incomplete. Scott Ritchie's canonical physical→defending and reverse directions have large opposing per-stat residuals (up to about 29 points), suggesting allocation or state/class/provenance error rather than a single amplitude adjustment.

There is suggestive positive residual on Standard Attacking targets (+5.74, n=10) and on Crossing (+6.12, n=3), but these are few correlated observations. Focused versus Standard is not isolated, and no role change is tested within an exact player state. The ×106 event for Galileo is labelled Training Camp while his ×114 event is labelled Drill Session despite an identical coach label; this is a family classification question to resolve from screenshots before fitting family coefficients. The archived source carries references such as `62326.png` and `chat_upload:62336.png`, not image bytes. The Drive experiment log supplies only two excluded September 22 experiments and repeats the Ferguson conversation-transcribed results. The canonical source workbook has contradictory source labels on PRV-0017–0020; forcing them into the clean result would hide that dispute.

## What the mathematics is missing

The **shared equal budget within one preview fails on some states even before transferring coaches**. In Galileo's ×106 eight-stat preview, inverse lower budgets under the current curve range from 36.3 to 64.9 (coefficient of variation .229); his ×114 preview reproduces this pattern (39.5 to 68.9; coefficient .225). Low-coordinate WHITE stats require about 37 units, Positioning 167 (transformed 137) about 48, and Heading 209 (transformed 179) about 65. Darren Moore's single ×23 Skill Seminar card also has high within-card spread (coefficient .298). A single event amplitude cannot repair a within-card response mismatch.

As a held-out alternative, infer **each stat's budget from the anchor card**, then transfer that stat's budget with `(N_target/p_target)/(N_anchor/p_anchor)` to another coach on the same player state. On the 76 predictions whose stat and starting value appear in both events, this lowers midpoint MAE from 1.910 to **.702** and endpoint MAE from 2.307 to **1.174**. On Galileo alone (16 directed stat predictions), midpoint MAE falls from 5.352 to **.325**. This demonstrates a repeatable stat-level pattern across the two recorded previews. It does **not** identify a true stat allocation coefficient: the anchor adjustment can equally compensate for the wrong response curve at high transformed values. It also covers only shared stats and is dominated by close ×106/×114 transfers.

There is a concrete curve alternative. Keeping Galileo's low-stat lower budget near 37, the fixed `K=26.05` predicts his Heading about +5.6–8.1 versus observed +9–13; `K=35` predicts about +8.7–12.5. His implied within-card budget variation drops from .229 to approximately .027 at `K=35`, and his two-coach midpoint MAE drops from 5.35 to .67. Yet holding all other parameters fixed and using `K=35` across the full six-state slice **worsens** pooled MAE from 2.30 to 3.54. `K=30` produces pooled MAE 2.32, Galileo 2.77, Ferguson 4.00. These K comparisons are retrospective diagnostics, not a newly validated slope. Galileo and Ripley are both recorded T2, and shifting the shared T2 offset from 30 to 40 helps Galileo (5.35→2.08 MAE) but hurts Ripley (.96→7.94). The missing term may therefore be player/role/stat response geometry, another tier coordinate, or an unresolved state/class transcription; the current sample cannot distinguish them.

Ferguson's same-state `C_P≈1.660` from Focused Skill ×20/p1 versus `≈1.295` from Standard Skill ×33/p4 is also incompatible with a universal event dose under the fixed curve. The p=1 case removes within-preview allocation as an explanation *for that anchor*, but a different stat, p, N and coach shape all change together between events. A family/shape-specific generator or a different p law remains viable. The static age law cannot explain this within-state discrepancy because age is identical, and algebraically cancels during this replay. The effective endpoint ratio also varies across cards, so a separate interval renderer remains a candidate, although fitting two independent endpoint budgets from an anchor barely improves this primary set's endpoint MAE (2.556→2.547) and slightly worsens its midpoint MAE (2.304→2.335). Do not add an arbitrary global interval-width parameter on this evidence.

**Judgment:** The fixed candidate is a useful interpolation for several September 12 ordinary previews, especially near-multiplier Drill comparisons. The available evidence does **not** establish a general predictive law across programme families, ages, tier coordinates, or coach shapes. It does not support promotion into the app. The strongest live alternatives are a simpler global-amplitude response, family/shape-dependent dose, stat-specific allocation, and a separately calibrated preview renderer; none has been prospectively distinguished on clean matched controls. Preserve the current research profile, reconcile screenshot pixels and state histories, then run truly locked same-state tests across N, p, family and shape.

## Reproduction

Run `python tools/resource-coach-v2/independent_validation_20260924.py OUTDIR` on this branch (Python standard library only). `validation.json` records profile, event inventory, exclusions, grouped metrics and ablations; CSV files give every target and residual, including the separate canonical sensitivity. No app, UI, database or production coach logic was changed.

Source records: [PR #157](https://github.com/PayloadGuard-PLG/AIntegrity-Squad-Optimiser/pull/157) and its `archived-preview-rows-v1.json`, `chat-locked-tests-20260923.json`, canonical compressed corpus, exclusions and fixed profile; [PR #156](https://github.com/PayloadGuard-PLG/AIntegrity-Squad-Optimiser/pull/156) is its stacked base. Drive's [Resource Coach Experiment Log](https://docs.google.com/spreadsheets/d/1Sgu5etUVWCmpigbsyA280x33MwnMLW7po9TLU3V4QmI/edit) confirms the two September 22 exclusions and reproduces the conversation-transcribed prospective rows. [PRINCIPIA IV](https://docs.google.com/document/d/1Uq6YzynV9hCQbcpIOWqGC7B04QRIx84bn4jjmIlLCqk/edit) explicitly labels thresholds and age as provisional; its later [observation log](https://docs.google.com/document/d/1GT2AyyUGBUrFkop9pbPkLRnNISoYEe-IX1zI-EWLNf0/edit) is a prior interpretation, not an answer key. The attached 13 September `Resource_Coach_Predictor_Followup.zip`, repomix snapshot and PDF contain older model fitting/source material; they add no new 24 September raw outcomes to this replay.
