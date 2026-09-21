# Resource Coach system identification — corrected checkpoint

**Date:** 2026-09-21  
**Base:** `98089c7eb78b03d7a0f7ff107a8d0588ada65fee`  
**Scope:** analysis/calibration only. No production projection logic or constants changed.

## Source repairs

The source-integrity ledger in `resource_coach_source_corrections.v1.json` is authoritative for this pass.

- **Darren Moore PRV-0017 / x57:** quarantined. The cited `61747.png` is a blank **x114** Extensive All-Round coach-definition screen with no player selected and no gains. All seven alleged x57 player rows are unsupported and excluded.
- **Robert Gavilan Reward Finishing:** workbook class corrected from `WHITE` to `MID_GREY`. The two source variants are byte-identical and pixel-identical (SHA-256 `7d69fb6b7370bb90b4f51d2b9fdc45579b36b9ca8d5cb35f008384cc3167bf04`). The repository Reward sweep was already grey, so canonical `profiles/calibration_data.json` requires no rewrite.

Corrected assembled corpus: 288 rows after seven-row quarantine. The class-dependent all-corpus fit has 287 eligible rows. The focused core contains 153 eligible rows across 19 canonical players, including 12 explicit Reward rows.

## Reproducibility repair

The Astra checkpoint had corrected `corpus.json`, but its top-level `fits.json` and `power_dose_fits.json` were byte-for-byte copies of the pre-audit outputs. They were regenerated from the corrected corpus before the analysis below. `constraints.json` remained unchanged because neither source repair touches the matched constraints it evaluates.

## Strongest structural result: tier-adjusted rectification

For observed white stats define

[
u=s-d(T),qquad d(T0..T6)=(0,10,30,50,80,120,160).
]

Grey stats retain `u=s`. The candidate debt/rectification layer is

[
G=max(0,J+min(u,0)),
]

where `J` is the gain on the latent response coordinate.

This is not yet interpreted as literal stored debt. It is an observational mechanism under test.

Across same-preview, same-display-class pairs in the 153-row core there are 436 endpoint ordering comparisons. Under a shared nondecreasing cost response, lower `u` should admit at least as much latent gain as higher `u`.

- Raw displayed gains: **8/436** exact ordering violations, total minimum violation 57 points, maximum 24. Even allowing ±1 displayed point leaves 6 violations.
- After converting positive gains below zero back to latent `J`, and treating a displayed zero at `u<0` as admitting `0 <= J <= -u`: only **5/436** exact violations remain and every one is exactly one point.
- With only **±0.5 endpoint allowance, all 436 comparisons are feasible**.

This specifically resolves the large Neri contradictions without assigning player-specific parameters. Neri x23 has Tackling `u=-25, +0` and Fitness `u=100, +16-24`; the zero row can admit latent gain up to 25. Neri x30 has Marking `u=-3, +10-17`, which maps to latent `13-20`, leaving only one-point ordering differences against Positioning/Heading.

## Grouped player holdout

All numbers below are leave-one-canonical-player-out predictions. Candidate development has already seen this corpus, so this is retrospective grouped validation, not prospective evidence.

| Candidate | Endpoint MAE | Player-macro MAE | Max error | Interval overlap |
|---|---:|---:|---:|---:|
| Shared integrated response, linear N/p, **rectified**, no Reward parameter | **5.461** | 5.130 | **28.224** | .869 |
| Rectified + Reward dose coefficient | 5.559 | 5.023 | 37.916 | .869 |
| Rectified + N^q/p^eta, no Reward coefficient | 6.059 | 5.488 | 39.412 | .850 |
| Rectified + Reward dose + Reward low-stat rate | 5.303 | **4.946** | 36.564 | **.876** |
| Same shared model, **no tier adjustment** | 11.361 | 9.239 | 40.473 | .516 |
| Same shared model, no age association | 18.822 | 15.062 | 75.382 | .477 |
| Same shared model, no grey distinction | 7.581 | 7.218 | 36.300 | .797 |

The complex two-rate Reward parameterisation has the lowest pooled holdout MAE, but its advantage is small and unstable across only 19 players. It does **not** establish a distinct Reward algorithm.

The simpler Reward-dose model predicts the 12 held-out Reward rows at 1.183 endpoint MAE; the no-Reward power-dose model reaches 1.517. A completely shared rectified model reaches 2.496. Thus Reward-specific scaling is useful predictively, but a separate generative response surface is not identified.

Reward-dose coefficients in the grouped folds range approximately **0.594–0.670**, consistent with the independent K=47 ±1 endpoint cancellation interval **0.591–0.652**. Tightening that rendering allowance to ±0.5 removes the K=47 common intersection, so this is a rendering-dependent necessary region, not a calibrated constant.

## Dose law remains unidentified

Neri Passing at the same state gives x7,p=2 `+4-6` and x26,p=2 `+18-27`. Under the stated floor assumptions, a pure `N^q` dose requires

[
q > rac{log(27/7)}{log(26/7)} = 1.0287614.
]

However an overhead, allocation change, or different endpoint renderer can remove the same contradiction. Grouped fits of the no-Reward power model place q roughly 1.115–1.241 across folds, but this is not sufficient to identify a universal exponent.

A frozen linear response remains poor: only 28/64 matched x106/x114 endpoint comparisons admit a shared fractional phase under that model.

## Sensitivity

Removing the nine Skill Seminar rows and repeating the grouped Resource-Coach-only analysis gives endpoint MAE 5.728 (shared rectified), 5.661 (Reward-dose rectified), and 6.269 (power-dose rectified). The central tier-coordinate/rectification result is therefore not created by Skill Seminar inclusion.

The tier transform, age association and grey distinction all have strong predictive value. They are correlated with player/stat identity and are **not** yet isolated causal coefficients.

## Current conclusion

The strongest surviving structural hypothesis is a **tier-adjusted response coordinate with rectification below zero**. This survives grouped player holdout and independently repairs same-preview monotonic ordering.

What is **not** identified yet is equally important:

- Reward as a separate transfer law versus a shared law with Reward parameterisation;
- exact multiplier and affected-stat-count exponents;
- the integer/fractional endpoint renderer;
- exact OVR preview construction;
- whether the negative coordinate represents literal stored progress/debt or an observationally equivalent threshold/offset mechanism.

Do not promote any candidate to production until the endpoint renderer and residual large holdout errors are resolved.
