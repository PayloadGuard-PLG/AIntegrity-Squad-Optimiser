# Ordinary Resource Coach — what is structurally missing (24 September 2026)

Research ledger. Production logic, the frozen replay profile
`profiles/resource_coach_current_replay_20260923.json` and the frozen x59 prospective
predictions (commit `46a77209`) are **not** modified; the test suite pins them byte-for-byte.

Reproduce:

```bash
pip install numpy scipy
python tools/resource-coach-v2/structure_audit.py --out-dir /tmp/structure-audit   # ~3.5 min
python -m unittest discover -s tests -p 'test_resource_coach_structure_audit.py'
```

The generated tables (`STRUCTURE_AUDIT.md`, `structure-audit.json`,
`candidate-direct-predictions.csv`) are also produced by the
*Resource Coach Direct Player-Card Replay* workflow for every player in the corpus.

> **Status after the prospective controls (read this first).** The one-paragraph answer below
> was written before the controls and is kept as the historical record. The addenda decide.
>
> - **Falsified.** The `N − 1` dose law (point 2): Ferguson ×5 implied 1.42× the frozen dose.
>   Other-player coach anchoring as a *universal* correction (point 3): Ferguson, and regime-matched on Rodger ×10.
> - **Supported prospectively.**
>   - Young-grey cheapness at ages 18–21: Kawa, out of corpus, MAE 2.33 against 10.51. It is
>     age-specific (Rodger at 23: 1.02×). This is the research candidate
>     `resource_coach_structure_candidate_20260924b.json`.
>   - The frozen response geometry and age bands.
> - **New (addendum 5).**
>   - Club level can be read from the quality offset.
>   - Displayed-unit thresholds carry across club levels.
>   - Whether dose scales with club level is open; the archive decides it.
>   - The HIST tier in `PRV-0015` came from a later season, which explains its contamination.
> - **Unresolved.** A white threshold near 127 fits 23–24 Sep and ×59, and it passed its pre-registered test
>   (22 WHITE rows: MAE 1.11 against 1.71, addendum 6). It still degrades the 10–12 Sep archive, so it is not
>   adopted until that conflict has a mechanism.
> - **Revised (addendum 6, post hoc).** Anchoring on other players' previews improves players aged 23–26
>   (MAE 1.90 → 1.35, 28 rows) and fails only where young-grey applies. It is age-conditional, not falsified
>   outright. Young-grey + anchor is the next test to pre-register.

## Answer in one paragraph

The frozen **response** (tier-subtracted latent coordinate, flat→exponential marginal cost,
class thresholds, equal allocation, constant renderer ratio) survives every dose-free test
applied here, and the frozen **age bands 8/6/4/2/1** survive a within-coach test that cancels
coach efficiency algebraically. The missing pieces are in the **dose** and in the **evidence**:

1. **Mixed evidence, not missing mathematics, carries most of the aggregate error.** The seven
   canonical-workbook "Ordinary Coach" previews are 37 of 203 scored rows but **61%** of the
   total absolute midpoint error (MAE 16.0 vs 2.26 elsewhere). They fail dose-free admissibility
   tests that every other preview passes (details below). They should be scored as a separate,
   quarantined stratum, never pooled.
2. **The multiplier transfers `N − 1` dose units, not `N`.** This is supported by a flat-zone
   same-stat contrast that excludes proportional dose, and by a regime holdout: with C fitted only
   on N ≥ 13 coaches and N₀ = 1 fixed *a priori*, the unseen ×5–×10 events improve from MAE 2.66
   to 1.65 (inside-rate 36% → 77%). The N ≥ 13 data alone put their SSE minimum at N₀ ≈ 0.75–1.
3. **The largest remaining variance is a coach-definition efficiency, not a player factor.**
   With coach definition fixed, adding player identity explains nothing beyond chance
   (permutation p = 0.31). An *other-player* anchor on the same coach definition takes the frozen
   x59 prospective test from MAE 2.34 to 1.92, from 85% to 100% inside, and from +2.09 to +0.19
   signed. No recorded coach metadata (family, shape, N, p) predicts this term, so a
   card-plus-metadata predictor cannot remove it. Skill Seminar shows about twice the
   coach-to-coach scatter of Training Camp and Drill Session.

