# Principia
### The Mathematical Principles of Squad Optimisation

#### SECOND EDITION, corrected and enlarged

*Being a complete statement of the model by which this application predicts the
training of players: its definitions, its constants, the laws it assumes, the
propositions that follow, and — set down with equal care — the places where it
is guessing.*

---

## To the Second Edition

The first edition described a model. This one describes a model **and the
discipline that keeps it honest**, because in the interval between the two the
same fault was caught three times wearing three different coats.

Each time, a quantity that was not known was presented as though it were: an
unobserved fraction re-labelled *exact* the moment the model's own arithmetic
produced a decimal; a star position computed from attributes that were never
read; a constant graded *calibrated* on evidence that fixed only the sign of its
effect. None was a slip of arithmetic. Each was a category error about what the
evidence supported — and each survived review until it was stated formally.

So the second edition adds **Book VI, On Knowledge and Its Absence**, which sets
out these as propositions rather than as advice. A proposition can be checked; a
sensibility cannot. It also adds **Book V**, on coach transfer, where a class of
coach was found to falsify the transfer function the app applies to all others.

Corrected in this edition:

- **Prop. XIV** — the `/100` defect is now fixed rather than merely reported,
  and carries the general lesson about differential tests (now Prop. XXV).
- **Prop. VI** — the derivation of `K` from a gain ratio is shown to be both
  arithmetically wrong and a category error, and is retired as evidence.
- **The constants table** — `baseXpPerSession` is stated as a point retained near
  the lower edge of an admitted interval, not as a confirmed value; and
  `sessionBudgetDecay` is regraded a working value, being not separately
  identified (Prop. III, Scholium).
- **Prop. XI** — the cost of an incomplete role is given in full.

Nothing in the first edition's mathematics of training required revision. What
required revision was what we claimed to know about it.

---

## Preface

This document describes one system in two parts, and the reader must not confuse them.

The first part is **mechanical**: given a player, a coach and a number of sessions,
what does the game do? This part is deterministic. Where it is calibrated, it
predicts to within a fraction of an OVR point.

The second part is **stochastic**: what does the game charge in condition for a
training session? This part is not deterministic, and no amount of further algebra
will make it so. It is reported as a range, and the range is an outer bound.

A third thing runs underneath both: the **reading** of the player card by machine
vision. Its governing principle is not accuracy but *abstention* — it must be able
to say "I did not see" and have that mean something different from "there was
nothing there."

Every quantity below is either **Confirmed** against a game observation,
**Assumed** in the absence of one, or **Falsified** and retained only as a warning.
Nothing is asserted on the authority of the community.

---

## Definitions

**I. The Attribute.** Let `s` denote the value of a single attribute (Tackling,
Passing, Fitness, …). There are fifteen attributes; `𝒜` denotes the set of them,
`|𝒜| = 15`. An attribute is an integer as displayed, but the game carries a
fractional remainder internally, which is why sums of displayed values fall
slightly short of the game's own totals.

**II. The Role.** A player holds a set of roles `R` (DC, DMC, MC, …). A role is in
one of three states, and only the first confers anything:

- **established** — the chip is rendered in colour;
- **learning** — the chip is dark and carries a counter `x/50`;
- **empty** — the chip is dark with no counter.

Let `R★ ⊆ R` be the established roles. All that follows depends on `R★`, never on `R`.

**III. Whiteness.** Each role designates certain attributes *essential*. An attribute
is **white** (key) if it is essential to *any* established role — the union rule:

```
W(R★) = ⋃_{r ∈ R★} essential(r)
```

Attributes in `𝒜` but not in `W` are **grey**. Whiteness governs three separate
things: the XP cost of training, the application of the tier bonus, and the tier's
contribution to OVR.

**IV. Age.** `a`, an integer, entering through a tabulated multiplier `α(a)`.

**V. Talent.** `τ ∈ {Fastest, Fast, Average, Normal, Slow}`, entering through `θ(τ)`.

**VI. Tier.** `T ∈ {T0 … T6}`, carrying a *cumulative* bonus `Δ(T)` applied to white
attributes only.

