# Repeated drill and ordinary Resource Coach: cross-system test

24 September 2026. Research branch `research/drill-coach-cross-transfer-20260924`, draft PR #163. No `src/`, `profiles/`, production predictor, frozen prospective predictions, or earlier evidence files were changed.

## Inputs, independence, and reproduction

* Verbatim ordered cells and original Drive image IDs from [Resource Coach Experiment Log — v1](https://docs.google.com/spreadsheets/d/1Sgu5etUVWCmpigbsyA280x33MwnMLW7po9TLU3V4QmI/edit), tabs `Haggag_Drill_Sequence` and `Haggag_Teamplay_Raw`: [raw snapshot](haggag-ordered-raw-20260924.json). The 125 captured rows are in **capture order**; inferred drill-run numbers differ when reports are absent.
* Original Drive card images independently checked: baseline ID `1B48-iSK4IEiDOm6sboFpN4QGzCggZuEZ`; drill/nominal 1.35% ID `1gbqloEJIYRdnbzBuMGO3HtHhUnYAQz5Q`; gap reports HAG-R095/R096 IDs `1DEk2-X3FzYjhEbuJaTkA0h3CtyK50aSv`/`1DSuvOY0SNpFLuhG8vSoTBpT8vv3aKE6r`; final card ID `1UasBctnnK2s0WNE-mkCrcATKyBBUFgQY`. Independently viewed cards agree with the recorded start/end.
* [Analysis code](../../tools/resource-coach-v2/drill_coach_transfer_20260924.py), [CI workflow](../../.github/workflows/drill-coach-transfer-research.yml), [machine scores](drill-coach-cross-transfer-results-20260924.json), [successful run and complete output artifact](https://github.com/PayloadGuard-PLG/AIntegrity-Squad-Optimiser/actions/runs/36036096867). Reproduce with `python tools/resource-coach-v2/drill_coach_transfer_20260924.py --output /tmp/drill-coach-cross-transfer.json` after installing NumPy/SciPy. The runner independently checked the pin of all 96 coach previews / 341 affected-stat rows / 30 players.
* Coach baselines and dose hypotheses come from [PRINCIPIA](../../PRINCIPIA.md), the [structural audit](../resource-coach-identification/STRUCTURE_AUDIT_20260924.md), pinned model fits and prospective ×59 rows. **Neither a target preview nor another preview on its player contributes to its fit or coach-scale estimate**. Shape candidates were selected after existing prospective outcomes were available: their comparisons are player-disjoint retrospective transfer checks, not a new blind prospective success.

## Reconstructed drill behaviour

The one-player, one-drill configuration is 1-on-1 Finishing, EASY, displayed 1.5% × 0.9 = **1.35% condition**. Haggag is age 22, ST, T0 throughout. At the baseline Tackling **82 is GREY**, Dribbling **102** and Finishing **121 are WHITE**. The setup and reports identify all three affected stats; the drill's internal relative allocation remains unknown. Final card: Tackling 87, Dribbling 110, Finishing 129.

| Stat | start → final | class | direct +1 gain positions in inferred minimum run sequence | endpoint gain | reported gains |
|---|---:|---|---|---:|---:|
| Tackling | 82 → 87 | GREY | 1, 53, 83, 114 | 5 | 4 |
| Dribbling | 102 → 110 | WHITE | 9, 22, 35, 50, 66, 80, 97, 112 | 8 | 8 |
| Finishing | 121 → 129 | WHITE | 11, 23, 36, 51, 67, 82, 114 | 8 | 7 |

The two missing reported points are **not located** by the final card. One possible missing Finishing +1 is in the gap after Dribbling at HAG-R095: HAG-R096 has a −3 condition difference, so it is not a single witnessed run. Its location is a hypothesis, not an observed event. The minimum total of 123 runs is reconstructed from condition gaps, not a displayed in-game run counter. Conditional on 100% before the first block, 123 × 1.35 = 166.05 nominal condition points against 166 points shown across three blocks. Independent captured gains cover a large part of this reconstruction.

**New sequence constraint:** all seven *directly observed* Finishing gains occur one or two inferred runs after a Dribbling gain. The Dribbling gaps are 13, 13, 15, 16, 14, 17, 15. For exchangeable independently placed seven Finishing events, the conditional probability of all seven lying in the 16 following positions is 1.61 × 10⁻⁷; preserving the seven-event spacing and circularly shifting gives 1/123 ≈ 0.0081. Both are diagnostics with post-selection/sequence assumptions, not calibrated p-values for the game's mechanism. A shared variable session dose followed by separate stat thresholds naturally generates lagged gain pairs; independent constant-probability per-stat Bernoulli events do not readily generate both pairing and regular intervals. One same-run D/F double event is also recorded.

**Condition positive control and correction to the earlier report:** reading the preserved sheet directly gives 104 candidate individual −1/−2 losses, **69/35**. Excluding the first post-recovery reports R051 (−2) and R098 (−1) gives 102, **68/34**. The inherited summary's 102 = 69/33 and its 2→1 pair count 19 do not follow from that exclusion; retain it as historical analysis, not a verified raw count. Strictly adjacent captured report pairs count 1→1:44, 1→2:17, 2→1:21, 2→2:11. The eleven witnessed 2→2 pairs rule out **one fixed exact-1.35 conserved remainder** with only floor-state differences, whichever two post-recovery reports are omitted. Variable per-run cost, random integer settlement, or another observed-state effect remains possible. The ~35/104 two-loss frequency is consistent with stochastic 0.35 but does not prove independent coin tosses.

### Algebra and interval identification

Represent a possible shared response geometry by a monotonically increasing cost potential `H`. With white-stat latent state `x_j(0)∈[s_j,s_j+1)`, an unobserved session-dose path `Q_t`, and drill allocation `w_j`,

```
H(x_j(t)) − H(x_j(0)) = w_j Q_t;
reported displayed gain = floor(x_j(t)) − floor(x_j(0)).
```

A reported kth gain constrains `w_j Q_t` to cross `H(s_j+k)−H(x_j(0))` between screenshots; an unchanged integer restricts it below the next threshold. These *differences of absolute rendered states* explicitly test `R(s+d)−R(s)`, rather than taking `R(d)` as a physical law. The full-card endpoint adds `max_j H(s_j+8)−H(x_j(0)) ≤ w_j Q_final < min_j H(s_j+9)−H(x_j(0))` for the two white stats, with suitable allocation weights. For a single stat and monotone potential, unknown fractional phases mean endpoints constrain an effective gain only to approximately `(visible gain−1, visible gain+1)` in point units.

Three-stat equal fractional per-run gain is impossible at this resolution: Tackling's endpoint +5 requires effective point movement approximately in (4,6), and Dribbling/Finishing +8 require (7,9); intervals do not meet. This **does not** isolate a value curve from grey-versus-white drill weighting. Equal WHITE dose with constant increment and constant carry is falsified for Dribbling because it permits only two neighbouring integer inter-gain gaps, not 13–17. Equal WHITE *cumulative* dose with changing increments and separate carried thresholds remains possible.

A grid of start phases and monotone shared cumulative doses uses `H(x)=x` up to threshold `h`, then `h+K(exp((x−h)/K)−1)`; the Finishing/Dribbling drill-allocation ratio α is either fixed at one or scanned. This is an **existence test, not a fitted drill response or proof of the curve**:

| White response geometry | α=1 feasible in 0.025 phase grid? | What changes if drill allocation differs? |
|---|---|---|
| Flat for the observed values | yes; missed F ordinal 7 | near-equal weights are needed |
| Early transition h=100, K=70 | no | α≈1.2 or 1.4 has feasible phases |
| Middle transition h=120, K=35 | narrowly; missing F ordinal 1 and start phase near integer ceiling | α≈1.2 broadens feasible phases |
| Late transition h=130, K=35 | yes; missed F ordinal 7 | near-equal weights are needed |

A variable-dose deterministic carry and a **correlated** stochastic stat allocation around structured expected dose cannot yet be separated. Missing gain events, arbitrary time-varying drill dose and unknown within-drill weights limit inference. The nominal condition control establishes a fractional configured quantity and discrete displayed losses; it **does not** establish the same settlement rule or response curve for stats and coaches. Lurinsky Personal Trainer interior totals +60 per +4 OVR show nearly conserved 15-stat allocation with discrete per-stat jumps; the +46 final 176→180 transition may be endpoint/cap construction and is quarantined from interior response fitting. No identification of a Resource Coach rule follows from that distinct subsystem.

## Transfer test: separate coach dose, shared trial geometry

For the coach comparison use its own age-dependent `B_lo=C A(age)N/p` and `B_hi=ρB_lo`, its WHITE tier coordinate `u=s−Δ(T)` and separate MID_GREY response. A shared-scale transfer tests `g=H^{-1}(H(u)+λB)−u` with **only λ fitted on other players**, and changes only WHITE `H`; grey stays the current coach baseline because the drill cannot identify its grey curve. The surviving ordinary dose form `N/p` is supported by controls but is a **hypothesis**, not an established game law; old `N−1` assertions were prospectively falsified. Point-by-point marginal costing versus continuous integration and endpoint rounding remain underdetermined by one-point gains, and one-step floor/ceil of current coach predictions only supports both endpoints in ~44% of rows in the previous independent replay.

Player-disjoint 30-fold scores; MAE is error in predicted interval midpoint (stat points); inside is the fraction of midpoint predictions within observed gain intervals. The ×59 group contains 20 previously locked, completed prospective affected-stat results. Candidates were devised after seeing those outcomes; treat this as falsification, not fresh discovery.

| Candidate WHITE response (coach dose kept separate) | all 341 MAE / inside | ×59 MAE / inside | 155 newer controls MAE / inside |
|---|---:|---:|---:|
| M1, current shape fit | 1.730 / 82.7% | 2.280 / 100% | 1.629 / 78.1% |
| M*, current shape fit | 1.475 / 85.0% | 1.385 / 100% | 1.478 / 85.2% |
| M**, exploratory baseline | **1.437 / 87.4%** | **1.238 / 100%** | **1.303 / 89.0%** |
| Drill compatible flat WHITE + shared coach scale | 16.632 / 8.8% | 16.588 / 5% | 12.578 / 11.6% |
| Drill compatible early transition h100/K70 + scale | 3.929 / 65.4% | 4.481 / 70% | 3.623 / 54.8% |
| Drill compatible middle transition h120/K35 from M1 + scale | 1.700 / 84.2% | 1.980 / 100% | 1.496 / 80.6% |
| Middle transition from M* + scale | 1.619 / 85.0% | 2.030 / 100% | 1.567 / 83.2% |
| Late transition h130/K35 from M1 + scale | 2.959 / 72.7% | 4.885 / 65% | 2.941 / 65.2% |

Late from M* also fails (3.800 all / 5.612 ×59 / 3.290 controls). The best of the independently drill-compatible transfers **degrades the previously accurate ×59 and control predictions** relative to M*/M**. A completely flat white response can fit the repeated drill with variable dose yet is decisively inconsistent with coach previews; shared geometry therefore cannot be inferred from that drill fit. A fresh blind preview is required before declaring even M** the game mechanism.

### Existing residuals explained, not explained, or confounded

Frozen M* (in-sample structural diagnostic) has near-zero *signed* mean by effective WHITE coordinate, while absolute error grows: u<80, n85, MAE0.92; u80–119, n106, 1.38; u120–159, n111, 1.57; u≥160, n39, 2.02. Original displayed s bins likewise grow in spread, but tier offset changes the coordinate. No consistent signed drift supports one universal threshold shift. Age≥30 has n28 signed −1.03, but sparse ages and player/coach mixture confound a new age term. Tier T0/T2 signed −0.27/−0.35 versus T3/T4 +0.38/+0.39; role labels cover only 193/341 rows. WHITE n238 signed −0.07 and MID_GREY n103 signed +0.08; p and programme residual signs are mixed. These descriptive rows are not independent draws, so do not infer a parameter merely from a grouped mean.

Latent start fractions and absolute renderer differences plausibly explain a **one-point offset** and why same-coordinate repeated previews sometimes differ by one endpoint. They do not explain Paul Watson Passing GREY +12.47, Galileo Positioning WHITE −6.65, Panic Marking GREY −6, and Blakie Tackling WHITE +5.62 at effective u131, including opposite signs at similar values. A WHITE curve change cannot correct grey errors by construction. Dose definition, within-preview allocation, player state, or evidence quality remains unresolved; do not assign those large rows post hoc to one cause. Existing cross-player/same-player controls and the structure audit retain `N/p` and age bands provisionally, while historical mixed-source records remain quarantined. The drill data do not independently confirm that the coach dose law is close to solved, although testing a separate dose plus common response was an honest falsifier for simple transfer.

## Verdicts and smallest discriminating experiment

* **Falsified:** equal per-stat fractional accumulation across GREY and WHITE; *constant* single-stat carry with fixed dose per drill; a single exact 1.35 condition carry with floor-only reporting; independent stationary per-stat gain events as a credible sole account of ordered pairs; universal flat/early/late drill-derived coach response with one shared scale; coach renderer rounding alone as the source of large residuals.
* **Still consistent:** varying common drill-session dose plus per-stat carried thresholds; marginal response with α-dependent drill allocation; correlated stochastic gains around a common dose; coach-specific N/p dose with its existing nonlinear response and small latent/display effects. Neither deterministic versus stochastic stat settlement nor the common *shape* of drill and coach is identified by one player/drill.
* **No new card-only coach predictor is promoted.** M*/M** remain research benchmarks and the existing production predictor is untouched. The attempted drill-to-coach transfer has **no demonstrated out-of-sample improvement**.

**Next experiment, priority one:** screen a second **age-22 ST at T0**, same campus and 1-on-1 Finishing EASY configuration, with WHITE Dribbling near 100–110 and WHITE Finishing at least ~150–160. Photograph the full card, drill setup, every report and condition, and card after ~40–50 confirmed sessions (rest/recovery shots too). Haggag's D102/F121 endpoint 8/8 leaves flat/equal-white and middle response plus allocation both viable. Holding *the same drill and role* fixed while enlarging only the WHITE starting-value separation turns D/F gain **ratio and ordered event lag** into an algebraic contrast that cancels the unknown time-varying overall drill dose. Preregister integer gain intervals for both curves using the first run's phase/weight admissible sets; if ranges overlap at 40 runs, continue only to the first separated checkpoint. This is one controlled sequence, not a coach purchase.

**For coach transfer, after the card is captured and before showing its preview:** choose an ordinary coach that affects both separated WHITE stats, freeze its N/p, age/tier/class and both candidate intervals from **other players only**, and capture its unopened preview. A within-preview pair at the widest available start-coordinate separation cancels the coach's overall amplitude. If that player/coach combination is unavailable, prescreen cards and coach definitions using *inputs only* and choose the maximum predicted separation exceeding at least 3 stat points at an endpoint; do not spend or use the target preview to choose/fix coefficients. These two linked captures distinguish drill allocation from shared response and then check transfer. Exact numeric coach predictions require the as-yet unseen card/coach input, so inventing them now would contaminate the preregistration.