What did **not** survive: smooth age laws, programme-family and coach-shape dose terms, N^q and
p^η deviations, a universal grey exposure weight, age–threshold coupling, tier-dependent grey or
white terms, stat-specific allocation weights, and a separate interval renderer.

## Partitions (declared before fitting)

| Partition | Content | Use |
|---|---|---|
| CAL | 52 complete ordinary previews, 166 rows, 22 players: archive, chat-locked, live Gilmartin/Lerchl/Lurinsky, 21 Sep previews with tier recovered from a same-age card whose affected starts agree within one point | the only data any parameter is fitted on |
| X59 | 4 frozen prospective Skill Seminar ×59 previews, 20 rows | holdout, never fitted |
| HIST | 7 canonical-workbook ORDINARY COACH previews, 37 rows | scored, never fitted, tested for admissibility |

Two diagnostic stages free a per-event budget: geometry, which factors out the whole dose law,
and the implied-dose table. They identify mechanisms. They are not predictors, and no player
amplitude is ever fitted from its own outcome.

## Baseline decomposition (frozen model)

| Set | n | midpoint MAE | inside | overlap | endpoint MAE | signed |
|---|---:|---:|---:|---:|---:|---:|
| CAL + HIST + X59 | 223 | 4.556 | 71.7% | 86.5% | 4.764 | +2.186 |
| CAL | 166 | 2.264 | 82.5% | 95.2% | 2.462 | −0.592 |
| HIST | 37 | 16.035 | 16.2% | 40.5% | 16.178 | +14.699 |
| X59 (raw) | 20 | 2.342 | 85.0% | 100% | 2.752 | +2.089 |
| X59 (frozen display integers, as recorded) | 20 | 2.425 | 85.0% | 100% | 2.725 | +2.125 |

## Hypotheses 1–17

Each row states the verdict and the evidence behind it. The falsifier is the observation that
would overturn the verdict.

