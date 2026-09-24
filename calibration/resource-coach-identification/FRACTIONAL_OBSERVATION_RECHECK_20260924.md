# Fractional observation and ordinary Resource Coach (24 September 2026)

Status: **research only** on `research/fractional-observation-20260924`. Production, the preregistered tests, and the existing frozen predictions remain untouched. This continues `MECHANISM_RECHECK_20260924.md` and its independent replays of the six `/Susan's desk/` documents, current PRINCIPIA, GitHub evidence and Drive experiment log. The original Said Haggag 1-on-1 Finishing/Campus screenshots are now independently accessible in Drive and have been checked against the live `Resource Coach Experiment Log — v1` tabs `Haggag_Drill_Sequence`, `Haggag_Teamplay_Raw` and `Haggag_Image_Index`. Their frozen research summary is `haggag-fractional-sequence-20260924.json`; reproduction code is `tools/resource-coach-v2/haggag_fractional_inference_20260924.py`. Mark Lurinsky Personal Trainer evidence remains a separate subsystem and does not enter any Resource Coach fit.

## What the new control identifies

The configured drill drain is exactly `1.5 × (1−0.10)=1.35` percentage points. Consecutive visible differences of 1 and 2 points are possible if hidden condition is real-valued and the display is integer. For an *exact*, unchanged drain of 1.35, an integer renderer and uninterrupted accumulation imply seven 2-point drops and thirteen 1-point drops in any twenty sessions, regardless of initial phase (except an exact display-boundary tie). This predicts a spacing pattern as well as counts. Random independent rounding, random realised drain, replenishment and hidden session-level modifiers also produce 1/2 differences. The current evidence does not distinguish them. PRINCIPIA's older nominal-6.00 preset history also includes 5/6/7-point observed drops; **one exact 6.00 drain plus one deterministic integer renderer cannot produce that history** without another variable. Thus do not elevate exact fixed-charge carry to a universal law.

Likewise, repeated +0 visible gain with occasional +1 Dribbling is compatible with accumulated hidden stat progress, stochastic awards or a thresholded integer stat allocator. It is direct evidence of quantised observation, not evidence of a shared implementation with Resource Coach. It does not identify an individual stat remainder or a coach dose.

For Mark's supplied 15-stat sums `S` and integer Personal Trainer OVR label `O`, consider the falsifiable hypothesis that card stats and OVR are floors of the latent individual stats and their mean. Writing the sum of 15 individual fractions as `F∈[0,15)`, each target requires

`15O − S ≤ F < 15(O+1) − S`.

At 148 the allowed `F` is `[0,7)`, at **each** of 152, 156, 160, 164, 168, 172 and 176 it is `[0,6)`, and at 180 it is `[5,15)`. Their intersection is **`[5,6)`**. A constant `F=5.5`, for example, gives hidden means 148.900, 152.967, …, 176.967, 180.033. It explains the +61, six repeated +60 steps and final +46 **without requiring a separate 180 rule**: the last integer label can be crossed after 46 more visible points. A hard cap may still exist; if an independently established cap means *latent mean* ≤180 exactly, this constant-F construction would fail at the last point. Also, ordinary nearest rounding of the mean with nonnegative card-stat fractions contradicts the intermediate `S=15O+9` rows, whose mean is already ≥`O+0.6`. These are conditional algebraic tests, not proof that OVR uses this floor rule, nor evidence of a particular per-stat 0/4/8 allocation algorithm.

## Candidate coach mechanism and independent tests

The simplest surviving *partial* coach mechanism is still a common per-affected-stat dose `B=C·A(age)·N/p`, applied at WHITE coordinate `x=s−Δ(tier)` or ordinary MID_GREY coordinate `x=s`, followed by a rising marginal cost `c(x)` and two dose endpoints `B` and approximately `1.5B`. Define `F(x)=∫c(x)dx`. The latent endpoint is

`x' = F⁻¹(F(x)+B)`; the displayed gain under a floor hypothesis is `floor(x')−floor(x)`.

This is precisely a **starting-state response difference**, equivalently `R(F(x)+B)−R(F(x))` with `R=F⁻¹`, and is not a stand-alone `R(B)`. The existing coach model already uses that difference. Thus the proposed `R(s+d)−R(s)` form is useful when `s` denotes the *cumulative cost coordinate*, and is not a new substitute for the fitted dose law. Both endpoints should traverse the response independently; gain-space multiplication by 1.5 is contradicted by high-coordinate compression.

