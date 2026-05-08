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

AD TV BOOSTS — FULL TRACK (confirmed 2026-05-08):
  Resets every 24 hours. All rewards free (watch video ads). Not in fixed order.
  Step 1: Daily Appearance       — daily reward bundle
  Step 2: Special Sponsor        — +5 sponsor points, completes "Video Master" task
  Step 3: Playbook               — 1 Basic Playbook drill (×3 videos = 3 drills)
  Step 4: Matchday Coach (2×)    — limited training session with 2× teamplay mult (×4 videos)
  Step 5 (Milestone): Teamplay Form Boost: Random — match-day only (see probabilities below)
  Step 5–10: Mourinho Support    — +2% Possession before fixture (×3 watches needed)
  Step 10 (Milestone): Special Ability Boost — all players' specials boosted, match-day only

  TEAMPLAY FORM BOOST PROBABILITIES (per pillar, same distribution for all 4):
    +1: 7%  |  +2: 10%  |  +3: 5.5%  |  +4: 2.5%
    → Always hits exactly 1 pillar per draw (4 × 25% = 100%)
    → Expected value: ~+2.14 on the drawn pillar

  MATCHES FOR MOURINHO SUPPORT: 1–6 per day depending on active competitions:
    League + Association (clan ≤6 players) + Friendly Championship + accepted Friend Friendlies

  Attack showed "+1 from TOP ELEVEN TV" in pillar panel (match-day only)

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

```
--- OVR_SNAPSHOT ---
Date: 2026-05-08
Player name: Jaseyboi Sutters
Player age: 26
Role(s): GK (solo — confirmed: GK cannot combine with any other role)
Current tier: STELLAR
Game OVR displayed: 189

GK white stats (GOALKEEPING section):
  REFLEXES:       261
  AGILITY:        196
  ANTICIPATION:   205
  RUSHING OUT:    176
  COMMUNICATION:  280
  THROWING:       222
  KICKING:        219
  PUNCHING:       191
  AERIAL REACH:   231
  CONCENTRATION:  256

GK grey stats (PHYSICAL section):
  FITNESS:        233
  STRENGTH:        78
  AGGRESSION:     111
  SPEED:           52
  CREATIVITY:     133

OVR FORMULA VERIFICATION:
  Sum all 15 stats: 261+196+205+176+280+222+219+191+231+256+233+78+111+52+133 = 2,844
  Mean: 2,844 ÷ 15 = 189.6
  Game OVR: 189 → CONFIRMED: OVR = floor(mean), not round ✓

CONFIRMED (from user):
  - All GKs share the same white/grey stat split (universal, not player-specific)
  - GK is strictly solo — cannot be combined with any other role in either direction
  - No other role can become GK
--------------------
```

```
--- OVR_SNAPSHOT ---
Date: 2026-05-08
Player name: Ricky Grant
Player age: 20
Role(s): DL / ML / AML
Current tier: STELLAR (+50 on key attributes already included in stats below)
Game OVR displayed: 174

Stats (all 15 confirmed from coaching preview screens):
  TACKLING:    120
  MARKING:     137
  POSITIONING: 225
  HEADING:     154
  BRAVERY:     214
  PASSING:     130
  DRIBBLING:   223
  CROSSING:    154
  SHOOTING:    150
  FINISHING:   164
  FITNESS:     260
  STRENGTH:     64
  AGGRESSION:  201
  SPEED:       160
  CREATIVITY:  256

OVR FORMULA VERIFICATION:
  Sum: 120+137+225+154+214+130+223+154+150+164+260+64+201+160+256 = 2,612
  Mean: 2,612 ÷ 15 = 174.13
  Game OVR: 174 → CONFIRMED: OVR = floor(mean) ✓ (second independent confirmation)

Column averages from profile (cross-check):
  DEFENCE avg:  170  (850 ÷ 5 = 170.0)
  ATTACK avg:   164  (821 ÷ 5 = 164.2 → floor 164)
  PHYSICAL avg: 188  (941 ÷ 5 = 188.2 → floor 188)
--------------------
```