| # | Question | Evidence | Verdict | Falsifier |
|---|---|---|---|---|
| 1 | Coarse age bands vs smooth law | Same coach, same class, same start 35: Ferguson (21) and Howden (19) Skill ×33 both [98,113]. Admissible dose ratio 0.984–1.016 excludes a 3%/yr smooth decline. TC Focused ×26 cross-section: ages 26–29 all 3.6–4.3 with no within-band trend. Within-coach fixed effects (Diamond excluded) correct the bands by −0.05±0.04, −0.02±0.04, +0.05±0.06, +0.03±0.06. The smooth law fails LOPO (MAE 5.04 vs 2.26) | **Bands retained, 8/6/4/2/1 confirmed to ~5%** | Same coach, same stat, same start, ages straddling one year inside a band with a dose ratio outside ±5% |
| 2 | Skill Seminar own dose law | Family dummy +5% (SS) worsens LOFO and x59 (3.39). SS coach effects range from −8% to +25% around the model at similar N/p; ×33 and ×59 share the same 8-day duration yet differ by ~15% per stat | **No separable SS law identified**; SS has larger coach-level scatter | Two SS coaches on the same player state, identical stats, N differing at fixed duration |
| 3 | Nonlinear multiplier N^q | q fits 1.02. Flat-zone Neri Passing ×7/×26 (same player, stat, start, p, family) admits ratio 4.08–5.00: excludes N (3.71), includes N−1 (4.17). ×106/×114 same-state rows cannot discriminate (N 1.0755, N−1 1.0762) | **Affine N − 1 retained**; power law rejected | Same state, same stat, flat zone, ×5 vs ×10 or ×10 vs ×40 with ratio matching N rather than N−1 |
| 4 | Affected count other than 1/p | η fits 0.97; no LOPO gain | **1/p retained** | p = 1 vs p = 5 same coach family, same N, same stat and start |
| 5 | Standard/Focused/Extensive dose | Shape dummies −3.7% / +0.5%; LOPO and x59 worse | **Rejected** | — |
| 6 | Equal allocation false | Within-event residuals with free per-event budget show no stat bias (all within ±0.9, <2 SE) | **Equal allocation retained** for T0 | See 9/10 for the tiered-player exception |
| 7 | Stable stat weights | As in 6; Heading/Positioning +0.8±0.5 are the high-coordinate rows of older players | **Rejected** | A stat whose residual stays signed across three or more players on low-coordinate rows |
| 8 | Stat effect is a coordinate artefact | The small Heading/Positioning excess sits at high u for older players, and the LP conflict (Galileo vs Ripley Heading/Positioning) is coordinate-local | Consistent; nothing to add | — |
| 9 | Separate WHITE/MID_GREY curves | Class-specific K lowers geometry RMSE 1.99→1.87 (x59 1.68→1.53). Universal grey weight fits 1.00 | Weak; **not adopted** without a direct gain | Tiered player with WHITE and MID_GREY rows both deep in the flat zone, replicated |
| 10 | Tier subtraction Δ(T) | No subtraction: geometry RMSE 5.19 vs 1.99. Offset scale fits λ = 1.04. Within-coach tier dose effect +0.00±0.03. Grey/white budget ratio inside an event is 1.00 for T0 (n=19) but **0.70 for every tiered event (8/8 < 1)**. Direct tier terms (grey weight, WHITE dose, WHITE threshold) fit ≈0 and worsen LOPO | **Δ(T) confirmed as is.** Tiered grey/white anomaly is real inside events but is **unexplained and not predictive** | Same as 9 |
| 11 | Flat→exponential shape | Pure exponential RMSE 6.70; power law no better. A nonparametric monotone-cost LP is infeasible even without HIST (slack 976 at ±0.5), so no monotone shared curve with equal allocation fits everything. The binding conflicts are local (Galileo vs Ripley high-u WHITE; Darren ×23; Diamond) | **Shape retained**; a residual coordinate-local misfit remains | — |
| 12 | K/threshold dependent on class, programme, age | Age–threshold coupling κ improves geometry 1.99→1.62 but fits κ≈0 directly and fails LOPO | **Rejected as a predictor** | — |
| 13 | Rectification bias | Only T6 u<0 rows (Neri Tackling) are affected | No evidence of bias | — |
| 14 | Separate interval renderer | Refit ρ = 1.50 with the refitted response, 1.52 with the frozen one. Per-event ρ SD 8%, no family/shape/p/N dependence; its correlation with budget follows response compression | **No separate renderer needed** | — |
| 15 | Role configuration beyond class | Role count r ≈ −0.07 with implied dose; white count r ≈ −0.04 | **Rejected** | — |
| 16 | OVR/base OVR/white count/category | OVR r = −0.23, base OVR −0.13 (not significant); player effect beyond coach p = 0.31 | **Rejected** | — |
| 17 | HIST "Ordinary Coach" same mechanism? | See next section | **Mixed/mislabelled evidence; quarantine from pooled scoring** | A pixel-verified re-read of those screenshots whose state passes the geometry test |

## Why the HIST records are not the same evidence

These are dose-free tests: each event gets its own free budget, so the dose law cannot be the
reason for failure.

| Event | Player | recorded | geometry RMSE | RMSE at Δ = 0 / 10 / 30 / 50 / 80 | degenerate intervals | implied dose |
|---|---|---|---:|---|---:|---:|
| PRV-0015 | Scott Ritchie | 18, T2 | **14.37** | 3.1 / 6.8 / 14.4 / 16.7 / 16.7 | 0 | 0.37 |
| PRV-0014 | Scott Ritchie | 18, T2 | **12.00** | 4.6 / 7.8 / 12.0 / 12.5 / 12.5 | 0 | 0.45 |
| PRV-0011 | David Farquhar | 18, T0 | 5.01 | — | 0 | 0.68 |
| PRV-0012 | Andrew Leslie | 18, T0 | 4.40 | — | 0 | 0.81 |
| PRV-0007 | Darren Moore | 19, T3 | 3.65 | fits only at Δ = 50 | **3** | 1.13 |
| PRV-0010 | Ryan Rodger | 18, T0 | 0.51 | — | 0 | **0.47** |
| PRV-0021 | S Rayne | 19, T3 | 1.64 | — | 0 | 0.81 |

Non-HIST events have a median geometry RMSE of 1.40 (p90 3.91, max 7.00 for Paul Watson).