The earlier independent grouped recheck established that fitting `N` and `p` exponents gives 1.0105 and 0.9874 with negligible or worse held-out gain, and that removing tier subtraction moves LOPO MAE 1.73→7.08. It found 17 conditional flat rows jointly compatible with ρ=1.5 under nearest rendering, not the frozen ρ≈1.529; 4 within-preview same-coordinate/class pairs split by one displayed endpoint point. Hard continuous and one-point stepped marginal cost scored LOPO MAE 1.731 versus 1.729; smooth transition 1.734. Thus the data support the broad dose geometry over these alternatives, **not an exact microscopic cost law**. Age factors, tiered grey allocation and 22–25 WHITE threshold remain incompletely identified. M* and M** age terms predict better in grouped replay but lack independent mechanical support.

I tested an explicit card-only observation layer. For each held-out player, fit M1, M* or M** parameters to **all other players** exactly as in the pinned shape model; freeze them. For every affected held-out card stat, set latent `x=s+f`, recompute the nonlinear starting-state response, render both endpoints as `floor(f+movement(x,B))`, and average 64 evenly spaced `f∈[0,1)`. The same quadrature gives possible endpoint support; it never estimates `f` from the target preview or uses its preview decimal OVR. A nearest-renderer comparison correctly conditions `f∈[−0.5,0.5)` on the displayed card integer. Code: `tools/resource-coach-v2/fractional_observation_20260924.py`; frozen inputs and full results: `fractional-observation-20260924.json`, digest `5ef2b6dca18247f37afc1371d0fb4016ee721ee6e51e5759b995b0097452197b` (96 previews, 341 rows, 30 players). The uniform prior is an explicit assumption, not an inferred hidden-state distribution.

| Shape fit, entire player excluded | Raw midpoint MAE / inside | Floor + uniform latent MAE / inside | Nearest + uniform latent MAE / inside | Raw endpoints rounded nearest MAE / inside |
| --- | ---: | ---: | ---: | ---: |
| M1 | 1.730 / 82.7% | 1.751 / 83.0% | 1.717 / 82.7% | 1.711 / 84.2% |
| M* | 1.475 / 85.0% | 1.515 / 85.3% | 1.474 / 85.3% | 1.482 / 88.0% |
| M** | 1.437 / 87.4% | 1.450 / 88.9% | 1.435 / 87.4% | **1.412 / 91.8%** |

The high 91.8% is an *inclusive integer-interval midpoint* score: rounding can move a midpoint onto an observed boundary. It is **not** 91.8% exact endpoint prediction (only 25.95% of its endpoints are exact), nor a prospective success, and the raw-nearest arm assumes zero remainder despite the independent fraction evidence. Floor-uniform M** endpoint MAE 1.542 is barely different from raw 1.548; its midpoint MAE is worse. Only **36.7%** of observed M** endpoints fall anywhere in the allowed one-stat-fraction floor support, averaging 0.57 points wide. Subject to the fitted shape and common-dose assumptions, a latent remainder confined to one point plus floor rendering cannot account for the other 63.3% of endpoint errors. For an increasing marginal cost, the latent endpoint `F⁻¹(F(s+f)+B)` moves no more than one point as `f` traverses `[0,1)`; floor rendering therefore normally permits only adjacent integers for a fixed dose. This is the strongest falsification of the claim that the remaining error is *primarily just rendering*.

As a second split, fit on 45 earlier events / 148 rows from 17 entirely different players and score 44 24 September control/×59 events / 175 rows from 13 players. M** raw MAE 1.524 / inside 88.0%; floor-uniform 1.462 / 88.6%; zero-fraction nearest 1.537 / 92.0%. M* raw 1.534 / 84.0%; floor-uniform 1.515 / 85.1%. This is player-disjoint time transfer, but **retrospective**: the families were selected after the later events existed. The conflicting LOPO and time-split rankings argue against promoting either renderer. No newly supplied *Resource Coach* target provides a fresh prospective holdout after this research choice; Mark's Personal Trainer sequence and the training history cannot serve as one.

## Surviving explanations and falsifications

