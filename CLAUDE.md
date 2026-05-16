# AIntegrity Squad Optimiser — Developer Notes

Persistent findings from game-play analysis and OCR debugging. Read this before touching scanner logic.

---

## Game Layout: Coach Preview Screen

### Stat Grid — 3-Column Layout
The coach preview shows stats in **3 side-by-side columns**:

```
DEFENSE          ATTACK           PHYSICAL & MENTAL
─────────────    ──────────────   ─────────────────
Tackling  57 +57-71   Passing   72           Fitness   80
Marking   60          Shooting  68           Stamina   75
...                   ...                    ...
```

**Critical for OCR:** Stats in different columns share the same Y coordinate per row.
When Tackling (col 1) has `+57-71`, that gain range is at the same Y as Passing (col 2).
The scanner MUST filter `t.left > tok.left` when collecting rowTokens, or it will pick up the
wrong column's gain range as if it belonged to the current stat.

Fix is in `src/logic/coachScanner.ts`:
```typescript
const rowTokens = tokens.filter((t, idx) =>
  !consumed.includes(idx) &&
  Math.abs(t.top - tok.top) < Y_TOL &&
  t.left > tok.left   // ← ESSENTIAL: only look RIGHT of the stat name
);
```

### Highlighted vs Non-Highlighted Stats
- **Highlighted** (the coach is boosting this stat): `StatName CurrentValue +lo-hi` (inline, same row)
- **Non-highlighted**: `StatName CurrentValue` only — no gain range shown

### Coach Counts by Type
- **Standard coach**: boosts all 5 stats in its category (e.g. all 5 DEFENDING stats)
- **Focused coach**: boosts 1–2 stats (randomly selected within category)
- **Extensive coach**: boosts all stats with higher multiplier

### Coach Header Format
OCR may split this across multiple lines:
```
Standard / Focused / Extensive   [line break possible here]
Attacking / Defending / Physical / Safeguard   [line break possible here]
×N
```
**Do NOT use a single combined regex** — use independent matches for type, category, multiplier.
See `src/logic/coachScanner.ts` — each component matched separately from `fullText`.

---

## Game Layout: Player Card / Profile Screen

### Role Detection
The game sometimes displays multiple roles as a single OCR token: `"DL ML AML"` (space-separated on one line).
The scanner must split on whitespace AND other delimiters:
```typescript
t.text.toUpperCase().split(/[\s,./|]+/).forEach(part => {
  if (part.trim() && roleSet.has(part.trim())) foundRoles.add(part.trim());
});
```

### Player Name Detection
- Player name is always the **topmost** title block on the card
- Sidebar text (e.g. "Goal Celebrations", "Personal Trainer", "Special Ability") may appear as title-case OCR blocks
- Strategy: collect all plausible name blocks, pick the one with smallest `frame.top`
- Compound phrases in blocklist must use `.includes()` not `===` equality check

### Tier Display
The **game still shows old tier names** (None, Rare, Elite, Stellar, Master, Epic, Legendary) on player cards.
`KNOWN_TIERS` in `playerScanner.ts` must match these game strings.
`TIER_NAME_MAP` then converts them to T0–T6 before returning from the scanner.
Do NOT change `KNOWN_TIERS` to T0–T6 — the scanner reads game text.

---

## Tier System

### Mapping (game name → internal code)
| Game Display | Internal | Colour |
|---|---|---|
| None | T0 | `#6b7280` grey |
| Rare | T1 | `#60a5fa` blue |
| Elite | T2 | `#34d399` green |
| Stellar | T3 | `#22d3ee` cyan |
| Master | T4 | `#a78bfa` purple |
| Epic | T5 | `#fb923c` orange |
| Legendary | T6 | `#fbbf24` gold |