**VII. The Session.** `N`, the coach multiplier (×4, ×40, ×114). For drills, `n` cycles.

**VIII. The Budget.** `B`, experience points made available *per attribute*.

**IX. Condition.** `C ∈ [0,100]`, a percentage, consumed by training and restored by
restorers.

**X. The Surge.** A Fan Club benefit with two independent coordinates: a boolean
`active` (loyalty-gated, resets each season) and a level `ℓ ∈ {0..4}` (chant-driven).
A banked level confers nothing while inactive.

---

## The Constants

All values are held in `profiles/game_2025.json` and read from one place. Status is
recorded against each; a constant with no game observation behind it is marked so.

| Symbol | Name | Value | Status |
|---|---|---|---|
| `C₀` | xpCostBase | 2.94 | **Confirmed** — from a same-session gain ratio |
| `K` | xpCostDecayK | 47 | **Confirmed** — solver minimising CV across 5 observations (CV 3.2%) |
| `β` | baseXpPerSession | 676 | **Point from an interval** — admits 675–930, held near its lower edge; Prop. XXIV |
| `δ` | sessionBudgetDecay | 0.99 | **Working value** — not separately identified; see Prop. III, Scholium |
| `γ` | greyWeightMultiplier | 0.22 | **Confirmed for ordinary Academy coaching** — Grant, grey HEADING; Reward transfer is separate and unresolved |
| `α(a)` | ageTable | 1.1 / 1.0 / 0.85 / 0.72 / 0.61 / 0.5 / 0 | **Partly confirmed** — see scholium |
| `θ(τ)` | talentMultipliers | 1.5 / 1.25 / 1.1 / **1.0** / 0.47 | **Only Normal confirmed** |
| `Δ(T)` | tierAttrAdditions | 0/10/30/50/80/120/160 | **Confirmed** end-to-end |
| `ι(T)` | tierIncrements | 0/10/20/20/30/40/40 | **Confirmed** |
| `λ` | maxBaseOvr | 180 | **Confirmed** |
| `σ` | seasonDecayPerLevel | 20 (flat) | **Confirmed** |
| `L₀` | baseLossPerDrill | 0.75 | **Confirmed** — re-confirmed at 6 drills |
| `μ(i)` | condLevelMultipliers | 1 / 2 / 3 / 4 / 5 | **Confirmed** |
| `ρ(ℓ)` | fanClubCondReduction | .10 / .15 / .20 / .25 / .50 | **Confirmed** — fractions, not percentages |
| `m` | minimumConditionDrainPct | 1.0 | **Confirmed** |
| — | conditionPerRestorer | 15 | **Confirmed** |
| — | drillLevelMultipliers (XP) | 1.0 / 1.15 / 1.3 / 1.55 / 1.7 | **Assumed** |
| — | drillXpFactor | 0.3 | **Assumed** — uncalibrated |
| — | starDecayPerSession | 0.85 | **Inert** — not applied in the budget path |
| — | zeroDrainThreshold | 0.38 | **Retired** — the mechanic was patched out |
| — | chantOdds | unobserved | **Withheld** — slot reserved, not guessed |
| — | surgeLoyaltyThresholds | unobserved | **Withheld** |

---

## Axioms, or the Laws of Training

**Law I — The cost of an attribute grows exponentially with its value.**
The experience required for one further point is `C₀·e^{s/K}`. It depends on the
attribute's *value*, never on how much has already been gained this session.

*Scholium.* An earlier engine added the session's accumulated gain into the exponent,
so that the fourteenth point of a session cost some eight times the first. That is
the single largest error ever found in this model, and its correction turned a
projection of +12 into the +60 the game actually delivers.

**Law II — Efficiency factors compose multiplicatively and independently.**
Age, talent, whiteness, star decay, advertisement bonus and drill level each scale
the same divisor. No factor changes another. Tuning one is safe.

**Law III — Repetition yields diminishing returns, geometrically.**
The `k`-th session of a repeated coach delivers `δ^{k−1}` of the first session's
experience. The budget is therefore the geometric sum, not `N` times the base.