| Explanation | Evidence in favour | Evidence against / next falsification |
| --- | --- | --- |
| One exact condition charge with deterministic fractional carry | 1.35 nominal and visible 1/2; predicts 7 twos per 20 and periodic spacing | Older nominal-6.00 history varies 5/6/7; count ordered consecutive 1.35 results with no recovery to test periodicity. |
| Stochastic condition or stat awards | Same settings yield differing history and sparse +1 gains | The PT arithmetic does not distinguish stochastic from deterministic stat allocation; repeated matched-state trials and ordered condition losses can distinguish these hypotheses. |
| Hidden fractional stat + floor/nearest preview renderer | Decimal preview OVR exceeds displayed-card mean by 0.43–0.60 in nine controls; four same-coordinate one-point splits; PT total intersection `[5,6)` under floor | Only 36.7% of M** coach endpoints lie in the one-point floor support; nearest versus floor remains unidentified. Check preview changes while every displayed stat stays fixed. |
| Stat-specific point allocation inside preview | Could create same-coordinate endpoint splits and 0/4/8-like PT steps | No repeated latent-state-matched coach preview or stat allocation seed; requires independently observed systematic asymmetry, not a fitted per-stat term. |
| Stepped marginal cost | Natural integer-stat mechanism | LOPO essentially equals continuous curve; collect matched integer-crossing starts with shared dose and enough near-threshold stats. |
| Smooth transition / age-shifted response | M* and M** improve held-out historical card-only MAE relative to M1 | Fitted smooth transition alone fails to improve; age terms not mechanically identified. Compare same-coach 21/22 and 25/26 controls at matched tier coordinates. |
| Shared N/p dose and tier coordinate with unmodelled allocation/response variation | Matched same-player doses and drastic failure without WHITE tier offset | Full dose law not proven across older ages, cap states or all coach definitions; get a new prospectively frozen, player-disjoint coach preview. |
| Special Personal Trainer 180 cap | Gameplay 180 may have separate restrictions | The supplied aggregate steps need no cap; seek the 176→180 per-stat screen, its exact OVR decimal and explicit cap evidence before fitting an interior curve with it. |

No new player-, coach-, age- or programme-specific correction is justified. In particular, using Mark's Personal Trainer steps to fit the ordinary coach curve mixes two unproved transfer mechanisms. We can say that *quantisation of internal quantities* plausibly links condition, training, Personal Trainer and coach rendering at an architectural level. Their respective equations, hidden phases, allocation algorithms and coupling remain unestablished. The dose law is close to solved only in the restricted sense of observed linear `N`, inverse `p` and tier-coordinate behaviour; the source of the remaining coach error cannot yet be assigned uniquely to response versus per-stat allocation or dose heterogeneity.

## Original Haggag screenshot sequence: fractional architecture recheck

The new Drive evidence materially sharpens the earlier conclusions. The player's run starts at **13:52:47**, not at the first dense training-report capture at 14:04. The baseline screenshot is `Screenshot_20260924-135247.png`: Said Haggag, age 22, ST, T0, displayed OVR 96, with Tackling 82, Dribbling 102 and Finishing 121. The final card at 14:24:07 is Tackling 87, Dribbling 110 and Finishing 129, with the other twelve displayed stats unchanged. Thus the visible endpoint gain is exactly **+5 Tackling, +8 Dribbling, +8 Finishing = +21 points**.

The live spreadsheet contains 115 captured training reports. Among report-to-report condition captures it records 69 × −1, 35 × −2, 7 × −3 and 1 × −4. The five Teamplay Form history screenshots are a more direct condition channel: each historical training row is an individual event, and every readable event is **−1 or −2**, never −3 or −4. Therefore every captured −3 forces at least one uncaptured run and the −4 forces at least one; the sequence contains **at least 123 actual runs**. A −2 capture can itself hide two −1 runs, so 123 is a lower bound until the complete event order is reconstructed.

Two four-rest recoveries independently anchor the ledger at 29→89 (+60) condition. The final setup is condition 54. **Conditional on the player starting at 100 condition**, the total visible condition consumed is therefore `100 + 60 + 60 − 54 = 166`. At the minimum 123 runs, the configured `1.35` cost predicts `123 × 1.35 = 166.05`. The discrepancy is only −0.05 point. If each run settles to an integer loss of 1 or 2, a total of 166 over 123 runs requires exactly **80 ones and 43 twos**, giving `43/123 = 0.3496` twos — almost exactly the 0.35 fractional part of the configured charge. This agreement is conditional on the unobserved initial condition being 100 and on 123 being the true run count, so it is evidence, not a proof.

