# Astra handoff — shared recommendation result

**Baseline main HEAD: `ef61637616fb743bae4e8122c9fd70a0f0033d7b`** (merge of PR #125).
Prepared by tracing actual call sites, not names. No engine, profile or calibration
change was made. This is a map, not an implementation.

---

## 1. The one-paragraph version

The **gain kernel is already shared and already proof-verified**: all three screens
reach `engineMath.combinedMultiplier` + `statGainFromBudget` through the thin
delegate `xpEngine.estimateStatGainPct`. What is duplicated is everything *around*
that kernel — budget model, talent policy, star decay, OVR rounding, condition
representation, and the training lock — and those inputs are where the screens
demonstrably disagree. `engineMath.projectCoachGains` already composes the correct
pipeline and **has no callers**. The shared result is mostly a matter of routing the
screens through composition that already exists, then deciding the policy questions
in §8.

---

## 2. Data-flow map

### Drills — `app/(tabs)/drills.tsx`

| Concern | Source |
|---|---|
| Ranking | `controller.getRecommendedDrills(player, surge)` → `roi = whiteHitFraction / conditionCost`. No XP engine, no OVR. |
| Projection | inline `projectDrillPlan()` at L131–166 |
| Budget | inline L146: `cycles × baseXpPerSession × drillXpFactor / drill.stats.length` |
| Talent | **`selectedPlayer.talent`** (stored) |
| Star decay | hardcoded `0` |
| OVR | `ovrProjector.computeOvrWithPadding` |
| Condition | `conditionEngine.sessionDrain` → range (preset panel L376) **and** `controller`'s scalar `conditionCost` (row L323) |
| Training lock | **absent** |

### Coaches — `app/(tabs)/coaches.tsx`

| Concern | Source |
|---|---|
| Stat selection | `coachScanner.scanCoachPreview` → `coachPipeline.resolveCoachStats` |
| Projection | inline `runProjection()` at L245–277 |
| Budget | **`engineMath.coachBudgetPerStat`** (geometric) — the only screen using it |
| Talent | **forced `'Normal'`** (L252) |
| Star decay | hardcoded `0` |
| OVR | `computeOvrFromStats` for *before*; **inline raw `sum/15` for *after*** (L269–272) — a third rounding variant |
| Condition | none |
| Training lock | **absent** |

### Results — `app/(tabs)/results.tsx`

| Concern | Source |
|---|---|
| Inputs | `drillPlanHistoryService` (pushed from Drills) + `coachHistoryService` (written by Coaches) |
| Projection | inline `runProjection()` at L107+, three stages: drills → coaches → tiers |
| Drill budget | inline L124, identical formula to Drills |
| Coach budget | **inline L154: `sessions × baseXpPerSession / stats.length` — LINEAR** |
| Talent | **`player.talent`** (stored) |
| Star decay | **applied**, `floor((currentOvr − ovrBase) / starOvrThreshold)` |
| 2× ad | **applied** (`twoxAd`), unique to this screen |
| OVR | `computeOvrWithPadding` |
| Training lock | **absent** |

### The fourth path nobody named — `app/(tabs)/plan.tsx`

`plan.tsx` → `investmentEngine.planPlayerInvestment` → **`ovrProjector.projectOvr`**.
This is the closest existing thing to the target: it already emits
`InvestmentStep[]` (`action`, `description`, `ovrBefore`, `ovrAfter`,
`resourcesUsed`) plus `warnings[]`, applies the 180 base-OVR training lock, and
uses `engineMath.drillBudgetPerStat`. `app/compare.tsx` → `scenarioComparator`
sits on the same stack. **Any shared result must subsume this path or it becomes a
fifth divergence.**

---

## 3. Authoritative functions

Proof-covered (Z3 / Crosshair / Dafny / TS↔Python differential via `verification/run_ts.ts`):
`engineMath`: `xpCostAtStat`, `ageMultiplier`, `talentMultiplier`, `greyMultiplier`,
`starDecayMultiplier`, `combinedMultiplier`, `coachBudgetPerStat`,
`drillBudgetPerStat`, `statGainFromBudget`, `ovrFromStats`,
`ovrFromStatsWithPadding`, `tierOvrContrib`, `baseOvrFromTotal`,
`isTrainingLocked`, `conditionDrainPct`.

Authoritative but **not** proof-covered and **not** called by any screen:
`engineMath.projectCoachGains` — the already-composed coach pipeline.

Runtime condition authority: `utils/conditionEngine` (`rawDrillDrain`,
`chargedDrainRange`, `sessionDrain`). `engineMath.conditionDrainPct` is raw-only and
does not apply the 1% minimum or surge gating — **conditionEngine is the runtime path**.

Role/whiteness authority: `utils/roleWeights` (`isWhiteStat`, `getWhiteStatKeys`,
`getAllStatKeys`, `assertEstablishedRoles`).

---

## 4. Genuine duplication

1. **Drill budget — 3 copies.** `drills.tsx:146`, `results.tsx:124`, and
   `engineMath.drillBudgetPerStat`. Verified numerically identical today
   (507.00 for 10 cycles × 4 stats). Duplication without divergence — but two of
   the three copies are outside the proof surface.
2. **Coach budget — 2 models.** `coachBudgetPerStat` (geometric) vs the inline
   linear formula in `results.tsx:154`. **Not** equivalent — see §5.
3. **OVR-after — 3 variants.** `computeOvrWithPadding` (floor), the inline raw
   `sum/15` in `coaches.tsx:269`, and `computeOvrFromStats` for the *before* value
   on the same screen. Coaches deliberately mixes floored-before with unfloored-after
   so fractional progress shows; that intent must survive, but as a stated property
   of the result, not an inline expression.
4. **Talent label tables — 2 copies, both stale and disagreeing.**
   `coaches.tsx:29` says `Slow: '×0.47'`; `results.tsx:23` says `Slow: '×0.7'`.
   `ovrProjector.projectOvr` emits a warning string hardcoding `0.70×`. The profile
   holds `0.47`. None reads the profile.

---

## 5. Demonstrated divergence

Same coach run (5 DEF stats, ×40, stat 120, age 20), re-projected by Results after
Coaches recorded it:

| Stored talent | Coaches budget | Results budget | Coaches gain | Results gain |
|---|---|---|---|---|
| Normal | 4476 | 5408 | **+59.5** | **+66.1** |
| Fast | 4476 | 5408 | +59.5 | **+74.2** |
| Slow | 4476 | 5408 | +59.5 | **+42.1** |

Two independent causes, both reproducible from the code above:
- **budget model** — geometric vs linear, ~11% on its own even at Normal;
- **talent policy** — Coaches forces Normal, Results honours the stored tier.

Results additionally applies star decay and the 2× ad multiplier that neither
other screen applies, so the drill path diverges between Drills and Results too
for any plan long enough to cross a star threshold.

**Trap for consolidation:** `tests/engine-test.ts:109` writes
`const budgetGrant = 40 * 676 / 5; // 5408` — a *linear* budget — to check the Grant
×40 calibration observations. It still passes because the observed range (57–71)
admits both models; Grant ×40 does not discriminate them. **That line is not an
endorsement of the linear model.** The discriminating observation is LJDark Leo
×114 (linear → 182 OVR vs 173 actual; geometric → 172), recorded in CLAUDE.md
Sprint 34. Do not "fix" `coachBudgetPerStat` to match that test.

---

## 6. Normal-talent policy

Applied in exactly **one** place: `coaches.tsx:252`, `const projTalent: TalentTier = 'Normal'`.
Drills, Results, `ovrProjector`/`investmentEngine` (via the `talentTier` argument)
all consume stored talent. Per CLAUDE.md only Normal (1.0) is confirmed; every other
tier is a community estimate flagged **DO NOT USE**, and `Slow: 0.47` was explicitly
invalidated in Sprint 34 as an artefact of the linear budget model.

Two live consequences:
- Results will project a Fast/Slow player with an uncalibrated multiplier.
- Coaches *displays* the stored talent label (`coaches.tsx:435`, "FROM CARD") beside
  a projection that ignored it. The UI asserts a multiplier the math did not use.

`'Unknown'` has no `talentMultipliers` entry and falls through to `1.0`, so it
coincides with the policy by accident. **Coincidence is not policy** — a shared
result should apply the policy explicitly and be able to say it did.

---

## 7. Condition range

`chargedDrainRange` is the authoritative representation and already carries its own
epistemics: `raw` (exact, matches the pre-confirm dialog), `expected` (centre),
`low`/`high` (outer envelope, n=45, widened per drill), and
`confidence: 'observed-envelope'` — provisional because the driver of the spread is
unidentified.

Where certainty currently exceeds evidence:
- `drills.tsx:323` renders each recommendation row's cost as
  `d.conditionCost.toFixed(2)}%` — that value is `calculateActualLoss`, i.e. the
  **centre only**, printed to two decimals. The preset panel two hundred lines away
  (L376) correctly shows `raw` plus `low–high BILLED`. One screen, two contracts.
- `controller.getRecommendedDrills` ranks by `roi = efficiency / conditionCost`,
  dividing by that same point estimate. The **ordering** may well be robust to the
  envelope; nobody has shown that it is. If the shared result carries ROI, it should
  either carry the ranking's sensitivity or say the ranking is ordinal only.

`surges.bundlingStatus()` deliberately withholds bundling advice because it assumed
a deterministic charge. Do not reintroduce that advice through the recommendation layer.

---

## 8. Minimum semantic contract

Meaning and invariants only — not structure, not file layout, not class shape.

1. **One budget authority per mechanic.** A coach recommendation is computed from
   `coachBudgetPerStat`; a drill recommendation from `drillBudgetPerStat`. No
   consumer may inline either formula.
2. **Talent policy is explicit and carried.** The result states which talent tier
   the projection used and whether that was the Normal-default policy or a
   confirmed observation. A result computed under the policy is invariant to the
   talent stored on the player record.
3. **Condition is a range wherever the charge is involved.** Any charged cost is
   exposed as `{raw, expected, low, high, confidence}` or an equivalent that keeps
   the envelope and its confidence reachable. A consumer may render a narrower view
   but may never *derive* a point estimate that the result did not assert. `raw` is
   exact and may be shown as such; `expected` may never be labelled "the cost".
4. **Presentation may not compute domain truth.** Screens format what the result
   asserts. OVR rounding, budget, multipliers, whiteness and lock state are decided
   once, in the domain, and travel with the result — including the deliberate
   floored-before / unfloored-after asymmetry Coaches relies on.
5. **Base state and derived state stay distinguishable.** `player.stats` is base and
   is never mutated by projection; `boosts` is a conditional overlay that never
   enters a budget, a cost or a projected stat; a projected stat value is never
   written back as an observation. (`playerService.applyAndSnapshot` is the only
   sanctioned commit path, and it snapshots first.)
6. **Unknown, unread and unobserved survive.** `talent: 'Unknown'`, an unread role
   set, an unread tier and an absent stat must each remain distinguishable from a
   confirmed value in the result. A stat absent from `player.stats` is not zero —
   today `computeOvrWithPadding` pads with `player.overall` and the drill paths
   `continue` on `undefined`; both behaviours are load-bearing.
7. **Established roles alone confer whiteness.** A learning role
   (`newRole` + `newRolePoints < 50`) contributes no white stats to any projection.
8. **Constraints are part of the answer.** The 180 base-OVR training lock is a game
   constraint, not a warning: a locked player's training recommendation is *no gain*.
   Today only `projectOvr` enforces it — Drills, Coaches and Results do not.
9. **Reasons are evidence-typed.** A reason distinguishes a calibrated fact
   (grey ×0.22, tier increments, geometric decay) from an assumption
   (`drillXpFactor = 0.3`, age brackets 17/22–23/29/30, every non-Normal talent
   tier). A recommendation may not present an assumption as a calibration.
10. **No unsupported mechanics.** Mentor stays a future typed seam. Nothing enters
    the result that is not already modelled by the engine or observed on a card.

---

## 9. Existing tests that already protect the seam

Do not duplicate these:
- `tests/engine-test.ts` — cost curve, age/talent/grey multipliers, and the Grant /
  Dallas / McCluskey calibration observations. (Read §5 before touching L109.)
- `tests/projection-test.ts` — drill intensity handling, drill-before-tier ordering,
  tier OVR contribution, and **"Training cap — drills have no effect when base OVR ≥ 180"**.
- `tests/condition-test.ts` — raw drain, the 1% minimum, surge gating, charged envelope.
- `tests/proofs/` + `verification/` — the 19 properties, and the TS↔Python
  differential over the seven engine functions.
- `tests/player-scan-state-test.ts` — the unread/observed distinctions upstream of
  the player record that contract §6 depends on.

## 10. New test added

`tests/recommendation-seam-test.ts` (3 tests, wired into `npm run test:projection`,
which CI already gates). It pins only what consolidation can silently destroy:
the authoritative coach budget and its non-equivalence to the linear formula; the
Normal-talent policy invariance (and that the policy is not vacuous); and that
charged condition is a range with confidence whose scalar collapse loses evidence.
It asserts meaning, not structure.

---

## 11. Left deliberately for Astra

1. **Does the shared result subsume `projectOvr`/`investmentEngine`, or sit beside it?**
   Subsuming is the only way plan.tsx and compare.tsx stop being a separate path,
   but `projectOvr` carries tier stepping and resource costs the three screens lack.
2. **Which way does the coach-budget divergence resolve in Results?** The evidence
   says geometric. Switching it changes numbers users have already seen in saved
   history entries. Migrate, recompute on read, or version the stored entry.
3. **Star decay and the 2× ad.** Results applies both; Coaches and Drills apply
   neither. `starDecayPerSession = 0.85` is in the profile but Sprint 31 found four
   data points fitting linear scaling without it. Decide whether these are inputs to
   the shared result or dropped pending evidence — do not quietly average the two.
4. **Does ROI ranking survive the condition envelope?** §7. Cheap to test, and it
   decides whether the shared result carries a scalar ROI at all.
5. **Where the Normal-talent policy is decided** — at the call site, in the result,
   or in the player record's read path. This determines whether a future confirmed
   talent tier is a one-line change or a three-screen change.

## 12. Files Astra will likely touch

`src/engine/engineMath.ts` (compose, don't change the verified primitives) ·
`src/logic/ovrProjector.ts` · `src/logic/investmentEngine.ts` · `src/logic/controller.ts` ·
`src/types/resources.ts` (`InvestmentStep` is the nearest existing shape) ·
`app/(tabs)/drills.tsx` · `app/(tabs)/coaches.tsx` · `app/(tabs)/results.tsx` ·
`app/(tabs)/plan.tsx` · `tests/recommendation-seam-test.ts`.

## 13. Files Astra should NOT need to touch

`profiles/game_2025.json` and `src/engine/engineConstants.ts` (calibrated constants) ·
`verification/**` and `tests/proofs/**` (unless a verified signature genuinely changes) ·
`tests/fixtures/scan-golden.json` and `src/logic/glyphCalibration.json` (frozen) ·
`src/logic/glyphReader.ts`, `playerCardParse.ts`, `playerScanState.ts`,
`playerScanPipeline.ts`, `preparePlayerScreenshot.ts`, `screenshotPixels.ts` (settled) ·
`src/utils/conditionEngine.ts` mathematics (consume `chargedDrainRange`, do not re-derive it).

---

## 14. Incidental observations (recorded, not repaired)

Found while tracing; **not** fixed, because this was not a repair pass:
- `results.tsx:23` `TALENT_LABEL` says `Slow: '×0.7'`; the profile holds `0.47`.
  `ovrProjector.projectOvr` hardcodes `'0.70×'` in a warning string. Stale literals
  in presentation asserting a calibration value.
- `engineMath.projectCoachGains` has no callers.
- No screen among Drills / Coaches / Results applies the 180 base-OVR training lock.