### Files Using TierName
`TierName = 'T0'|'T1'|'T2'|'T3'|'T4'|'T5'|'T6'` defined in `src/types/resources.ts`.
Any file with old tier name strings (None/Rare/Elite/Stellar/Master/Epic/Legendary) is a bug.
Runtime fallback for DB rows with legacy values: `normaliseTier()` in `src/services/playerService.ts`.

---

## Role-Based Stat Whiteness

`isWhiteStat(roles, statName)` returns true if the stat is essential for **any** of the player's roles
(union rule — DL+ML+AML unlocks whites from all three positions).

`getAllStatKeys(roles)` returns only role-relevant stats — NOT all 15 game stats.
Example: `getAllStatKeys(['DL','ML','AML'])` does NOT include HEADING.

**Consequence for coach scanner:** A DEFENDING coach may highlight HEADING on a DL/ML/AML player.
The scanner captures it correctly; the UI shows it amber with `· NOT IN ROLE` label.

### Coaches Tab — Stat Data Architecture

`scannedStats` in `app/(tabs)/coaches.tsx` is `string[]` (stat names only).

The coach preview image contains `statBefore`, `gainLo`, `gainHi` values that **belong to whoever's player card is shown in the image**, not the selected player. These values are discarded immediately after OCR. Only stat names from highlighted rows are kept.

Projection is pure math from the selected player's DB record:
- `budget = sessionCount × profile.baseXpPerSession / scannedStats.length`
- XP engine runs per stat using `player.stats[statName]`, `player.age`, `player.talent`, role whiteness

Scan paths:
1. Unrecognised image (no type/category/multiplier + no stats) → rejected
2. Stats found → extract `.statName` from each `StatCapture`, discard all values
3. Recognised header, no highlighted rows (blank coach tile) → derive stats from `CATEGORY_STATS[coachCategory]`, filtered to stats the player actually has; falls back to white stats

`CATEGORY_STATS` constant in coaches.tsx maps each coach category to its 5 stats.

PLAYER STATS section uses `OUTFIELD_STATS` or `GK_STATS_ALL` (full 15) — not `getAllStatKeys()` which is role-filtered.

---

## Drill System

### Intensity Levels (Fixed Per Drill)
Each drill has one fixed `DrillIntensity` level per drill.
The drills tab filters to `d.intensity === drillLevel` — it does NOT weight by intensity.

| Intensity | Drills |
|---|---|
| Very Easy | Touch Training, Tactical Review, Activation |
| Easy | Run & Strike, Solo Finish, Aerial Work, Touch and Go, Porky in Centre, First Touch, Back Line Drill, Compact Block, Head Drill, Flexibility Session, Footwork Ladder |
| Medium | Target Practice, Dead Ball Practice, Endurance Loop, Wide Switch, Channel Hold, Physical Duel, Build-Up Play (Hard), Pressure Trap, Challenge Drill, Box Clearance, Win the Ball, Line Hold, Cross Defence |
| Hard | Wide Channel, Cone Weave, High Press, GK Protocol, Hurdle Work, Interval Runs, Plyometrics, Shuttle Run |
| Very Hard | Break Away, Attack Blueprint, Defence Blueprint, Weight Room, Speed Work |

Touch Training trains: `['HEADING', 'CREATIVITY', 'CONCENTRATION', 'DRIBBLING']`, intensity Very Easy, baseLoss 0.75.

### Condition Drain Formula (calibrated from game screenshots)

```
actualLoss = baseLoss × intensityMultiplier × (1 - fanReduction / 100)
```

| Intensity | baseLoss | Multiplier | Drain L0 (−10%) | Drain L4 (−50%) |
|---|---|---|---|---|
| Very Easy | 0.75 | ×1 | 0.675% | **0.375% → ZERO DRAIN** |
| Easy | 0.75 | ×2 | 1.35% | 0.75% |
| Medium | 0.75 | ×3 | 2.025% | 1.125% |
| Hard | 0.75 | ×4 | 2.70% | 1.50% |
| Very Hard | 0.75 | ×5 | 3.375% | 1.875% |