The Teamplay history independently rejects the simplest deterministic carry model. Exact 1.35 subtraction plus a single persistent unit-interval floor/nearest phase cannot produce two consecutive visible −2 losses: after a two-point crossing the phase advances by 0.65, forcing the next loss to be one. The original history screenshots contain adjacent −2 rows directly, including **four consecutive −2 events** in the 14:20 block. Thus the earlier “fixed 1.35 + deterministic carry” hypothesis is **falsified for condition**. A Bernoulli-like integer settlement `1 + Bernoulli(0.35)` is compatible: exact-overlap alignment of the five history windows yields 38 known unique rows, 24 ones and 14 twos, for mean drain 1.368 and a two-rate of 0.368. This does not establish independence or literal RNG; a deterministic server-side allocator can have the same marginal behaviour.

The stat channel behaves differently. All eight final Dribbling points are directly visible as isolated +1 events. Seven of the eight Finishing points are directly localized, with the remaining one required by endpoint conservation; four of five Tackling points are localized. More importantly, the visible Dribbling crossings repeatedly precede a Finishing crossing by one or two captured reports: R8→R10, R20→R21, R31→R32, R46→R48, R64→R65, R78→R80 and R108→R110, with the missing Finishing point in the R95 region unresolved. Because uncaptured runs exist, report IDs are not run IDs; nevertheless the recurrence is strong evidence for testing **stat-specific latent accumulators/phases driven by a shared session dose**, rather than one global fractional remainder or independent arbitrary +1 awards.

This is especially informative for the Resource Coach response shape. Haggag is age 22 and T0. Dribbling remains WHITE from 102→110, below the M1/M* high-cost region; Finishing traverses WHITE 121→129, across the disputed threshold region; Tackling moves 82→87 as a grey/class control. The repeated drill therefore gives a within-player way to test marginal-response curvature and threshold placement without involving Resource Coach multiplier `N` or affected-stat count `p`.

### Phase-conditioned model to test

Do **not** alter `C`, `A(age)`, `N/p`, tier subtraction, M1/M*/M** thresholds or production code yet. Instead, add a research-only latent state for each observed stat. For a candidate response cost coordinate `F_j`, model run-level state as

`z_{j,n+1} = z_{j,n} + q_j`

with displayed stat

`s_{j,n} = floor(F_j^{-1}(z_{j,n}))`

for the floor hypothesis (and an explicitly separate nearest-renderer competitor). The unknown `q_j` values are nuisance drill doses; the initial phases are nuisance states. Each +0/+1 observation contributes interval constraints rather than a midpoint target. Uncaptured run counts are latent integers constrained first by the condition ledger and Teamplay history. Dribbling is the clean primary arm because its eight visible points are fully localized; Finishing and Tackling use endpoint conservation for their single missing point.

The objective is not to make the drill model itself “win”. It is to derive a **phase interval at Haggag's final card that is independent of any coach preview**. Then pass that interval through the frozen coach response:

`x' = F^{-1}(F(x + f) + B_{lo/hi})`

and compare the resulting phase-conditioned integer support with the ordinary card-only M1/M*/M** prediction. If a fresh ordinary coach preview is substantially better predicted by the drill-derived phase than by a uniform `f∈[0,1)` prior, that supports a shared latent stat state between training and Resource Coach. If it does not, fractional training remains an architectural analogue rather than the missing coach state variable.

The existing coach recheck already prevents an easy false conclusion: a generic one-point fraction plus floor rendering reaches only **36.7%** of M** observed coach endpoints. Therefore phase conditioning is allowed to explain only the part actually identified from Haggag's longitudinal sequence; it may not be used as a free per-target endpoint correction.

## Next prospective coach test

1. Fit/falsify the stat-phase model on the frozen Haggag drill sequence only. Report feasible phase width for Dribbling, Finishing and Tackling under M1, M* and M**, plus any model that cannot satisfy the ordered crossings.
2. Before opening a new Haggag ordinary Resource Coach preview, freeze the phase-conditioned endpoint predictions and the existing card-only comparators by commit/hash. Prefer a coach affecting at least Dribbling and Finishing; an affected grey stat such as Tackling adds a class control.
3. Open the coach preview once, then reopen it without intervention to measure preview repeatability. Score exact endpoints, midpoint error, interval overlap and whether the observed endpoints lie inside the **precomputed phase support**.
4. Do not estimate Haggag's phase from that coach preview, and do not refit `C,h_W,h_G,K,N/p` until the frozen transfer test is scored.
5. Only if phase conditioning wins prospectively should the same procedure be evaluated player-disjoint across other longitudinal states. Production remains unchanged until that transfer survives independent players/coaches.

The immediate research target is therefore narrower and more falsifiable than “add fractional rounding”: **identify per-stat latent phase from longitudinal training, then test whether Resource Coach reads that same latent state.**