**Law IV — Quality is the mean of the fifteen.**
`OVR = ⌊ Σ𝒜 / 15 ⌋`. The floor, not the ceiling.

**Law V — The tier bonus falls upon white attributes only.**
Grey attributes receive nothing, whatever the tier.

**Law VI — Training is locked at base quality 180.**
Above it, no coach and no drill will act. Tier bonus is exempt and carries total OVR
far beyond.

**Law VII — No session is free.**
Every training session costs at least `m = 1%` condition, however small its
mechanical drain.

---

## Book I — The Training of a Single Attribute

This book defines the calibrated transfer used by **ordinary Academy Coaches**
and, where explicitly stated, drills. It does not define Reward Coach transfer.
Matched Reward previews now falsify applying the ordinary fixed-XP architecture
to that class; see the scholium after Proposition III.

### Proposition I. The cost curve.

```
cost(s) = C₀ · e^{s/K}          C₀ = 2.94, K = 47
```

The cost doubles every `K ln 2 ≈ 32.6` attribute points.

### Proposition II. The combined multiplier.

```
M = α(a) · θ(τ) · γ(w) · 0.85^{stars} · ad · drill
```

where `γ(w) = 1` for white and `0.22` for grey. Permanent-attribute projections
hold `ad = 1`; the doubling item is a match-form effect. The experience required for one point is then
`cost(s)/M`; a larger `M` means cheaper training.

**Corollary.** Under ordinary Academy transfer, a grey attribute costs
`1/0.22 ≈ 4.55×` a white one — not the
"2×" repeated in the older architecture notes. *The two statements in the project's
own documentation disagree; the calibrated constant is 0.22 and is the one in force.*

### Proposition III. The budget.

For an **ordinary Academy Coach** of multiplier `N` acting on `p` attributes:

```
E(N) = (1 − δ^N)/(1 − δ)              B = E(N)·β / p
```

**Corollary 1.** `E` plateaus at `1/(1−δ) = 100` effective sessions. Doubling `N`
from 20 to 40 raises `E` only from 18.2 to 33.1, and ×114 yields 68.2, not 114.

**Corollary 2.** This is the resolution of the long-standing "×N anomaly" — that ×20
and ×40 appeared to give similar gains. They do, and the geometry says why. It is
not star decay, which plays no part in the budget.

*Scholium — `δ` is not separately identified.* The budget depends on `δ` and `β`
only through the product `E(N)·β`, so no single session count identifies either
alone. Worse, the corpus confounds coach class with session count: the sole
observation that discriminates the geometric form from the linear one (×114) is
also the sole Extensive one, both Standard runs being low-N. A **linear** model in
which an Extensive coach pays `0.60×` the Standard per-session rate returns
`7006 × 0.598 = 4191` experience per attribute — the identical budget, hence the
identical quality. The geometric form remains the better-supported working model,
since it fits that observation where the linear one does not at the profile's `β`;
but it is **adopted, not measured**. A low-N Extensive or a high-N Standard
observation would separate them.

**Corollary 3.** For drills, `B = n·β·0.3/p`. The factor 0.3 is uncalibrated and
every drill projection inherits that uncertainty.

**Scholium: Reward Coaches are outside this proposition.** For the same Focused
Attacking ×2 Reward Coach, `p=1`, Finishing previews at 53, 86, 115, 125 and 180
repeat `[5,7]`. More decisively, the age-26 matched pair Mehlem (125 white) and
Panic (115 grey) admits a same-age grey ratio `[0.553,1.181]`, excluding `0.22`
under a player-independent budget. Mehlem and Dallas (180 white), to whom the
current table assigns the same age multiplier, require budget ratios
`[2.205,4.710]`. Thus there is no common `B` under the ordinary architecture.

Until a Reward transfer is identified, its mathematical result is only the
observed preview relation

```
R(player, attribute, coach) ∈ [lo, hi]
```

with `lo` and `hi` retained separately. It is not passed through `B`, `M` or the
training integral, and no post-action stat or OVR is projected.

### Proposition IV. The training integral.

Experience is spent one attribute point at a time, each costing `cost(s)/M` at the
value `s` then standing, until the budget is exhausted; the remainder banks as
fractional progress.