Fan club reductions: `{ L0: 10%, L1: 15%, L2: 20%, L3: 25%, L4: 50% }` — confirmed from screenshots.
Zero-drain threshold: `actualLoss < 0.38` — only Very Easy at L4 (0.375%) qualifies.
Max drain cap: Very Hard at L0 = 3.375% — naturally under 3.5% with no clamping needed.

**Items needing further calibration** (marked UNCONFIRMED):
- Age penalty on training rate — formula unknown
- XP cost curve above stat 100 — only Infinity at ≥180 confirmed
- Exact training rate multipliers for talent tiers beyond Normal/Slow

---

## Architecture Notes

### OVR Formula (confirmed from live game data)

OVR is computed in two parts and added:
```
base_quality   = min(180, floor(sum_of_base_stats / 15))
tier_contrib   = floor(tier_bonus × key_stat_count / 15)
total_OVR      = base_quality + tier_contrib
```

The game UI displays this split explicitly (e.g. "290 OVR = 152 + 138 Tier increase").
In code: `floor(sum_of_all_stats / 15)` produces the same result because tier bonuses are
baked into stats — the two representations are equivalent.

### 180-Rule (training lock)

**The 180 refers to BASE OVR (star quality), not individual stat values.**

- Stars/quality max = **180** (10 stars). Displayed as "Maximum star quality is 180."
- When base OVR ≥ 180: training via drills and academy coaches is **fully locked** (TRAIN button absent, MAX STARS shown)
- Tier bonuses push total OVR well beyond 180 — this is expected and normal (e.g. Neri at 290)
- When seasonal decay drops base OVR below 180, training resumes
- Individual stats CAN exceed 180 (Shooting 436, Finishing 446 seen in data) — the cap is on the average

Enforced in `src/logic/ovrProjector.ts`: `projectOvr()` checks base OVR before drill simulation.
The `maxBaseOvr = 180` field in `profiles/game_2025.json` is the threshold.

### Other Notes

- **Grey stats cost 2× XP** (grey weight = 0.5 multiplier vs white)
- **Tier bonus** applies to WHITE (essential) stats only — grey role stats and off-role stats receive 0 (confirmed from direct game observation)
- **Tier OVR contribution**: `floor(tier_bonus × key_count / 15)` — varies by role (10–13 key stats)
- **Condition (restorers)**: restores condition only — zero OVR change; +15% per restorer (confirmed)
- **Seasonal decay**: ~20% base OVR drop per season (unmodeled — affects base quality, not tier)
- **DB**: Drizzle ORM + expo-sqlite; migrations in `drizzle/` folder; current latest is m0007 (new_role + new_role_points columns on players)
- **Drill Presets**: stored in `drill_presets` table; service at `src/services/drillPresetService.ts`
- **New-role training**: `players.new_role` (text) + `players.new_role_points` (integer, 0–50); idempotent guard in `src/db/index.ts → ensureNewRoleColumns()`

---

## IP-Agnostic Naming (keep it this way)

The codebase is scrubbed of source-game IP. Do not reintroduce these terms:

| Source-game term | Use instead |
|---|---|
| Greens / green (the item) | restorers / restorer |
| Rest packs | recovery kits |
| Ball Control (drill) | Touch Training |
| Skill Drill | Touch Training |
| First Touch Play (drill) | First Touch |
| Piggy in the Middle | Porky in Centre |
| Video Analysis (drill) | Tactical Review |
| 1-on-1 Finishing | Solo Finish |
| Pass, Go and Shoot! | Run & Strike |
| Set-Piece Delivery | Dead Ball Practice |
| Shooting Technique | Target Practice |
| Slalom Dribble | Cone Weave |
| Wing Play | Wide Channel |
| Fast Counter-Attack | Break Away |
| Rapid Side Switch | Wide Switch |
| Stay in Lane | Channel Hold |
| Contact Play | Physical Duel |
| Passes Before Shot | Build-Up Play |
| Use Your Head (drill) | Head Drill |
| Hold The Line | Line Hold |
| Defending Crosses | Cross Defence |
| Stop The Attacker | Win the Ball |
| Press The Play | High Press |
| Goalkeeper Training (drill) | GK Protocol |
| Warm-Up (drill) | Activation |
| Stretch (drill) | Flexibility Session |
| Carioca with Ladders | Footwork Ladder |
| Long Run (drill) | Endurance Loop |
| Shuttle Runs | Shuttle Run |
| Hurdle Jumps | Hurdle Work |
| Gym (drill) | Weight Room |
| Sprint (drill) | Speed Work |
| EliteChest | PremiumChest |
| Nordeus / Top Eleven / T11 | (omit — never reference the source game) |

Match Advisor is OK to keep — it's a generic descriptor, not a protected name.

Colour names (`green`, `amber`, `red`) in UI styling are fine — they describe pixels, not items.

When adding new features, choose generic football-management vocabulary. Run
`git grep -niE '\bgreens\b|skill drill|nordeus|top eleven|elitechest'` before
committing to verify nothing crept back in.

---

## Sprint 24 Handover — XP Math, Double-Tap, Calibration DB

### What was done (Sprint 24)

**1. XP math root cause fixed** (`src/logic/xpEngine.ts` line 73)

The `estimateStatGainPct` loop was passing `starsGainedInSession + gain` to `xpNeededFor1Pct`.
Since `gain` accumulated per stat point (0→1→2→...→60), `starMult = 0.85^gain` caused each
successive point to cost exponentially more. By point 14, the per-point cost had multiplied by
~8×. This is why projections showed +12 for Tackling 122 when the game actually delivers +60+.

Fix: pass `starsGainedInSession` only (not `+ gain`). Costs now depend on STAT VALUE (not
cumulative session points), which is the correct model.

**2. baseXpPerSession** raised from 150 → 220 (`profiles/game_2025.json`)
Calibrated against Ricky Grant (Age 20) Standard Defending ×40:
Tackling 120 → +59-73 actual ↔ ~60 predicted with bXPS=220. Correct.

**3. xpCostTable high-stat entries increased** (`profiles/game_2025.json`)
Empirical evidence (Aggression 201 gaining only 14-21 pts, Creativity 256 gaining only 5-7 pts
despite high budget) shows the game's cost curve is STEEPER above 200 than original table.
Updated entries (provisional — needs more data):
  200-219: 100 → 150   |   220-239: 125 → 200
  240-259: 160 → 260   |   260-279: 200 → 340   |   280-339: 250 → 440

**4. Double-tap player selection** (`app/(tabs)/coaches.tsx`)
Single tap = select player for coaching projection.
Double tap (within 350ms) = navigate to player edit screen (`/player/[id]`).
Uses a `lastTapRef` per-session (not per-player) to detect consecutive taps on same chip.

**5. Calibration database created** (`profiles/calibration_data.json`)
All coach screenshot observations from Ricky Grant and Ryan Rodger captured with:
gainLo/Hi ranges, stat values, isWhite flags, coach type/category/multiplier, OVR.
File is NOT loaded at runtime — pure reference for formula analysis.

### XP formula — open questions for next Claude

- **Talent multiplier unknown for both players.** All calibration was done without knowing
  if Ricky Grant is Fast (×1.25) or Normal (×1.0). This affects bXPS by up to 25%.
  Steve needs to confirm: look at the talent tier icon on the player edit screen.

