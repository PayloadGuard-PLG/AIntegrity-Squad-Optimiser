# Calibration Log

This file is your data collection sheet. Fill it in from your phone.
Every entry you add directly improves the accuracy of OVR projections and drill recommendations.

---

## HOW TO READ STAT VALUES IN-GAME

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
Drill name: Standard Attacking (game coach — trains Passing, Dribbling, Crossing, Shooting, Finishing)
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

## NOTES ON "PERFECT CONDITIONS"

Perfect conditions = Fan Club L4 + all chants active + Very Easy drill + 2× Ad if available

Under these conditions:
- Condition drain = 0% (you can drill indefinitely)
- XP efficiency = maximum for the drill level
- Best time to fill Section 1 and 2 together

**When logging perfect conditions, always note:**
- Were chants active? How many?
- Was the 2× Ad running?
- What Fan Club level?

---

## WHAT HAPPENS WITH THIS DATA

Once I have entries, I will:

1. **Section 1** → Calculate actual XP-per-session value → update `profiles/game_2025.json` (`baseXpPerSession`)
2. **Section 2** → Correct `baseLoss` for each drill in `src/database/drillDatabase.ts`
3. **Section 3** → Verify OVR formula (qualityOvrDivisor and totalAttributeCount)
4. **Section 4** → Verify `tierAttrAdditions` in `profiles/game_2025.json`
5. **Section 5** → Verify or correct green condition restore rate

Each update goes directly into the engine — no UI changes needed, just profile JSON and database values.
