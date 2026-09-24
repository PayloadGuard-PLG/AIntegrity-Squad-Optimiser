# Low-stat recovery / hidden decay debt hypothesis — 2026-09-24

## Question

Does an old player's very low displayed stat become difficult to recover because seasonal decay continues in a hidden trainable coordinate after the visible stat reaches its display floor, so later coach budget must first repay hidden "debt" before a visible gain appears?

This note is research-only. It does not change production maths.

## New prospective observation

LJ Galileo (age 31, T2, DMC/MC/AMC), current card:

- Passing 170 WHITE
- Dribbling 69 WHITE
- Crossing 1 MID_GREY

Standard Attacking x25 Skill Seminar, p=3, was frozen before reveal at commit `cea38f6d4d86e2a4096712b7dc1ef54892ec5803`:

- Passing predicted +12–17
- Dribbling predicted +23–35
- Crossing predicted +23–35

Observed screenshot `64249.png`, SHA-256 `35fbb4db75c9a52984783726d1aad5210ad06c31d6bdeec88f4f6f668745dca7`:

- Passing **+15–22**
- Dribbling **+23–34**
- Crossing **+0**
- OVR **+3–5**

The same event therefore has a normal coach response on Dribbling and a positive response on Passing while Crossing is completely suppressed. A whole-coach amplitude failure is not a viable explanation.

## What the existing corpus says

A simple rule "very low displayed stats are untrainable for older players" is falsified.

Examples already in the ordinary corpus:

- G Neri, age 32, T6, Aggression 11 MID_GREY, Focused Offensive x26 -> **+14–21**.
- LJ Galileo, age 31, T2, Strength 33 WHITE, Extensive Safeguard x106 -> **+37–56**.
- LJ Galileo, age 31, T2, Tackling/Aggression 40 WHITE, x106 -> about **+37–55/56**.
- Paul Watson, age 26, T2, Passing 47 MID_GREY, x26 -> **+55–81**.
- Ryan Rodger, age 23, T0, Bravery 27 MID_GREY, x14 -> **+59–85**.
- S DarkVader, age 25, T6, Tackling 9 and Marking 21 MID_GREY, Standard Defending x20 -> **+33–49** each.

Therefore there is **no supported displayed-stat cutoff such as 10, 20, 30 or 40**.

The non-HIST corpus previously had only three [0,0] rows:

1. G Neri age 32 / T6, Finishing 407 WHITE, Focused Attacking x7 — high-stat saturation.
2. G Neri age 32 / T6, Tackling 135 WHITE, Focused Safeguard x23 — negative tier-adjusted coordinate under the research model: 135 - 160 = -25.
3. Cieran Morgan age 22 / T4, Passing 319 WHITE, Standard Attacking x5 — high-stat saturation / low dose.

Galileo Crossing 1 is a new fourth zero-gain case and is qualitatively different from the two high-stat saturation cases.

## Why high-tier zeroes can look like the same phenomenon

The current ordinary research coordinate is:

`u = displayed_stat - tier_addition` for WHITE, and `u = displayed_stat` for MID_GREY.

For Neri T6 Tackling 135 WHITE, `u = 135 - 160 = -25`. Under x23/p2 at age 32 the available lower/upper movement budget is too small to cross the rectification boundary, so the model naturally produces [0,0].

This does **not** prove that nominal tier subtraction literally reconstructs historical source-game state; that stronger reading was previously rejected. It does show that high-tier players can present a normal-looking displayed stat while the trainable/base coordinate relevant to gain is effectively below zero.

That geometry is exactly the geometry needed to explain Galileo's displayed Crossing 1 if seasonal decay can continue below the visible floor.

## Age is the amplifier, not the sole cause

The research age bands currently supported to roughly 5% are:

- 17–21: 8
- 22–25: 6
- 26–29: 4
- 30–31: 2
- 32+: 1

So the important recovery transition is **age 30**: available coach resource halves from the 26–29 band, then halves again at 32.

