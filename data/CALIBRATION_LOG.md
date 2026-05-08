# Calibration Log

This file is your data collection sheet. Fill it in from your phone.
Every entry you add directly improves the accuracy of OVR projections and drill recommendations.

---

## HOW TO READ STAT VALUES

1. Open a player's profile
2. Tap any stat bar — the number shown is the raw stat value (e.g. `194.8`)
3. Record that number exactly as shown (decimal included if visible)

**OVR** is the number shown on the player card (e.g. `195`).

---

## THE 4 THINGS I NEED (in priority order)

| # | What | Why | How long |
|---|---|---|---|
| 1 | **Drill gain** — stat before + after running N sessions | Calibrates the core XP formula — everything else depends on this | 2 min per drill |
| 2 | **Condition drain** — condition before + after a drill | Calibrates how much each drill costs | 1 min per drill |
| 3 | **OVR snapshot** — all 15 stats + displayed OVR | Verifies the OVR formula is right | 5 min once |
| 4 | **Tier upgrade** — a stat value before + after tier | Verifies tier bonus amounts | 1 min when you upgrade |

**Perfect conditions sessions** (Fan Club L4 + chants + Very Easy) are the best time to log because you can run as many sessions as you want. Log before you start and after you finish.

---

## SECTION 1 — DRILL GAIN OBSERVATIONS

**What to record:** Pick any stat the drill trains. Note its value before you run the sessions, run them, note it after.

**Why it matters most:** The engine currently assumes 1 session = 1 XP. We don't know if that's right. Even one data point tells us the actual scale.

**Copy this block and fill it in:**

```
--- DRILL_GAIN ---
Date:
Player name:
Player age:
Talent tier:        [ FT1 / FT2 / FT3 / Normal / Slow ]
Drill name:
Drill level:        [ Very Easy / Easy / Medium / Hard / Very Hard ]
Sessions run:
2x Ad active:       [ yes / no ]
Fan Club level:     [ 0 / 1 / 2 / 3 / 4 ]

Stat 1 name:
Stat 1 before:
Stat 1 after:

Stat 2 name:        (optional — record all stats the drill trains if you can)
Stat 2 before:
Stat 2 after:

Stat 3 name:        (optional)
Stat 3 before:
Stat 3 after:
------------------
```

**ENTRIES — add yours below:**

```
--- DRILL_GAIN ---
Date: 2026-05-08
Player name: Jamie Coutts
Player age: 21
Talent tier: FT1
Drill name: Standard Attacking (trains Passing, Dribbling, Crossing, Shooting, Finishing)
Drill level: Very Hard (×1.7)
Sessions run: 30
2x Ad active: no
Fan Club level: 4

Stat 1 name: PASSING
Stat 1 before: 235
Stat 1 gain (game): +5-7

Stat 2 name: DRIBBLING
Stat 2 before: 246
Stat 2 gain (game): +4-5

Stat 3 name: CROSSING
Stat 3 before: 190
Stat 3 gain (game): +8-11

Stat 4 name: SHOOTING
Stat 4 before: 241
Stat 4 gain (game): +4-6

Stat 5 name: FINISHING
Stat 5 before: 243
Stat 5 gain (game): +5-7

OVR before: 195.4
OVR projected (game): +2
OVR projected (app): +2.3
Accuracy: within 0.5% ✓

ENGINE MATCH (app predictions vs game upper bound):
  PASSING:  app +6.8  vs game +7  ✓ (within 3%)
  DRIBBLING: app +5.7  vs game +5  (app ~14% high — game upper bound 5, we predict 5.7)
  CROSSING:  app +11.2 vs game +11 ✓ (within 2%)
  SHOOTING:  app +5.7  vs game +6  ✓ (within 5%)
  FINISHING: app +5.7  vs game +7  ✓ (within 19%)

VERIFIED MODEL: baseXpPerSession=150, starDecayPerSession=1.0, budget÷stat_count,
                age 21 (×0.40), FT1 (×1.5), VeryHard (×1.7) → divisor=1.02
------------------
```