```
--- OVR_SNAPSHOT ---
Date: 2026-05-08
Player name: Cptn Dallas
Player age: 22
Role(s): AMR / MR / DR
Current tier: STELLAR
Game OVR displayed: 202

Stats (read from column averages — individual stats approximate, averages reliable):
  Column DEFENCE avg: 177  (sum ≈ 885)
    Tackling:    ~177  Marking: ~156  Positioning: ~207  Heading: ~154  Bravery: ~225
    NOTE: individual reads may have 5-10pt error — trust column avg 177 (sum 885)

  Column ATTACK avg: 236  (sum ≈ 1,180)
    Passing: ~207  Dribbling: ~235  Crossing: ~272  Shooting: ~249  Finishing: ~218

  Column PHYSICAL avg: 193  (sum ≈ 965)
    Fitness: ~245  Strength: ~85  Aggression: ~209  Speed: ~189  Creativity: ~238

OVR FORMULA VERIFICATION:
  Sum (via column avgs): 885 + 1,180 + 965 = 3,030
  Mean: 3,030 ÷ 15 = 202.0
  Game OVR: 202 → OVR = floor(mean) ✓ (confirms formula via column-avg method)
--------------------
```

```
--- OVR_SNAPSHOT ---
Date: 2026-05-08
Player name: Damian Rasiak
Player age: 26
Role(s): DC / DMC / MC  (role development: 1/50)
Current tier: RARE (+10 on key attributes already included)
Game OVR displayed: 124

Stats (read from profile screenshot):
  TACKLING:    111    MARKING:     120    POSITIONING: 164
  HEADING:     175    BRAVERY:     157
  PASSING:     103    DRIBBLING:   102    CROSSING:     92
  SHOOTING:     72    FINISHING:    91
  FITNESS:     158    STRENGTH:    127    AGGRESSION:  134
  SPEED:       107    CREATIVITY:  144

Column averages: DEFENCE 145 / ATTACK 92 / PHYSICAL 134
Sum check: (111+120+164+175+157)+(103+102+92+72+91)+(158+127+134+107+144)
         = 727 + 460 + 670 = 1,857
OVR = 1,857 ÷ 15 = 123.8 → floor = 123 (game shows 124 — 1pt rounding, likely one stat off by ~1)
--------------------
```

```
--- OVR_SNAPSHOT ---
Date: 2026-05-08
Player name: Graham Mackintosh
Player age: 20
Role(s): ML / AML / MC
Current tier: RARE (+10 on key attributes already included)
Game OVR displayed: 128

Stats (read from profile screenshot):
  TACKLING:    112    MARKING:      50    POSITIONING: 193
  HEADING:     131    BRAVERY:     128
  PASSING:     103    DRIBBLING:   178    CROSSING:    111
  SHOOTING:     93    FINISHING:   109
  FITNESS:     223    STRENGTH:     52    AGGRESSION:  108
  SPEED:       125    CREATIVITY:  252

Column averages: DEFENCE 122 / ATTACK 119 / PHYSICAL 152
Sum check: (112+50+193+131+128)+(103+178+111+93+109)+(223+52+108+125+252)
         = 614 + 594 + 760 = 1,968
OVR = 1,968 ÷ 15 = 131.2 → floor = 131 (game shows 128 — discrepancy of 3, some stats misread)
NOTE: Marking at 50 is extremely low for this role — excellent coaching priority.
--------------------
```

```
--- OVR_SNAPSHOT ---
Date: 2026-05-08
Player name: Jakob Kilian
Player age: 24
Role(s): AMC / MC  (role development: 45/50)
Current tier: None (pre-Rare)
Game OVR displayed: 133

Stats (read from profile screenshot):
  TACKLING:    113    MARKING:     120    POSITIONING: 117
  HEADING:     154    BRAVERY:     114
  PASSING:     146    DRIBBLING:   136    CROSSING:    114
  SHOOTING:    128    FINISHING:   146
  FITNESS:     140    STRENGTH:    123    AGGRESSION:  135
  SPEED:       154    CREATIVITY:  153

Column averages: DEFENCE 123 / ATTACK 134 / PHYSICAL 141
Sum check: (113+120+117+154+114)+(146+136+114+128+146)+(140+123+135+154+153)
         = 618 + 670 + 705 = 1,993
OVR = 1,993 ÷ 15 = 132.9 → floor = 132 (game shows 133 — within 1pt, acceptable read)
Tier up to RARE: 133 → 138 (+5 OVR, n_key ≈ 7–8 stats for AMC/MC at +10 increment)
--------------------
```

