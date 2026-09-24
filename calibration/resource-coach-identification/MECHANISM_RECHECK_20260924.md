# Ordinary Resource Coach: independent mechanism recheck (24 September 2026)

Status: research; no change to production prediction, frozen profiles, frozen predictions, or preregistered decisions. Branch `research/ordinary-coach-mechanism-20260924` starts at main `9dec1ef` (PR #161). Reproduce with `python tools/resource-coach-v2/mechanism_search_20260924.py --output calibration/resource-coach-identification/mechanism-search-20260924.json` and `python tools/resource-coach-v2/mechanism_checks_20260924.py calibration/resource-coach-identification/mechanism-checks-20260924.json` (requires numpy and scipy). The JSON files carry event scores, fitted models, direct constraints, dose, tier and period checks.

## Scope and evidence

I read the six named documents in `/Susan's desk/`, the current repository and the Drive Resource Coach Experiment Log. I used the repository's observed card/preview transcriptions, including the ten 24 September control cards; the Drive log confirmed that the repeated Gilmartin ×5 rows are an exact duplicate of a quality-excluded baseline (card Passing 252 versus preview 253), so I did not re-admit them. The pool digest is `5ef2b6dca18247f37afc1371d0fb4016ee721ee6e51e5759b995b0097452197b`: 96 previews, 341 affected-stat rows, 30 players. It excludes quarantined HIST rows. No preview is used to calibrate its own held-out prediction. The older prospective ×59 observations are still retained in the *retrospective* pool; selecting a new model after seeing them is not prospective validation.

The outcome here is the **displayed preview interval**, not the attribute increase after completing training. There are no verified realised per-stat outcomes in this pool. The score called “inside” means the predicted midpoint lies within the displayed `[lo,hi]`; it does not mean the prediction is a calibrated probability or that both endpoints are correct. LOPO means re-fit with an entire player excluded; LOCO excludes the whole coach definition. Both protect a fit from self-calibration, but neither corrects the post-hoc choice of model family.

## Reproduction and competitors

The frozen YG model reproduces MAE **2.3121**, midpoint-inside **74.49%**, overlap **95.89%** on 341 rows. Independently replaying the committed shape fits produces:

| Model | LOPO midpoint MAE | Inside | Overlap | Entire previews inside |
| --- | ---: | ---: | ---: | ---: |
| YG, frozen | 2.312 | 74.5% | 95.9% | 49.0% |
| M1, four jointly refitted constants | 1.730 | 82.7% | 97.9% | 62.5% |
| M*, M1 plus 22–25 WHITE threshold | 1.475 | 85.0% | 98.2% | 63.5% |
| M**, M* plus older-age threshold and K | 1.437 | 87.4% | 97.9% | 67.7% |

This reproduces the six-document report within rounding. The absolute numbers should be interpreted as retrospective grouped validation, not as a 90% prospective result. M** uses three extra shape parameters and has no independent mechanism for its age shifts.

I implemented cumulative-cost inversion independently of the committed shape predictor, retaining the same age bands, young-grey rule and tier subtraction. The hard response costs 1 below `h` and `exp((x-h)/K)` above. A soft transition uses `c(x)=(1+exp((x-h)/τ))^(τ/K)`; a discrete competitor charges `c(floor(x))` for each integer point. Each competitor refits its free constants on the training players in every fold. All rows were scored; no target interval was used as its own anchor.

| Independently fitted mechanism | Free constants beyond C,hW,hG,K | LOPO MAE | Inside | LOCO MAE | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Hard continuous, frozen ρ≈1.529 | none | 1.731 | 82.7% | 1.755 | Reproduces M1 |
| Hard continuous, ρ=1.500 | none | 1.731 | 82.4% | — | No predictive improvement |
| Soft continuous, ρ=1.500 | τ | 1.734 | 81.5% | 1.746 | No player-held-out improvement; fitted τ≈3.74 is close to hard limit |
| Integer-step cost, ρ=1.500 | none | 1.729 | 82.7% | 1.753 | Indistinguishable in this corpus |
| Soft plus fitted 22–25 shift, ρ=1.500 | τ, shift | 1.489 | 85.0% | 1.524 | Worse MAE than M*, same inside |

The hard, soft and stepped models share the `N/p` dose. A change in cost smoothness or one-point charging alone does not account for the age-related residual. The stepped and continuous models are practically indistinguishable at present precision; that is lack of identification, not evidence the game integrates a continuous curve. The fitted `τ` describes this dataset and is not a newly established game constant.

## Dose versus response

Refitting an N exponent jointly with M1 gives `q=1.0105`, LOPO MAE **1.7216** versus **1.7295** for q=1, while inside drops **82.7% → 82.4%**. Refitting the affected-stat exponent gives `η=0.9874`, MAE **1.7320** and inside **82.1%**. Neither is a material or stable improvement. A same-player, same-stat flat-regime control is Galileo age 31: ×26/p2 has N/p=13 and [37,55]; ×106/p8 has N/p=13.25 and [37,55/56]; ×114/p8 has N/p=14.25 and [40,60]. These are consistent with approximately linear N and inverse p without invoking a programme bonus. They are a small control, not proof of a universal dose law.

The age-band levels 8/6/4/2/1 remain plausible but are not independently pinned to the precision implied by a fitted constant: ages 20, 22 and 27–32 have thin player support. The 22–25 threshold shift is partly confounded with the newest controls, though period transfer is encouraging: fitting older evidence then scoring 24 September controls gives M1 **1.751 / 72.9%** and M* **1.432 / 85.2%**; reversing the periods gives M1 **2.204 / 88.7%** and M* **1.677 / 88.2%**. This is not a clean prospective comparison, since the model family was selected with both periods visible. The claim “dose close to solved” applies to **N and 1/p on this support**; the full mechanism, older ages, club levels and realised outcomes are still open.

## Direct geometry and observations

1. **Tier coordinate.** Removing WHITE tier subtraction and refitting all four constants causes LOPO MAE **7.080**, inside **42.8%**, versus **1.731 / 82.4%** with full subtraction. Partial multipliers 0.8 and 1.2 give MAE **2.437** and **2.819** respectively. This strongly supports `u=s−Δ(T)` for WHITE here, without proving the microscopic implementation.
2. **Renderer ratio.** On 17 conservatively flat rows with u≥0, lo≥10, the entire upper gain below hW=120 or hG=106, and young-grey excluded, `lo=round(x), hi=round(ρx)` has common feasible `ρ∈[1.48193,1.51007]`. Exactly 1.5 violates none; 1.529 violates 8/17. This is conditional on the round renderer and the flat-row screen. Hidden fractional stat values with a floor renderer can relax these bounds. Refitting ρ=1.5 changes held-out accuracy negligibly, so the ratio alone does not warrant promotion.
3. **Two dose endpoints versus gain-space ±20%.** High-coordinate gains visibly compress the hi/lo ratio. For 77 rows with u≥140 and lo≥5, the median ratio is **1.40**, and 33/77 are below 1.4. A universal render of `0.8E` and `1.2E` in *gain space* predicts approximately 1.5 before integer rounding and cannot explain broad compression. Multiplying the *dose* before the concave response can.
4. **Same-coordinate splits.** Of ten within-preview groups where two or more rows have identical displayed u and class, four have a one-point difference at an endpoint: Galileo ×106 at WHITE u=10; Ferguson ×10 at WHITE u=111; Panic ×20 at MID_GREY u=138; Panic ×10 at MID_GREY u=107. A deterministic equation of only displayed u, class and shared coach dose cannot reproduce these pairs exactly. Hidden fractional stats, stat-level allocation and transcription error remain competing explanations; the pairs alone do not identify which.
5. **Hidden fractional state.** On nine control cards with decimal preview OVR, OVR exceeds the mean of 15 displayed integer stats by **0.43–0.60**. Truncated individual stats are consistent with this and with one-point splits. One average constraint gives only the sum of 15 fractions, not each stat's fraction. Estimating a target stat's fraction from its own preview would leak the answer. Rounding the held-out M* raw endpoints gives endpoint MAE **1.614** versus **1.625** raw and only **22.7%** exact endpoints. Flooring raw endpoints gives **1.686**. The endpoint evidence cannot choose a renderer; changing the inside score by rounding predicted endpoints is not a mechanism improvement.
6. **Allocation.** The old “tiered grey/white budget ratio 0.70 in 8/8 events” depends on the older curve and a smaller subset. In nine eligible tiered mixed-class events, inverting observed endpoint midpoints under the joint M1 response gives grey/white inferred budgets **0.735–1.183**, with three at or above 1; the 18 comparable T0 events have median ≈1.01. This inversion ignores unknown fractions and is diagnostic only. It does not justify a tier-specific grey multiplier. The newer shape makes that old anomaly less consistent, and equal allocation is unresolved for tiered mixed-class previews.

## Decision and next observation

No tested alternative materially beats the current research models out of sample. Keep M*, M** and YG as **separate frozen research comparators**, preserve the existing preregistration, and do not replace production V2 with any of these fits. The most defensible compact hypothesis remains a shared per-stat dose approximately proportional to `A(age)N/p`, a tier-subtracted WHITE coordinate, a concave response and two dose endpoints. The response transition and hidden fractional/rendering rule are not identified. The age-specific WHITE shift is predictive within the historical sample but lacks a simple causal rule; M** gains another 2.4 points of retrospective inside rate at the price of two more terms.

**Smallest discriminating screenshot sequence:** choose one previously unseen 22–25-year-old T0 player with a coach affecting at least two WHITE attributes, one near u=118–125 and another near u=165–175, plus an unaffected or MID_GREY control. Capture the full card (including decimal OVR) and the ordinary coach preview, with the M1/M*/M**/soft/discrete intervals and endpoint predictions hashed *before* opening the preview. If feasible, cause a single displayed +1 increase in one of the affected attributes without changing age, tier, roles or coach, then capture the new card and **the same coach** preview. Record every changed stat and decimal OVR. Four screenshots (card/preview twice) test for point-step or fractional threshold behaviour using untouched affected stats as within-preview controls. If the +1 intervention changes several stats, retain it only as a documented multi-stat transition rather than pretending it isolates one variable. A matched 26–28-year-old T0 card with comparable WHITE coordinates under the same coach is the next needed control for the age-shift hypothesis.

This sequence is an experiment design, not a request to alter the user's player without their choice. Pre-register a winner by held-out endpoint error, midpoint-inside and whole-preview coverage; a one-point change in endpoints alone cannot settle the mechanism if hidden fractions also change.