- **The ×N anomaly:** Standard Defending ×20 showed nearly identical gains to ×40 for the
  same stats/player. Two hypotheses:
  1. `starDecayPerSession = 0.85` as applied once-per-SESSION causes the geometric sum to
     plateau: sum(0.85^k, k=0..N-1) → 1/(1-0.85) = 6.67 at large N. So ×20 and ×40 give
     almost the same total effective sessions (~6.4 vs ~6.7). This would mean the current
     formula `budget = N × bXPS / numStats` is WRONG — the budget should use the geometric
     sum, not N directly.
  2. OCR misread of the multiplier in one screenshot.
  If hypothesis 1 is correct, the budget formula in coaches.tsx needs to change from:
  ```typescript
  const budget = sessionCount * profile.baseXpPerSession / scannedStats.length;
  ```
  to something like:
  ```typescript
  const effectiveSessions = (1 - Math.pow(profile.starDecayPerSession, sessionCount))
                            / (1 - profile.starDecayPerSession);
  const budget = effectiveSessions * profile.baseXpPerSession / scannedStats.length;
  ```
  But this would also require re-tuning bXPS. Do NOT implement until Steve confirms
  whether ×20 and ×40 give the same results in practice.

- **Positioning 148 for AML/ML/AMC (Ryan Rodger) underperforms prediction.**
  Predicted ~35-39 pts but game shows ~14-20 pts. Hypothesis: the game may give a reduced
  (partial grey) multiplier for stats that are white in only 1 of 3 roles. Needs more data.

- **Creativity 256 and other 240+ stats** still under-project even with updated table.
  Actual cost at this level appears to be ~260 XP/pt but even that may be too low.
  Once talent is confirmed, re-derive table entries for 200+.

### Files changed in Sprint 24

| File | Change |
|---|---|
| `src/logic/xpEngine.ts` | Fixed star decay bug in `estimateStatGainPct` |
| `profiles/game_2025.json` | `baseXpPerSession` 150→220, high-stat cost table 200+ increased |
| `app/(tabs)/coaches.tsx` | Added `router`/`useRef` imports, double-tap logic for player chips |
| `profiles/calibration_data.json` | NEW — raw screenshot calibration data |

### Dev/test workflow reminder

```
# Hot reload on device (no rebuild needed for JS changes):
# Just save the file — Metro reloads automatically if dev client is running

# TypeScript check:
npx tsc --noEmit

# Push to dev branch (DO NOT push to main — triggers OTA):
git push -u origin claude/continue-development-CAQUS
```

### Note from this Claude to the next Claude

The XP math is closer but still provisional. The star decay bug fix is the most impactful
change (turns +12 projection into +40-50 which is in the right ballpark). The bXPS=220 and
updated high-stat table give reasonable results for 60-200 stat range.

The BIGGEST open issue is confirming talent for Ricky Grant and Ryan Rodger. Everything
hangs off this. Get Steve to open the player edit screen and screenshot the talent label —
it shows "Fastest" / "Fast" / "Average" / "Normal" / "Slow" explicitly.

Don't touch `starDecayPerSession` in game_2025.json without first understanding the ×N
anomaly. If the geometric sum hypothesis is correct, bXPS needs re-calibration simultaneously.

The calibration_data.json is your reference. Add new observations there as Steve scans more
coaches. Each confirmed data point narrows the formula further.

---

## Sprint 25 Handover — Community Framework Confirmation + Exponential Model

### What was done (Sprint 25)

**1. Exponential XP cost model implemented** (`src/logic/xpEngine.ts`, `profiles/game_2025.json`)

`xpBaseForStat()` now uses `C₀ × exp(stat / K)` when `xpCostBase` and `xpCostDecayK` are
present in the profile. The stepped `xpCostTable` remains as fallback if those fields are absent.

Parameters added to game_2025.json:
- `"xpCostBase": 2.94`   (base cost at stat=0)
- `"xpCostDecayK": 55`   (decay constant in stat units; K=55 → cost doubles every ~38 stat pts)

Derivation: observed Tackling-120 vs Positioning-228 in same coach session (same budget).
Actual gain ratio = 66 / 13.5 = 4.89. exp((228-120)/55) = 4.89 exactly. Model confirmed.