- **Scott Ritchie:** the recorded T2 coordinate is geometrically impossible; only an untiered
  coordinate fits. The archive has him at 24, T2 on 11 Sep with the identical Aggression 95, so the
  card and the previews are from different states.
- **Darren PRV-0007:** three intervals are degenerate ([16,16], [39,39], [39,39]). No live
  ordinary preview in the corpus is degenerate at a positive gain, so this is not a preview
  render. Its ×57 twin was already quarantined.
- **Ryan Rodger:** his geometry fits, but the implied dose is 0.47. The HIST card says age 18 and
  OVR 114; the canonical current card and the archive say 23 and OVR 89.
- **Dose spread:** implied log-dose SD is 0.37 for HIST versus 0.14 for CAL, so the stratum is not
  even internally one mechanism.

The monotone-cost LP ranks both Scott Ritchie previews as the two most infeasible events in the
whole corpus.

## Candidate: `ordinary-affine-multiplier-20260924-research`

`profiles/resource_coach_structure_candidate_20260924.json`. One structural change:

```
B_lo = C · A(age) · (N − 1) / p,   B_hi = 1.529 · B_lo,   C = 1.3877
```

N₀ = 1 is fixed a priori. C is the only fitted number, fitted on CAL (x59 excluded). Everything
else is byte-identical to the frozen profile.

| Set | model | n | MAE | inside | overlap | endpoint MAE | signed |
|---|---|---:|---:|---:|---:|---:|---:|
| CAL | frozen | 166 | 2.264 | 82.5% | 95.2% | 2.462 | −0.592 |
| CAL leave-one-player-out | candidate | 166 | **1.978** | 86.7% | 95.2% | 2.248 | −0.129 |
| CAL leave-one-coach-out | candidate | 166 | **1.918** | 86.7% | 95.2% | 2.212 | −0.102 |
| CAL leave-one-family-out | candidate | 166 | **1.920** | 86.7% | 95.2% | 2.221 | −0.017 |
| Low-N regime holdout (fit on N ≥ 13) | N₀=0 / N₀=1 | 22 | 2.661 / **1.645** | 36% / 77% | 86% / 86% | — | +2.34 / +1.13 |
| X59 prospective | frozen | 20 | **2.342** | 85% | 100% | 2.752 | +2.089 |
| X59 prospective | candidate | 20 | 2.878 | 70% | 100% | 3.205 | +2.787 |
| HIST (quarantined) | candidate | 37 | 16.331 | 13.5% | 40.5% | 16.520 | +15.234 |

**The candidate does not pass the only clean prospective test.** It is 0.54 MAE worse on x59.
Half of that difference comes from calibrating C on CAL at all: C-only refit gives 2.74. The rest
is the 2% higher dose that N − 1 implies at N = 59. Every variant that fits anything on CAL gets
worse on x59, because CAL wants roughly 2–5% more dose and x59 wants roughly 13% less. No card or
metadata variable separates them; the other-player coach anchor does.

On this evidence N − 1 is a supported mechanism but **not a promoted predictor**. It should be
tested prospectively before replacing the frozen C·N.

## Secondary mode: other-player coach anchor

The anchor is estimated only from previews of the identical coach definition made by **other**
players. The target's own preview is excluded by construction (`anchor_offset`, tested). This
mode is optional and does not change the primary card + metadata prediction.

| Scope | model | MAE | inside | overlap | signed |
|---|---|---:|---:|---:|---:|
| 156 rows on 12 shared coach definitions | frozen, no anchor | 2.240 | 85.3% | 96.8% | −0.155 |
| same | other-player anchor | **2.002** | **90.4%** | 97.4% | +0.061 |
| X59 | frozen, no anchor | 2.342 | 85.0% | 100% | +2.089 |
| X59 | other-player anchor | **1.924** | **100%** | 100% | +0.188 |

With an anchor the dose law is irrelevant (frozen and candidate coincide), which confirms that
the residual is a whole-coach multiplicative term.

## Outliers kept in the primary score

