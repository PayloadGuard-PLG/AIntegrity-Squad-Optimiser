# Resource Coach V2: first offline test release

The Coaches tab now uses the supplied integrated two-regime interval predictor for explicitly ordinary Academy resource coaches. This is an experimental preview predictor, not an identified exact game formula. Reward and unresolved transfer classes are excluded.

## In the app

1. Open Coaches and select the current player. Verify their age, tier, active roles and current stat values on the player card.
2. Scan a coach or choose its shape/category and **exact affected stats**. All-Round is available; targeting is editable across all 15 stats, without a hard-coded two-stat limit.
3. Enter the displayed **multiplier**, not a session count. Confirm Academy versus Reward from game evidence. Confirm white/grey for each affected stat; defaults are explicitly labelled **ROLE MAP**, and tapping a row changes its class for this test only.
4. Press **PROJECT & SAVE PREDICTION** before looking at a new preview where possible. The snapshot retains the input state, full interval forecast, model version and any separate anchor ID. The approximate OVR boost is the sum of affected-stat endpoints divided by 15.
5. Enter the game's actual low/high preview bounds, plus the separately displayed OVR boost if available. Check the confirmation button and save. Scanned ranges are prefilled only while player, coach label, multiplier and affected-stat set still match the scan. Unknown rows can remain blank. Observations are never averaged.
6. To calibrate, save a complete clean ordinary preview and press **USE SAVED PREVIEW AS SEPARATE ANCHOR**. Focused Offensive ×26 with two stats is the validated preferred anchor when available. Select a **different** preview to test. The same preview remains cold-start even if renamed or reordered.
7. Export the player's JSON test data using **EXPORT PLAYER TEST DATA**. Predictions and observations stay separate; observations can link to the prior prediction ID. The share sheet is user-controlled, and selectable JSON is also displayed.

The runtime fits only two regularized player offsets. Anchors are invalidated by age, tier, active-role or stat-state changes, and by model-version changes. They are deliberately more conservative than lifetime player factors. A zero-gain anchor is preserved as evidence but cannot be fitted. Directly observed zero-gain cases are shown as unresolved suppression rather than overwritten with model numbers.

The app's manual Training Rate selector is not an input. Predicted ranges cannot be applied to the player card as if they were actual gains. Drill planning and legacy Results replay remain on their existing domain paths in this first release; resource-coach v2 testing lives in Coaches and its separate evidence store.

## Mathematics

Let `x = displayedMultiplier / affectedStatCount`, `u = displayedStat - tierAddition` for WHITE and `u = displayedStat` for MID_GREY. Negative `u` is preserved: this is the fitted covariate, not a reconstructed historical base value.

`S = highRateAge28 * exp(highAgeLogSlopePerYear * (age-28) + logHighOffset)`

`V = lowRateAge28 * exp(lowAgeLogSlopePerYear * (age-28) + logLowOffset)`

For each latent endpoint `z` in `[1, upperLatentRatio]`, set `h = K*log(S/V)`, `b = x*w*V*z`, `gap = max(h-u, 0)`. White exposure has `w=1`; grey uses the supplied fitted coefficient.

If `b <= gap`, gain is `b`. Otherwise it is:

`gap + K*log1p((b-gap)/K * exp(-max(u-h,0)/K))`.

The supplied v2 deployment profile clips gain to `max(0,400-u)`. The recovered research inverse and holdout script are uncapped; that deployment difference is explicitly recorded. Unknown display class abstains in the app instead of the research population mixture. Neither change is relabelled as additional holdout validation. Ages outside 18–32 abstain.

The supplied 133-row corpus was used locally without rewriting observations or assigning the unresolved display class. The public change contains numeric model parameters and synthetic tests only; uploaded player records and the research archive are not included.

## Storage and OTA

The supplied additive SQL has been repaired: OVR evidence now references a unique preview parent instead of the non-unique observation ID of a per-stat table. It also adds immutable prediction snapshots, a preview input snapshot, and serialized calibration scope. The SQL and Metro-bundled schema string are tested for equality. SQLite writes are transactional and errors are shown. Old `squad_plan_runs` and coach scan history are preserved.

The schema initializes idempotently when the v2 service is first used. It does not run the destructive generated-schema diff described in the existing database code. No native dependency, Expo SDK, runtime version or EAS channel changes are required. Future parameter revisions must use a **new modelVersion** so saved anchors and predictions remain interpretable.

The existing repository workflow publishes an Android update to EAS branch `preview` on a push to `main`. Opening this PR does not publish an OTA. After review and merge, check that EAS Update completes and the installed binary uses the matching runtime/channel. Open the app online to download the update, relaunch, then test offline.

## Validation

- All 132 known-class intervals agree with the recovered independent Python inverse to less than `1e-9` before deployment clipping.
- The TypeScript two-offset optimizer agrees with independent SciPy fits to within `0.005` log-offset units on eligible preferred anchors.
- Separate-anchor replay reproduces the supplied 84 target-interval results: cold endpoint MAE **6.6934**, calibrated **2.8569**, overlap **92.857%**; 8 OVR intervals have calibrated endpoint MAE **0.7041**. These are retrospective preview metrics, not guarantees about actual training outcomes.
- 10 public synthetic mathematical/persistence tests pass, including unknown-class abstention, cap coordinates, exposure allocation, anchor isolation/expiry, invalid interval rejection, foreign keys, restart persistence and legacy preservation.
- 150 existing boundary/identity/ingestion tests pass. The standalone projection suite passes 53 checks and the standalone scanner suite passes 60.
- TypeScript typecheck and Android Hermes bundle export pass.
- Browser visual verification was attempted but its daemon could not start in this environment. Physical Android layout, photo-picker/OCR interaction, share-sheet behaviour, OTA delivery and airplane-mode operation still require device testing.

Run `npm run test:resource-coach` on Node 24, `npm run typecheck`, and the existing projection/scanner suites. Public independent reference reproduction: install NumPy/SciPy and run `python tools/resource-coach-v2/generate_synthetic_reference.py`. It numerically integrates the cost function and inverts it with Brent’s method across 30 synthetic inputs. The supplied separate-anchor validation was repaired and run locally against the recovered archive, but those source records are not published here.