### Proposition V. The closed form.

Treating the sum as an integral, `∫ C₀e^{s/K} ds = M·B` gives

```
g(s₀, B, M) = K · ln( 1 + M·B / (K·C₀·e^{s₀/K}) )
```

**Corollary.** Across the whole operating range (`s₀` from 60 to 228, budgets to
10 000) this closed form agrees with the stepwise computation to within **0.40
attribute points**, and always slightly below it — the stepwise method charges each
point at the price of its starting value, which is the cheaper end of the step.
The closed form is therefore sound for analysis, and the stepwise form is what ships.

### Proposition VI. The ratio law, and its limits.

For two attributes trained on the same budget, the ratio of gains is **not**
`e^{Δs/K}` in general; it depends on the budget. Only in the small-gain limit
(`M·B ≪ K·C₀·e^{s/K}`) does `g ∝ M·B / (C₀ e^{s/K})` and the ratio tend to `e^{Δs/K}`.

*Scholium.* The project's notes record the derivation of `K` from an observed gain
ratio of 66/13.5 = 4.89 between attributes 108 apart, and assert
`e^{108/55} = 4.89`. **That arithmetic is wrong** — `e^{108/55} = 7.13`, and the
identification of a gain ratio with a cost ratio is a category error besides. The
constant `K = 47` now in force does not rest on that derivation but on a solver
minimising dispersion across five observations, and under it the model predicts a
gain ratio of 5.56 against the observed 4.89 — close, but not the exact agreement
the old note claimed. The note should be read as history, not as evidence.

---

## Book II — The Player Entire

### Proposition VII. Whiteness is a union over established roles only.

A learning role confers nothing until it completes.

*Demonstration.* Two players share the role set DC/DMC/MC. In one, all three chips
are established, and the game marks **13** attributes white. In the other, the MC
chip is dark and carries `2/50`, and the game marks **10** — precisely the union of
DC and DMC. The difference is Dribbling, Shooting and Speed. Four cards were read in
this way, sixty classifications in all, and the role tables reproduce every one.

### Proposition VIII. Overall quality.

```
OVR = ⌊ Σ𝒜 / 15 ⌋
```

**Corollary.** Because the game carries fractional attribute values internally, a sum
of *displayed* attributes may fall one short of the game's own OVR. This is the
long-suspected "+1 discrepancy"; it is a display artefact, not a formula error.

### Proposition IX. The tier's contribution.

```
OVR_tier = ⌊ Δ(T) · |W| / 15 ⌋          OVR_base = OVR − OVR_tier
```

The game states this split explicitly on the card.

### Proposition X. The training lock.

Training is available iff `OVR_base < 180`. Since `OVR_base` cannot be reduced at
will, and tiering raises only the tier term, **the order is forced: coach first,
tier afterwards.** It is not a strategy but a constraint.

### Proposition XI. The new-role bonus.

When a role completes and an attribute is thereby promoted to white, it receives the
*full cumulative* tier bonus `Δ(T)` at once.

**Corollary — worked.** A T3 player (Δ = 50) with DC and DMC established and MC at
2/50 holds Dribbling 134, Shooting 139, Speed 138 as grey. On completing MC these
turn white and immediately become 184, 189, 188: **+150 attribute points and +10 OVR,
before any training whatever.** Two independent routes agree:
`⌊3042/15⌋ − ⌊2892/15⌋ = 10` and `⌊50·13/15⌋ − ⌊50·10/15⌋ = 43 − 33 = 10`.
Thereafter those three also cease to cost 4.55× to train.

*Scholium.* Role count is therefore a genuine trade-off and not a thing to optimise
away: more roles divide the budget across more attributes, fewer roles concentrate
it. The engine models this correctly through `B ∝ 1/p`. But the *timing* of role
expansion is a real lever, and at high tiers it is a large one.

### Proposition XII. Seasonal decay.

Each level promoted removes a flat 20 points from every attribute, white and grey
alike. A proportional model was tested and fails by 18–26 points on high attributes.

---

## Book III — The Economy of Condition

### Proposition XIII. The raw drain.