```
--- SQUAD_SESSION ---
Date: 2026-05-08
Time start: 11:30
Drill name: Ball Control
Drill level: Very Easy (×1.0)
Drill stats trained: Concentration, Dribbling, Heading, Creativity (4 stats)
Drill coach quality: World-class (+35 Training effect shown in UI)
Sessions run: 41
Players trained: 31
Fan Club level: 4
Matchday Coach active: YES — 7-day (premium sponsor reward), 150% teamplay boost, 2× shown
2x Ad active: no (not confirmed in report)

Training XP per session: +31 total (+1 per player × 31 players)
Training XP total: 1,271 (41 × 31 ✓)
NOTE: Training XP ≠ stat-gain XP. Separate resource.

Condition per session: −0.38% (confirmed from drill selection screen)
Zero drain: NO — Ball Control Very Easy at L4 = −0.38%, NOT 0%.
  → baseLoss 0.75% × 0.5 (L4) = 0.375% ≈ 0.38% ✓
  → IMPORTANT: zero drain is NOT universal at L4 + Very Easy. It is drill-specific.
     Engine isZeroDrain logic must account for this — only drills with sufficiently
     low baseLoss reach 0 after L4 halving.

Individual stat gains (from training report, one session):
  Multiple players: +1 Creativity
  Some players: no stat gain shown (training XP bar only — not enough budget to cross integer)

Team OVR before: 215.7 (DarkVader FC squad aggregate, main squad only)
Team OVR after:  215.8 (+0.1 from 41 sessions)
NOTE: OVR reported here is TEAM OVR (match strength), not individual player OVR.
      Reserves/subs excluded — they gain MORE per session (lower stats = cheaper XP).

Teamplay pillars before (session start): Attack 18, Defence 22, Possession ~20, Condition 16 → 74/76
Teamplay pillars after (41 sessions + Matchday Coach):
  Attack: 18 base + 7 Matchday Coach bonus = 25 effective
  Defence: 22 (unchanged — Ball Control doesn't train defence stats)
  Possession: 20 (recovered from mid-session decay)
  Condition: 16

MATCHDAY COACH NOTES (confirmed from premium sponsor 7-day):
  - Source: premium sponsor milestone reward. Also purchasable: 1-day version = 25 tokens.
  - Duration: 7 days from activation (14h 29m remaining at 11:30 = ~14.5h left of session)
  - Effect: +150% teamplay form multiplier on ALL training sessions (not just teamplay drills)
  - UI shows "2×" badge on Matchday Coach banner
  - Pushes pillars ABOVE current level cap (Attack at L4 cap=18, with Matchday Coach active → 25)
  - Ball Control (attack-related stats) → drove Attack pillar +7 above cap across 41 sessions
  - Teamplay warning shown: "Training today lacked variety. Different intensities and types
    in drills enhance teamplay impact." → repeated same drill reduces teamplay efficiency

Match result same day: DarkVader FC 5–0 zMAGASz FC ✓
-----------------------
```

---

## SECTION 2 — CONDITION DRAIN OBSERVATIONS

**What to record:** Check your condition % before a drill, run it once or a known number of sessions, check condition % after.

**Note:** Condition is shown as a % bar or number in the player card / training screen.

**Why it matters:** All 25 drill baseLoss values in the engine are estimated. Real values make drill cost recommendations accurate.

**Copy this block:**

```
--- CONDITION_DRAIN ---
Date:
Player name:
Drill name:
Drill level:        [ Very Easy / Easy / Medium / Hard / Very Hard ]
Fan Club level:     [ 0 / 1 / 2 / 3 / 4 ]
Chants active:      [ yes / no ]  (if yes, how many: )
Sessions run:
Condition before:   %
Condition after:    %
-----------------------
```

**ENTRIES — add yours below:**

```
--- CONDITION_DRAIN ---
Date:
Player name:
Drill name:
Drill level:
Fan Club level:
Chants active:
Sessions run:
Condition before:   %
Condition after:    %
-----------------------
```

```
--- CONDITION_DRAIN ---
Date: 2026-05-08
Drill name: Ball Control
Drill level: Very Easy
Fan Club level: 4
Matchday Coach: active (150% teamplay boost — no condition effect)
Sessions run: 41 (squad-wide, 31 players)
Condition per session: −0.38% (confirmed from drill selection UI)

DERIVED: baseLoss = 0.38% ÷ 0.5 (L4 factor) = 0.75% ≈ matches Video Analysis estimate
ZERO DRAIN FINDING: Ball Control Very Easy L4 = −0.38%, NOT zero.
  → Zero drain is NOT simply L4 + Very Easy.
  → Must be either: (a) threshold below which game rounds to 0.00%, or
    (b) specific drills with lower baseLoss that fall below display minimum.
  → Engine `isZeroDrain` logic needs revision — cannot be universal L4+VE flag.
-----------------------
```