- **Russell Diamond** (18, T0) has implied dose 1.37–1.56 on WHITE-only coaches but 0.79–1.05
  whenever a MID_GREY row anchors the event. No single tier offset reconciles his five previews,
  so this is a card-state problem of the HIST kind. He is kept in every primary number. The
  within-coach age test is also reported without him, because he alone produces an apparent
  −14% shift of every older band.
- **Paul Watson** (26, T2): the within-event grey row is 20% below WHITE in the flat zone; this is
  the tiered grey/white anomaly (#10).

## Discriminating experiments, cheapest first

1. **Coach anchor, prospectively.** On the next ordinary coach, preview one player first, freeze
   anchored predictions for the others, then preview them. This tests #3 of the answer directly.
2. **N − 1 vs N.** Same player state, same stat in the flat zone (latent start well below 120),
   the same coach label at ×5 and ×10. N predicts a ratio of 2.00; N − 1 predicts 2.25.
3. **Tiered grey/white.** A T2+ player with a WHITE row and a MID_GREY row both deep in the flat
   zone on the same coach, paired with a T0 player on the same coach. Equal allocation predicts
   equal gains for both players; the tiered anomaly predicts the grey row about 25% lower for the
   tiered player only.
4. **Skill Seminar dose.** Two SS coaches with the same duration and stat set, N differing.
5. **HIST reconciliation.** Re-read `45887.png`, `45888.png`, `45890.png`, `61747.png` and the
   Scott Ritchie previews with the card captured on the same screen. Readmit a record only if it
   passes the geometry test at its recorded tier.

## Addendum: Ferguson control arm (predictions frozen at `e0fd9f2`, scored after)

Files: `control-card-20260924-ferguson.json`, `control-predictions-20260924-ferguson.json`,
`control-observation-20260924-ferguson.json`, `control-score-20260924-ferguson.json`.
Ferguson is a **known** corpus player (identical 23 Sep card), so this is a known-player arm,
not an out-of-corpus control.

| Coach | Frozen F MAE / inside | N−1 MAE / inside | Anchor A MAE / inside | Implied dose vs F |
|---|---|---|---|---:|
| Drill Standard Attacking ×5 | 9.51 / 0% | 13.12 / 0% | 10.09 / 0% | **1.42** |
| Drill Standard Offensive ×10 | 8.98 / 50% | 9.26 / 50% | 12.50 / 50% | **1.31** |
| Skill Standard Safeguard ×59 | **1.02 / 100%** | 1.42 / 100% | 3.44 / 100% | 1.02 |
| Pooled (12 rows) | **5.80** | 6.96 | 8.13 | — |

Pre-registered verdicts:

- **N − 1 is falsified at low multiplier** (×5 implied dose 1.42; the rule required ≤ 0.92).
- **The coach anchor as a coach-level scalar is falsified** (×10 implied dose 1.31 ≥ 0.865, and A is
  the worst model pooled).
- **Frozen F is the best pooled model.** Its pattern distance (0.143) is within 0.05 of A's (0.170),
  so the pattern comparison is formally inconclusive.

**Correction to the conclusions above.** Within the single ×10 preview, implied dose is 0.88–0.90 on
the WHITE rows at 111 and 1.39–1.50 on the MID_GREY rows at 35–47. Implied dose is therefore not a
property of the coach alone. The ×10 anchors (Lurinsky, Lerchl) sat only on rows at 114–153, so the
"coach efficiency" they carried was partly a coordinate-regime effect and does not transfer to a
player with low grey rows. The earlier x59 anchor success (four mid-stat players anchoring each
other) is consistent with this.

**New post-hoc hypothesis (not validated).** For players aged 18–21, MID_GREY cost below about 80 is
about 0.65 of the flat-zone cost. This is not a global curve change: 25–32-year-old and T6 low grey
rows (Galileo, DarkVader, Rodger at 23) are flat at dose ≈ 1.0. Ferguson and Howden are the only
18–21 T0 players in the corpus with grey rows below 80.

| g = 0.65 below 80 (age ≤ 21, MID_GREY) | Ferguson ×5 | ×10 | ×59 | Ferguson ×33 | Howden ×33 | Howden ×106 | Howden ×26 |
|---|---:|---:|---:|---:|---:|---:|---:|
| frozen MAE | 9.51 | 8.98 | 1.02 | 3.29 | 3.62 | 2.01 | 1.67 |
| hypothesis MAE | 1.77 | 2.34 | 1.96 | 3.22 | 1.77 | 1.88 | 1.83 |

g and the 80 knot were read from the Ferguson control rows, so only the Howden columns are
independent of the value. The hypothesis is pre-registered for a fresh test in
`preregistration-20260924-young-grey-control.json`. The preview's `Avg: X (Y)` category values
(Ferguson: 85 (91.2), 62 (85.6), 68 (87.1); constant across all three coaches) are an unrecorded
player-level quantity and a candidate catch-up variable. Capture them from now on.

## Addendum 2: Kawa, the out-of-corpus Y arm of PREREG-20260924-YOUNG-GREY-CONTROL

Predictions frozen at `cb238fc` before either preview; files `control-*-20260924-kawa.json`.
Michal Kawa: 21, DC, no ordinary evidence (`corpus-roster-20260924.json`), all seven x5/x10 rows
MID_GREY at 52–66.

| Kawa | H0 (frozen) | H-YG (g = 0.65 below 80, registered) | Anchor A |
|---|---|---|---|
| ×5 (3 rows) | MAE 9.34, 0/3 inside | **MAE 1.58, 3/3 inside** | 9.92, 0/3 |
| ×10 (4 rows) | MAE 11.39, 0/4 inside | **MAE 2.90, 4/4 inside** | 18.47, 0/4 |
| Pooled | 10.51, signed −10.51 | **2.33, 7/7 inside, signed −2.33** | 14.81 |

Row-implied dose relative to H0 is 1.32–1.47, replicating Ferguson (1.29–1.52) on a player with no
prior evidence. Verdicts:

- **Y leg passes.** H-YG beats H0.
- **Falsification check passes.** Implied dose 1.36 lies outside 0.90–1.10.
- **O leg cannot be evaluated.** There is no eligible 24–29 T0 player with grey rows below 70.

The low-grey cheapness is therefore established prospectively for 18–21-year-olds; that it is
specific to that age remains supported only retrospectively.

**Post-hoc lead, not validated.** The preview shows a bracketed value per category that is constant
across coaches: Kawa 93.6 / 84.2 / 90.1, Ferguson 91.2 / 85.6 / 87.1 for DEF / ATT / PHY. Using that
value as the knot instead of 80, with g = 0.65, lowers Kawa's MAE from 2.33 to 0.71 and Ferguson's
(all 12 rows) from 2.04 to 1.71, with no new fitted number. If older players' bracketed values sit
at or below their stats, this would explain the apparent age specificity as a target-gap effect.
Before it can enter a card-only predictor, two things are needed: where the bracketed value can be
read without opening a coach preview, and its value for older players with low grey rows.

## Addendum 3: the bracketed value is the quality scale (withdraws the target-gap lead)

`quality-scale-20260924.json`. At DarkVader's club level 15, **quality = 70 + displayed / 4**
exactly (7 points, slope 0.2497, max residual 0.03). Friends-view clubs at levels 17–22 share the
offset 70; association views show offsets of 80, 150 and 265. The bracketed preview value is
therefore a rescaled category mean, not new information, and the target-gap interpretation in
addendum 2 is withdrawn. Its apparent gain was only a knot near 85–90: a fixed knot of 88
(quality 92) gives MAE 0.91 on the 15 young low-grey rows.

**Constants in quality units:**

| Frozen constant | Displayed units | Quality units |
|---|---:|---:|
| MID_GREY threshold | 120.1 | **100.0** |
| WHITE threshold | 132.6 | 103.2 |
| K | 26.05 | 6.5 |
| Base-OVR cap | 180 | 115 |
| Young-grey knot | 80–88 | 90–92 |

The grey threshold falling on a round quality value suggests the game defines cost on the quality
scale. Displayed-unit constants are valid only at a fixed offset. Club level and view must now be
recorded with every card and preview, and historic captures made under a different offset cannot
be pooled in displayed units.

## Addendum 4: Rodger substitute O arm; young-grey candidate

Predictions frozen at `6b8731a`; files `control-*-20260924-rodger.json` and
`preregistration-20260924-young-grey-control-O-substitute.json`. Ryan Rodger: 23, T0, AML/ML/AMC,
club level 15. His four ordinary previews:

- Drill Session Standard Attacking ×5 (1 hour);
- Drill Session Standard Offensive ×10 (1 hour);
- Drill Session Standard Defending ×20 (3 days);
- Skill Seminar Standard Physical ×15 (8 days).

A fifth preview, Reward Focused Defending ×4, is recorded as Reward evidence only.

| Coach | H0 MAE / inside | Anchor A | Implied dose vs H0 |
|---|---|---|---:|
| ×5 | 1.74 / 67% | 1.66 | 0.95 |
| ×10 | **2.11 / 100%** | 2.43 | 0.90 |
| ×20 | 1.96 / 100% | — | 1.02 |
| ×15 | 1.91 / 75% | — | 0.98 |
| Pooled (15 rows) | **1.94 / 87%, 100% overlap** | | |

- **Age-specificity supported (preregistered rule).** MID_GREY rows below 70 (Tackling 9, Bravery
  28, Marking 49, Strength 41, Aggression 55) imply 1.018× H0, against 1.3–1.5× for Kawa and
  Ferguson at 21.
- **The regime-matched anchor also fails** (×10: A 2.43 against H0 2.11). Other-player coach
  anchoring is not supported in any form tested.
- **Transcription error, mine.** HEADING was frozen as MID_GREY; it is WHITE for an AMC and was
  highlighted on the preview. The frozen file is left unchanged. Heading (start 84) is outside the
  decision rule, and under the correct class the frozen model gives [39.7, 58.6] against the
  observed [44, 59].

**Post-hoc comparison (not validated).** "Controls" are the 35 rows from Ferguson, Kawa and Rodger.

| Variant | CAL MAE (no Diamond) | x59 MAE / signed | Controls MAE / inside |
|---|---|---|---|
| frozen | 2.264 (2.047) | 2.342 / +2.09 | 4.990 / 59% |
| young-grey g = 0.65, knot 80 | **2.208 (1.987)** | 2.342 / +2.09 | **1.979 / 94%** |
| + young WHITE too | 2.159 (1.935) | 2.342 / +2.09 | 1.998 / 94% |
| white threshold 127 | 3.485 (3.198) | **1.802 / −0.11** | 4.715 / 65% |
| threshold 127 + young-grey | 3.429 (3.138) | 1.802 / −0.11 | 1.705 / 100% |

The young-grey term is the one structural addition that improves or leaves unchanged every
partition. It is recorded as research candidate `profiles/resource_coach_structure_candidate_20260924b.json`,
superseding the falsified N − 1 candidate. The white-threshold change helps the 23–24 Sep data but
degrades the 10–12 Sep archive at the same club level. That is an unresolved conflict between the
two periods (same offset and ages; programme mix differs) and is not adopted.

## Addendum 5: the S208–S209 archive; club level from the quality offset; HIST provenance

Record: `club-level-quality-law-20260924.json`. Archive protocol, schema and validator:
`calibration/archive-s208-s209/` and `tools/drive-data-exchange/archive-validate.mjs`.

**Club level is on every preview.** The four offsets already on record fit **offset = 5 × (club
level − 1)** exactly: own L15 = 70, association L17 = 80, L31 = 150, L54 = 265. Friends views read 70
because they render at the viewer's level. Two archive previews give offsets 40.05 (Scott Ritchie,
18 Apr) and 45.0 (Michael Benwell, 16 May). If the law holds, the club level was **9** in April and **10**
in mid-May.