Today's same-coach x59 Safeguard observations provide a particularly clean illustration. On Strength, both Galileo and Ripley are in the low/flat response region:

- Galileo age 31, Strength 34 -> **+33–50**
- Ripley age 28, Strength 60 -> **+66–97**

The lower endpoint is exactly 2x and the upper midpoint is very close to 2x, matching the 4:2 age-band ratio.

Seasonal decay is separately calibrated at approximately a flat **20 points per promoted season**, white and grey alike. Thus an old player can lose the same ~20 points as a young player while having only half or one-quarter of the recovery budget.

## Quantitative hidden-debt implication from Galileo

For Galileo's x25 Crossing row, frozen M** expected raw movement about:

- lower: 22.87
- upper: 34.97

Yet the game displayed [0,0].

If visible gain is rectified at zero and then nearest-rounded, an upper movement of zero requires the hidden coordinate to be roughly:

`u_hidden + 34.97 < 0.5`

so:

`u_hidden < -34.47`.

Under a floor renderer the bound is about `u_hidden < -33.97`.

Therefore, **if hidden floor debt is the mechanism, Galileo's Crossing state is not merely "1"; it behaves as though the trainable coordinate is at least ~34 points below zero**.

That is on the order of two 20-point seasonal decrements after a stat has already reached the visible floor. The exact number of seasons cannot be identified from this one preview.

## Hypotheses after the new evidence

### H0 — fixed visible low-stat threshold
"Below displayed stat X, old players cannot train."

**Falsified as a general rule.** Age-32 stat 11, age-31 stat 33/40 and younger stat 9/21 all show positive gains.

### H1 — hard display-floor lock
"A stat displayed at 1 is simply blocked by Resource Coaches."

**Open.** Galileo is the first clean stat=1 ordinary preview in the scored set.

### H2 — hidden seasonal debt below the display floor
"The UI clamps the displayed stat at a floor, but a hidden trainable coordinate continues to decay. Coach resource first repays this debt; visible gain begins only after the hidden coordinate crosses the renderer boundary."

**Supported as the strongest current explanation**, because it unifies:
- Galileo Crossing 1 -> +0 despite a normal same-event coach response;
- Neri's high-tier negative-coordinate [0,0] case;
- the confirmed flat seasonal loss;
- the sharply lower age resource at 30+;
- positive gains on other old low stats that have not accumulated equivalent debt.

It remains a hypothesis because the hidden coordinate is not directly observed.

## Decisive matched falsifier already available

Lt Ripley is nearly ideal:

- age 28
- T2
- DMC/MC/AMC
- Crossing **1 MID_GREY**
- same current Standard Attacking x25 Skill Seminar
- same p=3

This controls displayed stat, class, tier, roles, coach definition, multiplier and affected-stat count while moving from age 31 to age 28 and changing player history.

Frozen no-debt M** prediction should be approximately:

- Passing 94 WHITE -> **+46–69**
- Dribbling 104 WHITE -> **+46–66**
- Crossing 1 MID_GREY -> **+46–70**

Interpretation:
- Ripley Crossing positive: falsifies a universal hard stat=1 lock and strongly supports hidden history/debt plus age-limited recovery.
- Ripley Crossing [0,0]: supports either a hard floor lock or comparable hidden debt in both players; a second stronger-dose test would then be required.
- Intermediate small positive Crossing: directly bounds the debt and is the most informative outcome.

## Production implication if confirmed

Do not add an arbitrary rule such as "stat < 10 => zero".

Instead add a **low-coordinate uncertainty/suppression state**:
- detect visible floor / near-floor stats in older players;
- condition uncertainty on age band and exposure N/p;
- abstain or widen until a recovery-anchor preview identifies the hidden debt;
- once one same-stat dose crosses the floor, infer an interval for the hidden coordinate and reuse it prospectively for that player/stat state.

This would preserve the current M** geometry for normal rows while isolating the rare catastrophic zero-gain miss.