**2. Community framework received and verified**

Grok research confirms the complete formula:
```
Effective Gain = Base × Age × Talent × Drill-Avg Penalty × White Factor × Intensity/Tier
```
This maps exactly to `xpNeededFor1Pct`'s divisor. No structural changes needed.

### Community framework — key findings

| Finding | Status | Code impact |
|---|---|---|
| Formula structure confirmed | ✅ Confirmed | None — already correct |
| `greyWeightMultiplier = 0.5` ("white ~2× XP") | ✅ Confirmed | None |
| Age multiplier table (discrete 3-year slabs) | ✅ Confirmed | None |
| ~20% seasonal quality reset | ✅ Confirmed | Unmodeled (intentional) |
| Fast Trainer = 1.5–2× effective | ⚠️ Range only | talentMultipliers may need update |
| Sharpness concept | New — match output only | Not relevant to training optimizer |
| "Blue bar carryover" variance | New — unobservable from OCR | Not modelable |
| Market value = FT signal | New — detection method | Potential future feature |

### Talent multipliers — outstanding issue

Community reports FT as "1.5–2× effective". Current profile:
- Fastest: 1.5 — may need to be **2.0** (top of FT range)
- Fast: 1.25 — may need to be **1.5** (bottom of FT range)
- Average: 1.1, Normal: 1.0, Slow: 0.7 — uncontested

**Do NOT update these values until talent tiers for Ricky Grant and Ryan Rodger are confirmed.**
The "1.5–2× effective" range could reflect overall observed efficiency (all factors combined),
not the raw multiplier in isolation. Calibrating against known-talent players is the only way
to separate this out.

### FT detection methods (from community data)

1. **Market value**: highest-value player for given age/quality = strong FT signal (levels 1–19)
2. **Empirical test**: standardised drill set at 15–18% condition loss — measure % gain per
   attribute. FTs show consistently higher gains (e.g. +1 per attribute where ST shows +0.5)
3. **Player edit screen**: talent tier shown explicitly as Fastest/Fast/Average/Normal/Slow

Method 3 is fastest. Get Steve to screenshot both players' edit screens.

### ×N anomaly — still open

Community data doesn't address whether ×20 ≈ ×40 in practice. The geometric sum plateau
hypothesis remains the most plausible explanation:
```
sum(0.85^k, k=0..19) = 6.38 effective sessions
sum(0.85^k, k=0..39) = 6.66 effective sessions
```
Ratio ≈ 1.04 (4% more XP for double the sessions). This would explain identical-looking gains
between ×20 and ×40. Needs Steve to test deliberately: same player, ×10 vs ×40, compare gains.

### Files changed in Sprint 25

| File | Change |
|---|---|
| `src/logic/xpEngine.ts` | `xpBaseForStat()` uses exponential when params present |
| `src/types/resources.ts` | Added optional `xpCostBase`, `xpCostDecayK` to `GameProfile` |
| `profiles/game_2025.json` | Added `xpCostBase: 2.94`, `xpCostDecayK: 55` |

### Note from this Claude to the next Claude

The exponential model is the correct structural fix. The K=55 and C₀=2.94 were derived from the
Tackling-120 vs Positioning-228 ratio and are consistent with community data showing ~15% drop
per 20% quality band.

The formula is now structurally sound. The remaining calibration work is:
1. Confirm talent tiers (player edit screen — 30 seconds each)
2. Once talent known, back-calculate bXPS from one clean white-stat data point
3. If ×N anomaly confirmed, switch budget formula to geometric sum and re-calibrate bXPS
4. Pin Fastest/Fast multipliers to 2.0/1.5 if empirical tests support it

Primary risk: bXPS=220 was calibrated assuming Normal talent for Ricky Grant. If he's actually
Fast (×1.25), the true bXPS would be ~176. If Fastest (×1.5), bXPS ~147. This is the biggest
remaining uncertainty in every projection the app shows.