For one drill of intensity `i`:

```
raw = L₀ · μ(i) · (1 − ρ_active)
```

where `ρ_active = ρ(ℓ)` if the Perfect Conditions surge is active, and **0 otherwise**.
For a session, raw is the sum over drills. This quantity is exact and is what the
game's pre-confirm dialog displays.

**Corollary.** Confirmed at three session sizes: a lone Medium reads −2.25%;
Easy+Medium+Medium reads −6.00%; and a six-drill mixed preset reads −12.75%, being
`1.5+2.25+2.25+1.5+2.25+3.0`. This last pins `L₀ = 0.75` and the multipliers 2, 3, 4
simultaneously.

### Proposition XIV. The reductions are fractions.

`ρ` takes the values .10, .15, .20, .25, .50 — as the surge panel states them —
and enters as `(1 − ρ)`.

*Scholium — corrected.* A parallel copy of this formula in the verification layer
divided `ρ` by 100 again, computing `(1 − ρ/100)`, and so returned 0.746 where the
truth is 0.375 — an error of a factor of two at level 4. Its Python specification
contained the identical mistake, so the differential test compared two wrong
implementations against each other and passed. The function had no runtime callers,
so no user ever saw its output; but it stood certified as verified and was not.

Both sides have now been corrected together, which is the only way the differential
test remains meaningful. Two checks establish it: the corrected engine agrees with
the runtime path to within 1e-12 across all five intensities at both L0 and L4, every
cell matching the confirmed drain table; and reintroducing the fault on one side
alone now fails with a concrete counterexample where before it passed in silence.

*The general lesson is worth more than the fix.* A differential test between an
implementation and a specification proves only that the two agree. When the same
misreading is made twice — once in each — agreement is guaranteed and the test is
vacuous. Such a test cannot be trusted until a mutation shows it can fail.

### Proposition XV. The charge is not a function of the raw drain.

The same repeated preset was charged 5, 6 and 7 percent across nineteen runs at
raw 6.00; and 10 to 14 across nine runs at raw 12.75. The means track raw
(6.16 and 12.56), so **raw is the centre of a distribution and not a bound.**

**Corollary 1.** Per-player charge is an integer. The displayed figure is the *mean
across players*: two players reading −3.50% is the mean of 3 and 4, and a
long-puzzling −10.63% is `404/38` across thirty-eight players — never any single
player's cost.

**Corollary 2.** Dispersion scales with the **number of drills**, not with raw: two
Very Easy drills and one Easy drill share raw 1.50 and do not behave alike. The
envelope in force is `±0.5 per drill` about raw, rounded outward and clamped at `m`.
It contains every one of the forty-five observed sessions and is deliberately wider
than the data.

**Corollary 3.** Below the minimum, intensity is free: a 0.375% drill and a 0.750%
drill both cost 1%. Above it they do not. The claim that Very Easy is *strictly*
dominated by Easy is therefore false in general and true only beneath the floor.

*Scholium — models falsified.* Three rules have been proposed and killed by data:
`max(raw, 1)`, which predicts charges of 1.5 and 2.25 that were never observed;
`max(1, ⌊raw⌋)`, broken by the two-player −3.50% row; and per-drill floor/ceil
dithering, which predicts 11–16 for the six-drill preset when a −10.00% row exists.
None should be proposed again.

### Proposition XVI. Bundling is withheld.

The former "zero-drain" strategy has been patched out of the game, and its successor
— packing several drills beneath one minimum charge — rests on the charge being
deterministic, which Prop. XV denies. The engine therefore returns *no*
recommendation and states its reason, rather than returning a plausible one.

### Proposition XVII. The surge board.

Six surges exist. Each has an `active` flag and a level `ℓ`; the value granted is
`levels[ℓ]` when active and **zero** when not. Only Perfect Conditions is consumed by
any calculation. Role Accelerator (20–100%) is the next that matters, since it scales
the accrual this application already models, but the accrual *rate* has never been
calibrated and it is therefore left unwired rather than wired to a guess.
Chant probabilities from the campus ball are not yet observed; the slot exists and is
marked unobserved.

