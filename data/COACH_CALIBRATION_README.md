# Coach Calibration Data — Instructions for Claude

This file explains how to add data to `COACH_CALIBRATION.csv`.
Goal: calibrate a coaching sub-engine that accurately predicts per-stat gains from coaching sessions.

**Current calibration status:**
- `baseCoachXpPerSession ≈ 1325` (vs 150 for regular drills — ~9× more effective)
- Age multiplier: assumed same as drill engine (needs confirmation with non-age-20 player)
- Talent multiplier: assumed same as drill engine (needs confirmation with FT1/FT2/FT3/Slow player)
- Grey multiplier: coaching uses its own tier system — see FINDINGS below

---

## What a coaching preview screen shows

Open any coach in the training hub. Before starting, the game shows a preview with:
- Player card (name, age, roles, OVR, OVR boost range e.g. "+12–14")
- Three columns: DEFENSE / ATTACK / PHYSICAL & MENTAL
- Stats covered by this coach are **highlighted** (orange/active) and show `stat_value + gain_lo–gain_hi`
- Stats NOT covered show only the current value (no gain shown)

**Record every highlighted stat** from the preview. Do not record un-highlighted stats.

---

## How to add a session

1. Find the **next session_id** (look at the last S-number in the CSV, add 1)
2. Add **one row per highlighted stat**, all with the same session_id
3. Fill in every column — leave `notes` blank if nothing to add

### Column guide

| Column | What to enter |
|---|---|
| `session_id` | Sn — same for all stats in one preview screen (e.g. S5, S6…) |
| `date` | YYYY-MM-DD |
| `player_name` | Exact name from player card |
| `player_age` | Age shown on player card |
| `talent_tier` | FT1 / FT2 / FT3 / Normal / Slow |
| `two_x_ad` | yes / no — whether 2× training ad was active |
| `coach_type` | Standard / Focused / Extensive (shown in header e.g. "STANDARD DEFENDING ×20") |
| `coach_category` | Attacking / Defending / Physical / Safeguard / (other) |
| `multiplier` | The ×N number (e.g. 20 for "×20") |
| `n_stats_covered` | Count of highlighted stats on this preview screen |
| `stat_name` | ALL CAPS, exactly as in the app (e.g. TACKLING, PASSING, HEADING) |
| `stat_before` | The number shown before the + sign (e.g. 120 from "120 + 66–77") |
| `gain_lo` | Low end of the gain range (e.g. 66 from "+66–77") |
| `gain_hi` | High end of the gain range (e.g. 77 from "+66–77") |
| `ovr_before` | OVR shown on the player card (e.g. 175) |
| `ovr_boost_lo` | Low end of OVR boost shown on player card (e.g. 10 from "+10–12") |
| `ovr_boost_hi` | High end of OVR boost (e.g. 12) |
| `notes` | Any extra context — e.g. "fan club L4", "after Physical coach", "2xAd confirmed active" |

### Example (from Ricky Grant Standard Defending ×20)

```
S3,2026-05-08,Ricky Grant,20,Normal,no,Standard,Defending,20,4,TACKLING,120,66,77,175,10,12,
S3,2026-05-08,Ricky Grant,20,Normal,no,Standard,Defending,20,4,MARKING,137,54,63,175,10,12,
S3,2026-05-08,Ricky Grant,20,Normal,no,Standard,Defending,20,4,HEADING,154,13,18,175,10,12,
S3,2026-05-08,Ricky Grant,20,Normal,no,Standard,Defending,20,4,BRAVERY,214,15,22,175,10,12,
```

---

## Priority data to collect

Most valuable first:

| Priority | What | Why |
|---|---|---|
| 1 | Same coach on a player aged 17 or 18 | Confirms age multiplier (age 20 = 0.55×; age 18 = 1.0×) |
| 2 | Same coach on FT1 or FT2 player | Confirms talent multiplier carries over to coaching |
| 3 | Standard Defending ×35 (5 stats incl. POSITIONING) | Fills in the ×35 screen we're missing for Ricky |
| 4 | Standard Attacking on a second, different player | Cross-validates baseCoachXp across coach categories |
| 5 | Extensive coach any category | Maps Extensive vs Standard XP rate |
| 6 | Any coach where 2× ad IS active | Checks whether adMult applies to coaching |

---

## Current findings (do not need re-testing)

**baseCoachXpPerSession ≈ 1325**
Calibrated from MARKING stat across two independent sessions:
- Focused Defending ×2, MARKING 137 → +13–18: implies base = 1355
- Standard Defending ×20, MARKING 137 → +54–63: implies base = 1295
- Average: ~1325. Cross-validation: TACKLING +68.0 predicted vs +66–77 game ✓

**Coaching grey multipliers (differ from drill engine):**

Each coach applies its own priority tier to the stats it covers:

| Tier | Mult | Evidence |
|---|---|---|
| Primary (core coach focus) | 1.0× | TACKLING, MARKING in Standard Defending ✓ |
| Secondary | 0.5× | BRAVERY in Standard Defending ✓; POSITIONING in Focused Defending ✓ |
| Tertiary | 0.25× | HEADING in Standard Defending ✓ |

Mapping of which tier applies to which stat **per coach type** is the main thing still needed.

**Known coach stat tiers:**

| Coach | Primary (1.0×) | Secondary (0.5×) | Tertiary (0.25×) |
|---|---|---|---|
| Standard Defending ×20 | TACKLING, MARKING | BRAVERY | HEADING |
| Focused Defending ×2 | MARKING | POSITIONING | — |
| Standard Physical ×35 | ? | ? | ? |
| Standard Attacking ×30 | ? | ? | ? |

Fill in the Physical and Attacking tiers once back-calculation is run on S1/S2 data.

---

## How to run calibration after adding data

Once new rows are added, a Claude agent can run:
```bash
node /tmp/calibrate.mjs
```
(or ask Claude to write a fresh calibration script reading from this CSV)

The calibration script back-calculates `baseCoachXpPerSession` from each row using:
```
xpNeeded = cost_to_gain(stat_before → stat_before + gain_mid, greyMult)
baseCoachXp = xpNeeded × n_stats_covered / multiplier
```
Consistent values across rows = model is correct. Inconsistent = multiplier or grey tier is wrong for that stat.