**First direct check: agree.** The user's Season 209 Trophies page shows League level 10, and the
season review promotes the club to 11 for S210. Level 10 in S209 is also consistent with 15 in S214 after one
promotion per season. S208 = 9 is still to confirm. The observed levels are in
`calibration/archive-s208-s209/club-level-timeline.json`.

**Correction to addendum 3.** Addendum 3 read the grey threshold landing on quality 100 as a sign that
cost is defined in quality units. If it were, the displayed-unit thresholds at level 9 would sit 120
points higher than at level 15. Scott Ritchie's archive previews (PRV-0014/0015) rule that out:

| Displayed threshold shift | RMSE (frozen amplitude, untiered) |
|---:|---:|
| 0 | 18.2 |
| +60 | 50–57 |
| +120 | 57–77 |

The steep regime starts where it does at level 15, so **displayed-unit thresholds carry across
club levels**, and the quality-100 coincidence is specific to level 15. Pooling across levels in
displayed units is therefore not the problem.

**What differs is the dose.** With the shape frozen and Δ = 0, the per-event budget fits for the
T0 HIST previews need **0.46–0.86** of the frozen amplitude, and Scott Ritchie needs 0.54–0.60. That
compares with 40/70 = 0.57. The candidate **H-LEVEL-DOSE** (dose amplitude scales with club level) is
**untested**, because HIST carries no level. Every archive preview carries its own offset, so the
transcribed archive decides it; it will be pre-registered before the archive candidates are scored.