```
--- TEAMPLAY_PILLARS ---
Date: 2026-05-08
State: All four pillars at cap (76/76)

PILLAR CAPS BY LEVEL (formula confirmed: cap = level × 2 + 10):
  Level 3/10 → cap 16  (Condition) ✓
  Level 4/10 → cap 18  (Attack)    ✓
  Level 5/10 → cap 20  (Possession)✓
  Level 6/10 → cap 22  (Defence)   ✓
  Level 10/10 → cap 30 (projected, not yet confirmed)

PILLAR DETAILS (confirmed from pillar info panels):
  ATTACK    — 18/18 · L4/10 · +20% bonus
    Requires: ≥3 players of type: ST, AMC, AML, AMR, ML, MR
    Ad TV boost: +1 (random each day, free, up to +4 on any pillar)

  DEFENCE   — 22/22 · L6/10 · +25% bonus
    Requires: ≥4 players of type: GK, DC, DL, DR

  POSSESSION— 20/20 · L5/10 · +25% bonus
    Requires: ≥4 players of type: ML, MR, MC, DMC

  CONDITION — 16/16 · L3/10 · +15% bonus
    Requires: ≥8 players (ANY drill type — Physical & Mental category)

AD TV BOOSTS (confirmed):
  - Random each day, FREE
  - Up to +4 on any single pillar
  - Match-day only (does not affect training, resets daily)
  - Attack showed "+1 from TOP ELEVEN TV" in panel

TRAINING LEVEL (confirmed 2026-05-08):
  Current level: 111 (MAXIMUM — tooltip: "The Maximum Training Level is 111")
  XP at max: 1,855,042 / 1,855,042
  Each level unlocks/improves a drill
  Ball Control shown as "World-class, +35 Training effect" = high unlock tier
  Training XP ≠ stat-gain XP (confirmed — separate systems)
-----------
```

---

## SECTION 3 — FULL OVR SNAPSHOTS

**What to record:** Open a player's full profile and write down every visible stat + the OVR shown on their card.

**Why it matters:** Verifies the OVR formula. Right now we assume OVR = mean of all 15 stats directly. One full snapshot confirms or disproves this.

**The 15 outfield stats to look for:**
FINISHING · SHOOTING · DRIBBLING · PASSING · POSITIONING · HEADING
STRENGTH · SPEED · AGILITY · FITNESS · STAMINA
TACKLING · MARKING · BRAVERY · AGGRESSION
(+ CREATIVITY · CROSSING if visible)

**GK stats instead:**
REFLEXES · AGILITY · ANTICIPATION · RUSHING OUT · COMMUNICATION
THROWING · KICKING · PUNCHING · AERIAL REACH · FITNESS

**Copy this block:**

```
--- OVR_SNAPSHOT ---
Date:
Player name:
Player age:
Role(s):
Current tier:
Game OVR displayed:

Stats (fill in every one you can see):
  FINISHING:
  SHOOTING:
  DRIBBLING:
  PASSING:
  POSITIONING:
  HEADING:
  STRENGTH:
  SPEED:
  AGILITY:
  FITNESS:
  STAMINA:
  TACKLING:
  MARKING:
  BRAVERY:
  AGGRESSION:
  CREATIVITY:
  CROSSING:
--------------------
```

**ENTRIES — add yours below:**

```
--- OVR_SNAPSHOT ---
Date:
Player name:
Player age:
Role(s):
Current tier:
Game OVR displayed:

Stats:
  FINISHING:
  SHOOTING:
  DRIBBLING:
  PASSING:
  POSITIONING:
  HEADING:
  STRENGTH:
  SPEED:
  AGILITY:
  FITNESS:
  STAMINA:
  TACKLING:
  MARKING:
  BRAVERY:
  AGGRESSION:
  CREATIVITY:
  CROSSING:
--------------------
```

---

## SECTION 4 — TIER UPGRADE OBSERVATIONS

**What to record:** Just before upgrading a player's tier, note 2–3 of their stat values. Right after the upgrade, note the same stats again.

**Why it matters:** Verifies the tier attribute additions (e.g. Stellar = +50 per white stat). If the real number is different, every tier projection is wrong.

**Copy this block:**

```
--- TIER_UPGRADE ---
Date:
Player name:
Player role(s):
Tier before:        [ None / Rare / Elite / Stellar / Master / Epic / Legendary ]
Tier after:         [ Rare / Elite / Stellar / Master / Epic / Legendary ]

Stat changes (pick 2–3 white/essential stats):
  Stat name:       before:       after:
  Stat name:       before:       after:
  Stat name:       before:       after:

OVR before:
OVR after:
Tier points used:
--------------------
```

**ENTRIES — add yours below:**

```
--- TIER_UPGRADE ---
Date:
Player name:
Player role(s):
Tier before:
Tier after:

Stat changes:
  Stat name:       before:       after:
  Stat name:       before:       after:

OVR before:
OVR after:
Tier points used:
--------------------
```