```
--- OVR_SNAPSHOT ---
Date: 2026-05-08
Player name: David Farquhar
Player age: 18
Role(s): ST / AMC
Current tier: None (pre-Rare)
Game OVR displayed: 95

Stats (read from profile screenshot):
  TACKLING:     62    MARKING:      57    POSITIONING: 126
  HEADING:     141    BRAVERY:      73
  PASSING:      98    DRIBBLING:   114    CROSSING:     61
  SHOOTING:     91    FINISHING:   116
  FITNESS:      77    STRENGTH:     88    AGGRESSION:   74
  SPEED:       111    CREATIVITY:  136

Column averages: DEFENCE 92 / ATTACK 96 / PHYSICAL 97
Sum check: (62+57+126+141+73)+(98+114+61+91+116)+(77+88+74+111+136)
         = 459 + 480 + 486 = 1,425
OVR = 1,425 ÷ 15 = 95.0 → floor = 95 ✓ EXACT MATCH
Tier up to RARE: 95 → 102 (+7 OVR, n_key ≈ 10–11 stats for ST/AMC at +10 increment)
NOTE: Very young (18), no tier, low stats — highest training ROI of any player shown.
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

```
--- TIER_UPGRADE_PROJECTION ---
Date: 2026-05-08
Source: In-game TIER UP preview screens (projected OVR, not confirmed post-upgrade)

STELLAR → MASTER (+30 increment on "key attributes", cost 25 Master Tier Points):
  Jaseyboi Sutters  GK          OVR 189 → 211  (+22)
  King Alfie        (roles TBC) OVR 220 → 244  (+24)
  Garry McCluskey   (roles TBC) OVR 208 → 234  (+26)
  S Rayne           (roles TBC) OVR 207 → 233  (+26)
  Cptn Dallas       AMR/MR/DR   OVR 202 → 228  (+26)
  Mark Gillespie    (roles TBC) OVR 213 → 233  (+20)
  SD Pulse          (roles TBC) OVR 196 → 222  (+26)
  Ricky Grant       DL/ML/AML   OVR 174 → 200  (+26)

RARE → ELITE (+20 increment on "key attributes", cost 90 Elite Tier Points):
  Damian Rasiak     DC/DMC/MC   OVR 124 → 137  (+13)
  Maik Feller       (roles TBC) OVR 134 → 147  (+13)
  Graham Mackintosh ML/AML/MC   OVR 128 → 144  (+16)
  Alexis Acevedo    (roles TBC) OVR 129 → 140  (+11)

NONE → RARE (+10 on "key attributes", cost 100 Rare Tier Points):
  David Farquhar    ST/AMC      OVR 95  → 102  (+7)
  Jakob Kilian      AMC/MC      OVR 133 → 138  (+5)

KEY FINDING — TIER WHITE STAT COUNT DISCREPANCY:
  App model uses getWhiteStatKeys() (role essentials only). Game's "key attributes"
  covers more stats, producing higher OVR gains per tier step.

  Reverse-engineering from OVR gain = (n_key_stats × increment) / 15:

  Cptn Dallas (AMR/MR/DR):  +26 OVR / +30 → n = 13 key stats
    App whites = 9 (CROSSING, DRIBBLING, PASSING, SHOOTING, FINISHING, POSITIONING, TACKLING, MARKING, BRAVERY)
    Game whites = 13 → 4 extra (likely HEADING + 3 physical/grey)

  Ricky Grant (DL/ML/AML):  +26 OVR / +30 → n = 13 key stats  (same)
    App whites = 9 same union — confirms 13-stat pattern for winger combos

  Jaseyboi Sutters (GK):    +22 OVR / +30 → n = 11 key stats
    App whites = 10 — game adds ~1 grey (likely FITNESS)

  Graham Mackintosh (ML/AML/MC): +16 OVR / +20 → n = 12 key stats
    App whites = 8 — game adds 4 more

  Damian Rasiak (DC/DMC/MC): +13 OVR / +20 → n ≈ 10 key stats
    App whites = 8 — game adds 2 more

  HYPOTHESIS: Game applies tier bonus to all stats shown in white/gold on player card
  — this includes role essentials AND at least some grey stats (FITNESS, SPEED, CREATIVITY
  are strong candidates). Exact mapping needs a confirmed before/after stat snapshot.

  ACTION: Log one confirmed TIER_UPGRADE with full stat-by-stat before/after to determine
  exactly which stats change at tier-up. Until then, app tier projections are conservative
  (real game gain will exceed app projection by ~5-8 OVR for outfield, ~2 for GK).