**HIST provenance, root cause.** HIST `PRV-0015` is identical, reading for reading, to
`Screenshot_20260418-092812.png` (18 Apr, last day of S208, age 18). Its tier T2 was attached from
`SRC-USER-20260911-005`, a source dated 11 Sep. A tier observed five seasons later was stitched onto an
April preview, which is why Scott Ritchie fitted only at Δ = 0. HIST is left unchanged. The archive
validator makes the construction impossible: the tier comes only from a card showing the identical
stats in the same season (`TIER_CARD_SEASON`, `TIER_CARD_STATE`).

**Archive inventory.** The folder holds 103 files: 73 named screenshots and 30 byte-copies named
`image.jpg` (one pair verified by SHA-256; the copies are being deleted). Captures run 18 Apr–16 May.
Both end days are season boundaries, and there are two screen resolutions. Details are in
`calibration/archive-s208-s209/PROTOCOL.md` §1.

## Addendum 6: Midgley, LJDark leo and Panic previews; the white-threshold test

The predictions were frozen at `cb238fc`/`eb7b8a4` (H0/HYG/A) and at `bd43e5e` (H0/T127, pinned by sha256).
Eleven previews were then taken at club level 15, and nothing was applied. All 45 start values equal the frozen
cards. Every preview passes the category-sum and OVR-envelope checks, and each multi-day coach showed the
registered p = 4. Scores come from `tools/resource-coach-v2/score_control_observations.py` and are stored
in `control-score-20260924-{midgley,ljdark-leo,panic}.json` and `control-score-20260924-white-threshold.json`.