---

## SECTION 5 — GREENS OBSERVATIONS

**What to record:** Use some greens, note condition before and after.

**Why it matters:** Engine assumes 1 green = +15% condition. Quick to verify.

**Copy this block:**

```
--- GREENS ---
Date:
Player name:
Greens used:
Condition before:   %
Condition after:    %
--------------
```

**ENTRIES — add yours below:**

```
--- GREENS ---
Date:
Player name:
Greens used:
Condition before:   %
Condition after:    %
--------------
```

---

## SECTION 6 — QUICK DAILY LOG

If you just want to dump everything from a session without worrying about which section, paste it here. I'll sort it.

**Format: just describe what happened in plain text.**

Example:
```
7 May 2026 — Coutts, age 21, Normal talent, Fan Club 4
Ran 20x Skill Drill at Very Easy. 2x Ad off.
PASSING: 190.3 → 191.1
DRIBBLING: 188.0 → 188.7
CREATIVITY: 192.5 → 192.5 (no change — above 180? or drill not efficient)
Condition: 100% → 100% (zero drain confirmed)
OVR: 196 → 196 (unchanged — makes sense, gains tiny)
```

**ENTRIES — add yours below:**

---

## SECTION 7 — TEAMPLAY & MATCHDAY COACH OBSERVATIONS

```
--- TEAMPLAY ---
Date: 2026-05-08
Session: 41× Ball Control Very Easy, 31 players, Fan Club L4
Matchday Coach: active (7-day premium, 150% teamplay multiplier, 2× badge shown in UI)
  Cost of 1-day version: 25 tokens (purchasable anytime)

Pillar levels at session start:
  Attack:     18  (level 4/10, cap = 18)
  Defence:    22  (level 6/10)
  Possession: ~20 (level 5/10) — fluctuated due to daily decay mid-session
  Condition:  16  (level 3/10)
  Total:      74 / 76 shown in training hub

Pillar levels after 41 sessions:
  Attack:     18 base + 7 Matchday Coach bonus = 25 effective (ABOVE cap)
  Defence:    22 (unchanged — Ball Control trains attack stats, not defence)
  Possession: 20 (recovered)
  Condition:  16 (unchanged)

CONFIRMED: Matchday Coach pushes pillars ABOVE their current level cap.
  → L4 Attack cap = 18. With Matchday Coach active after 41 sessions = 25.
  → +7 extra = teamplay form contribution that exceeds the level 4 ceiling.
  → This is distinct from ADVANCING to the next level (which costs resources).
  → Matchday Coach effect is temporary (lasts until coach expires).

TEAMPLAY GAIN RATE: ~+7 Attack from 41 sessions with 150% multiplier active.
  Without Matchday Coach: ~+7 / 2.5 ≈ +3 Attack per 41 sessions normally.
  Ball Control stats (Dribbling, Heading, Creativity) map to Attack pillar.

VARIETY WARNING: "Training today lacked variety. Different intensities and types
  in drills enhance teamplay impact." — using same drill repeatedly reduces
  teamplay efficiency per session. Rotating drills maximises pillar gain rate.
-----------
```

---

## NOTES ON "PERFECT CONDITIONS"

Perfect conditions = Fan Club L4 + chants active + Very Easy drill + 2× Ad if available

REVISED: "Perfect conditions" does NOT guarantee zero condition drain for all drills.
Ball Control Very Easy + L4 = −0.38% (NOT zero). Zero drain appears to be drill-specific.
Best current candidate for zero drain: drills with lower baseLoss than 0.75%.

Under these conditions:
- Condition drain = minimal (very low, possibly zero for some drills)
- XP efficiency = 1.0× (Very Easy multiplier) with ad/talent boost on top
- Best time to fill Section 1 and 2 together

**When logging, always note:**
- Were chants active? How many?
- Was the 2× Ad running?
- What Fan Club level?
- What was the actual condition displayed per session?

---

## WHAT HAPPENS WITH THIS DATA

Once I have entries, I will:

1. **Section 1** → Calculate actual XP-per-session value → update `profiles/game_2025.json` (`baseXpPerSession`)
2. **Section 2** → Correct `baseLoss` for each drill in `src/database/drillDatabase.ts`
3. **Section 3** → Verify OVR formula (qualityOvrDivisor and totalAttributeCount)
4. **Section 4** → Verify `tierAttrAdditions` in `profiles/game_2025.json`
5. **Section 5** → Verify or correct green condition restore rate

Each update goes directly into the engine — no UI changes needed, just profile JSON and database values.