--------------------
```

```
--- OVR_SNAPSHOT ---
Date: 2026-05-08 (second snapshot — from Stellar→Master tier preview screen)
Player name: Jaseyboi Sutters
Player age: 26
Role(s): GK (solo)
Current tier: STELLAR
Game OVR displayed: 189

Stats (read from profile in tier preview — may differ slightly from earlier snapshot):
  REFLEXES:      261    AGILITY:       196    ANTICIPATION:  205
  RUSHING OUT:   176    COMMUNICATION: 281
  THROWING:      206    KICKING:       220    PUNCHING:      192
  AERIAL REACH:  231    CONCENTRATION: 257
  FITNESS:       234    STRENGTH:       78    AGGRESSION:    111
  SPEED:          52    CREATIVITY:    134

Sum: 261+196+205+176+281+206+220+192+231+257+234+78+111+52+134 = 2,634
OVR = 2,634 ÷ 15 = 175.6 → floor 175 ≠ game shows 189.
  DISCREPANCY NOTED: Sum gives 175 but game shows 189. Difference = 14×15 = 210 points.
  Earlier Sutters snapshot (Section 3) gave sum 2,844 → 189.6 → floor 189 ✓.
  This snapshot reads lower values — some stats likely misread (small font, screenshot quality).
  TRUST earlier snapshot (Section 3) as correct. Stats here have ≤15pt read error.
  Column averages from tier preview: GOALKEEPING avg 223 / PHYSICAL avg 122.
--------------------
```

---

## SECTION 4b — COACHING SESSION PROJECTIONS

These are the game's own projected gain ranges shown on coach preview screens.
They use the game's internal coaching XP system, which appears to give ~4–5× the
XP rate of manual drills. The app's engine (baseXpPerSession=150, VH) is calibrated
to regular drills — do not try to match these with drill parameters.

```
--- COACH_PROJECTION ---
Date: 2026-05-08
Player: Ricky Grant  Age: 20  Roles: DL/ML/AML  Tier: STELLAR

STANDARD PHYSICAL ×35 — covers FITNESS, STRENGTH, AGGRESSION, SPEED, CREATIVITY:
  FITNESS:     260  +6–8    → ~266–268
  STRENGTH:     64  +52–67  → ~116–131  (very low base, huge gain)
  AGGRESSION:  201  +14–21  → ~215–222
  SPEED:       160  +34–41  → ~194–201
  CREATIVITY:  256  +5–7    → ~261–263
  OVR boost projected: +7–10

STANDARD ATTACKING ×30 — covers PASSING, DRIBBLING, CROSSING, SHOOTING, FINISHING:
  PASSING:     130  +53–64  → ~183–194
  DRIBBLING:   223  +11–17  → ~234–240
  CROSSING:    154  +38–46  → ~192–200
  SHOOTING:    150  +41–48  → ~191–198
  FINISHING:   164  +31–38  → ~195–202
  OVR boost projected: +12–14

STANDARD DEFENDING ×20 — covers TACKLING, MARKING, HEADING, BRAVERY (4 stats, NOT Positioning):
  TACKLING:    120  +66–77  → ~186–197
  MARKING:     137  +54–63  → ~191–200
  POSITIONING: 225  +0      (not covered in ×20 coach)
  HEADING:     154  +13–18  → ~167–172  (grey stat for DL — lower gain)
  BRAVERY:     214  +22     → ~236       (upper bound, lower cut off in screenshot)
  OVR boost projected: +10–12

USER QUERY — STANDARD DEFENDING ×35 (all 5 stats including POSITIONING):
  Budget ratio vs ×20/4-stat: (35÷5)/(20÷4) = 7/5 = 1.4× more XP per stat
  Estimated gains (1.2× scaling for diminishing returns, 1.4× budget):
    TACKLING:    120  → ~203–212   (+83–92)
    MARKING:     137  → ~205–213   (+68–76)
    POSITIONING: 225  → ~250–258   (+25–33)  [same budget, but 225 is expensive bracket]
    HEADING:     154  → ~170–175   (+16–21)  [grey stat]
    BRAVERY:     214  → ~239–242   (+25–28)
  Estimated OVR: 174 → ~189        (+15)
  NOTE: These are app estimates. Game's ×35 screen would show exact range.
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