**PREREG-20260924-WHITE-THRESHOLD-127: supports T127 under the registered rule.**

| Model | Scored WHITE rows | Midpoint MAE | Signed | Inside |
|---|---:|---:|---:|---:|
| H0 (WHITE threshold 132.6) | 22 | 1.710 | +0.92 | 77% |
| T127 (WHITE threshold 127) | 22 | **1.105** | −0.87 | 86% |

The margin is 0.61, against the registered 0.3, and H0 over-predicts. By the pre-registration's own consequence
clause, T127 is **not adopted**. The 10–12 Sep archive at the same club level still prefers 132.6 (CAL MAE
2.26 → 3.49 under 127). That conflict now has prospective evidence on the 127 side, and it needs a mechanism, not
a vote.

**Other-player coach anchor: revised from "falsified" to "age-conditional" (post hoc).** Pooled over every
×5/×10 control row:

| Rows | Frozen MAE | Anchor MAE |
|---|---:|---:|
| Players aged 23–26: Rodger, Midgley, LJDark leo, Panic (28 rows) | 1.90 | **1.35** |
| Kawa, age 21 (7 rows) | 10.4 | 14.7 |

Panic ×10 goes from 3.38 to 0.57. Ferguson (21) also failed under the anchor. The anchor therefore works
where the young-grey term is inactive and fails where it is active, which is consistent with a coach-efficiency
term plus the young-grey term. This pooling was not pre-registered. It is the next test to pre-register, as
young-grey + anchor against young-grey alone.

**Grey rows, open.** Panic's MID_GREY rows at 107–115 on ×5/×10 are over-predicted (implied dose 0.73–0.75).
His MID_GREY 136–138 on Defending ×20 are under-predicted (1.30). No young-grey arm applies here: these players
have no grey rows below 70, so the young-grey decision rule is not exercised by them.