### Proposition XVIII. Restoration.

`ΔC = min(15·r, 100)`. Restorers restore condition and change no attribute.

---

## Book IV — The Reading of the Card

The model above is worthless if fed bad inputs, and the inputs come from a photograph.

**Principle of abstention.** Every reader must distinguish three outcomes: a
confident reading; an *observed absence*; and a *region not read*. The first two are
data. The third is not, and must never be silently rendered as "none", "T0" or "[]".

**Principle of state, not colour.** A role chip is classified by what it *is*, not by
its hue: dark with `x/50` is learning; dark without is empty; anything confidently
present and not dark is established, whatever colour it renders in.

**Principle of derived bounds.** Class boundaries are derived at load time from a
measured corpus, with margins that narrow as observations accumulate. They are never
hand-tuned to make a case pass. Classes resting on a single observation remain
provisional, and the gaps between them are abstention territory rather than proof.

**Principle of proportional anchoring.** Regions are located as multiples of a text
box's own height, never at absolute pixel coordinates, so a reader survives a change
of device.

---

## Book V — The Transfer of Experience by Coaches

### Proposition XIX. Coach classes do not share a transfer function.

The ordinary Academy transfer — the geometric budget of Prop. III driven through
the cost curve of Prop. I — is **falsified** for Reward Coaches.

*Demonstration.* Take three matched Reward previews and solve each for the
ordinary fixed XP budget that would reproduce it, using the interval method of
Prop. XXIV: each observation is solved at its lower and its upper bound, never at
a midpoint, and the admitted budgets are then intersected.

| Observation | Efficiency `α·γ` | Admitted ordinary budget |
|---|---|---|
| Mehlem, stat 125, age 26, white | 0.610 | [ 359.5, 525.4 ] |
| Panic, stat 115, age 26, grey | 0.134 | [ 1320.9, 1930.6 ] |
| Dallas, stat 180, age 27, white | 0.610 | [ 1158.6, 1693.3 ] |

The intersection across all three is `[1320.9, 525.4]` — **empty**. No single
ordinary budget reproduces the observations, so the ordinary transfer function
does not describe these coaches.

**Corollary 1.** The contradiction does not rest on the set as a whole. Mehlem
paired with Panic is empty, and Mehlem paired with Dallas is empty; but Panic
paired with Dallas is *not*. The Mehlem observation is therefore load-bearing and
must not be dropped from the corpus.

**Corollary 2.** Falsifying a function does not supply its replacement. None is
calibrated, so a Reward Coach yields **no** projected attributes and **no**
post-action quality — only the intervals the game itself displayed. Unchanged
values would be indistinguishable from a prediction of zero gain, which is a
claim the evidence does not support either.

### Proposition XX. Classification admits three states, and the third is not the first.

A coach is `ordinary`, `reward`, or `unknown`. The third is not a synonym for the
first.

An entry recorded before coaches were classified carries no mark of which it was,
and a Reward Coach wears the same Standard/Extensive label as an ordinary one, so
after the fact the two are indistinguishable. To project such an entry as ordinary
would fabricate precisely what Prop. XIX forbids fabricating for a fresh scan. It
abstains instead, and under its own reason: one class was identified and lacks a
calibrated transfer, the other was never identified at all.

**Scholium.** The class cannot identify these rows, because the migration that
introduced the field back-filled every existing row with the literal `ordinary` —
the information was destroyed at the moment of writing. What identifies them is
the **provenance** of the classification, recorded separately, of which only
*observed* is trusted. The cost is accepted knowingly: a few correctly-classified
rows written in the interval between the two changes are demoted with the rest,
because nothing distinguishes them. Inferring the class from a label or from the
common case would be the same offence in a different coat. An un-projectable row
is honest; a wrong number is not.

### Proposition XXI. A plan containing an un-projectable action has no total.

Where a chain contains an action that cannot be projected, the chain is reported
untotalled. It is not skipped, and it is not counted as zero. A total assembled
from the actions that happened to be projectable is a fabricated figure wearing
the authority of a sum.

---

## Book VI — On Knowledge and Its Absence

*These propositions are not about football. They are the conditions under which
anything in the preceding five books may be believed.*

### Proposition XXII. Unobserved error is invariant under the addition of a known quantity.

Let a true quantity be `x = s + ε`, where `s` is observed and `ε` is not. Let a
known `g` be added. Then

```
true     = (s + ε) + g
estimate =  s      + g
error    =  ε                      unchanged, neither grown nor cancelled
```

**Therefore a computation cannot convert an unknown into a known.** No projection,
however correct, improves the evidential standing of the baseline it began from.

**Corollary — the laundering fault.** A player card displays integer attributes;
the sub-integer progress behind them is never shown. A projection adds a computed
gain to that unobserved fraction, and the result was formerly graded *exact* on
the grounds that it now carried a decimal. But the only thing a decimal
establishes is that **our own model produced it**. A model-generated fraction is
not an observation.

**Corollary — it worsens with iteration.** Under the old rule the first projection
turned integers into decimals, and every subsequent step in a chain then called a
still-unknown-by-`ε` position exact. The claim of certainty grew precisely as the
chain grew, which is the opposite of how error behaves.

**Corollary — what chaining *does* preserve.** Relative progress within a chain is
exact, because it is computed. Absolute position is not. The two must be graded
separately, and only the second inherits `ε`.

### Proposition XXIII. Substituted values do not bound.

Where an attribute was never read and its value is replaced by a stand-in, any
quantity derived from the substituted set is **not a bound in either direction**.

*Demonstration.* A bound requires that the true value lie on a known side of the
computed one. Substitution supplies no such guarantee: the unread attribute may
be higher or lower than its stand-in, so the derived position may be reached
sooner or later than stated, or not at all. It is therefore neither an upper
bound nor a lower one, and abstention is the only honest report.

**Scholium.** A stand-in may still serve for coarse display, where being roughly
right is the whole requirement. The error is to carry a display convenience into
a threshold calculation and let it arrive wearing the authority of a measurement.

### Proposition XXIV. An interval is not its midpoint.

Where the game states a range `[lo, hi]` and never states where the expectation
lies within it, a constant back-calculated from `(lo+hi)/2` manufactures a
precision the observation does not contain.

**Corollary 1.** Averaging their midpoints does not justify a narrower uncertainty,
and conceals the width of the admissible sets. The mean of several midpoints wears
the appearance of a better estimate than any one of them, and is not: it discards
precisely the information — each observation's width — that would have shown how
little the set is constrained.

**Corollary 2.** The sound method is to solve each observation for the constant
reproducing its **lower** bound and its **upper** bound, then intersect across
observations. If the intersection is empty, a mechanic is missing — and that is a
finding, reported, not averaged past. This is the method of Prop. XIX.

**Corollary 3.** Two Dallas rows display the identical interval `[4,6]` at
different attribute values. These ranges are far too coarse to carry the
precision a midpoint implies.

**Scholium.** `baseXpPerSession = 676` is accordingly a point deliberately retained
near the **lower edge** of an admitted `675–930`, rather than replaced by another
convenient one. What follows is bounded to what the constant governs: the coach
experience budget sits near the conservative edge of the admitted range,
conditional on the rest of the model being right.

### Proposition XXV. Agreement between an implementation and its specification is not correctness.

A differential test establishes that two artefacts agree. Where the same
misreading has been made once in each, agreement is **guaranteed** — and what the
test then demonstrates is agreement, not external correctness. That is a real
result, and a far weaker one than it appears: it excludes implementations that
diverge, while admitting a shared mistake untouched.

*Demonstration.* The condition-drain function divided a reduction already
expressed as a fraction by a further hundred. Its independent Python
specification contained the identical mistake. The differential test compared
them across two hundred generated cases and passed, at an error of a factor of
two.

**Corollary.** A test of this kind may not be trusted until a **mutation** has
shown that it can fail. Introducing the fault on one side alone now produces a
concrete counterexample; before the correction, the same mutation passed in
silence.

### Proposition XXVI. Evidence admits grades, and they are not interchangeable.

Every reason a projection offers carries a grade: `calibrated` — a confirming game
observation exists; `observed-envelope` — a measured spread, bounded outward;
`assumed` — no confirming observation; `unavailable` — the quantity was not
observed at all.

**Corollary — the sign is not the magnitude.** Direct observation confirms that
training grows harder once a star is crossed. That fixes the **sign** of the
effect and nothing more: any factor in `(0,1)` reproduces the same observation.
The `0.85` is therefore graded `assumed`, and the constants file records it as a
model characteristic with confirmation pending. Observing that a thing happens is
not measuring how much of it happens.

**Corollary — the grade is part of the answer.** A figure delivered without its
grade is not a smaller answer than one delivered with it. It is a different and
worse one, because it invites a confidence the evidence does not support.

---

## General Scholium

### On what is assumed

For ordinary Academy transfer, the age table is supported at 18–20 and by the
existing ordinary observations; its exact bracket boundaries remain only partly
identified. The recent ages 28, 29, 31, 32 and 35 sweep used Reward Coaches and
therefore does **not** calibrate `α(a)`: its provisional age-28/29/30+ intervals
are withdrawn. Positive Reward previews at 31 and 35 prove only that those Reward
actions can show positive gain. They do not value—or by themselves falsify—the
ordinary 30+ age multiplier. Neri's age-32, stat-407 `[0,0]` likewise does not
identify zero training. The boundary between 22 and 23 remains unknown.

**Of the talent multipliers, only Normal (1.0) is confirmed** — and it is confirmed
repeatedly, from six different players. Every other tier is a community estimate that
produces wrong answers in practice. The Slow value of 0.47 was back-calculated under
the *linear* budget model and did not survive the correction to geometric; it is
retained only so that it is not re-derived. **All projections should default to
Normal regardless of what the database stores**, unless talent has been read from the
Personal Trainer tab *and* confirmed against a before/after result.

### On the discipline of this model

Three habits do the work here, and they are worth more than any constant:

1. **A failing check is a finding, not an inconvenience.** The engine is not to be
   edited to make a proof pass.
2. **An assertion may outlive its evidence.** Three tests in this repository encoded
   expectations their evidence no longer supported — a truncation rule, a dominance
   claim, and a role count superseded by a calibration change. Each looked like a
   regression and was in fact a stale belief.
3. **Withholding is a valid output.** Where the driver of a spread is unknown, the
   honest answer is a range and a reason, not a number that looks like knowledge.

### On what would advance the model most

- One clean before/after from a player of *confirmed* non-Normal talent. Every
  projection in the application currently rests on the assumption of Normal.
- The campus ball chant probabilities, which would close the last unobserved slot in
  the surge model.
- A controlled drill run, which would calibrate `drillXpFactor` and remove the only
  wholly uncalibrated factor in the gain path.
- An ordinary (non-Reward) matched observation at an unsupported age; Reward
  previews cannot identify the ordinary age table while their transfer is open.
- A controlled ×4 against ×20 on the same player, which would put a **magnitude**
  on star decay. Its sign is observed; its `0.85` is not (Prop. XXVI).
- A matched Reward corpus large enough to identify a replacement transfer
  function, which would close Prop. XIX.

### On the standard this model is held to

Three habits do the work, and they generalise past this subject entirely:

1. **A failing check is a finding.** The engine is not edited to make a proof pass.
2. **An assertion may outlive its evidence.** Several tests in this repository
   encoded expectations their evidence no longer supported, and each looked like
   a regression when it was in fact a stale belief. A test is a claim about the
   world and decays like one.
3. **Withholding is a valid output.** Where a mechanism is unidentified, the
   honest answer is a range and a reason. A number that merely looks like
   knowledge is worse than no number, because it cannot be argued with.

To which the second edition adds a fourth, learned the hard way:

4. **Certainty must be traced to an observation, never to a computation.** The
   three faults corrected in this edition were each a case of arithmetic being
   mistaken for evidence — a decimal we generated, a value we substituted, a sign
   we confirmed and a magnitude we did not. Ask always which measurement a claim
   rests on; if the answer is *our own model*, it is not evidence.

*Hypotheses non fingo.* Where the game has not shown its hand, this model says so.
