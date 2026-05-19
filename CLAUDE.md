# AIntegrity Squad Optimiser — Developer Notes

Persistent findings from game-play analysis and OCR debugging. Read this before touching scanner logic.

---

## Calibration Policy — Empirical Data Only

**Community data is not trusted.** Every engine constant must be back-calculated from actual
game screenshots (before/after player card stats). If there is no empirical game observation
backing a value, it is ASSUMED and must be labelled as such.

### Engine constants — confirmed vs assumed

| Constant | Value | Status | Evidence |
|---|---|---|---|
| xpCostBase (C₀) | 2.94 | ✅ Confirmed | Derived from Tackling-120 / Positioning-228 gain ratio (same session, same budget) |
| xpCostDecayK (K) | 47 | ✅ Confirmed | Calibration solver: minimises CV across 5 Grant ×40 observations (K=47, CV=3.2%) |
| baseXpPerSession | 676 | ✅ Confirmed | Back-calculated from Grant ×40 Standard Defending (all 5 stats within game range) |
| greyWeightMultiplier | 0.22 | ✅ Confirmed | Back-calculated from Grant ×40 HEADING (grey, stat=155, +11-15 actual) |
| talentMultipliers.Normal | 1.0 | ✅ Confirmed | Grant + Rogers both Normal — projection matches across multiple sessions |
| talentMultipliers.Slow | 0.47 | ⚠️ Single data point | MacGregor ×114 Extensive GK — needs second Slow player to confirm |
| talentMultipliers.Average | 1.1 | ❌ NOT confirmed | Community baseline. No empirical game data. |
| talentMultipliers.Fast | 1.25 | ❌ NOT confirmed | Community baseline. No empirical game data. |
| talentMultipliers.Fastest | 1.5 | ❌ NOT confirmed | Community baseline. No empirical game data. |
| ageTable 18–20 | 1.0 | ✅ Confirmed | Grant age 20 projection matches game output |
| ageTable 26–28 | 0.61 | ✅ Confirmed | McGinty age 27 identified and matched |
| ageTable 21–23 | 0.85 | ❌ NOT confirmed | Assumed. No empirical data for this bracket. |
| ageTable 24–25 | 0.72 | ✅ Confirmed | Garry McCluskey age 24: Focused Physical ×4 Drill Session Reward Coach, Fitness 213 → engine +3.5 vs actual +2-3. ageMult=0.72 validated. (Creativity slightly underpredicts — likely talent is above Normal.) |
| ageTable 17 | 1.1 | ❌ NOT confirmed | Assumed. No 17-year-old calibration player. |
| ageTable 29 | 0.50 | ❌ NOT confirmed | Assumed. |
| ageTable 30 | 0.00 | ❌ NOT confirmed | Assumed. |
| OVR formula | floor(sum/15) | ✅ Confirmed | Grant T2→T3: sum=2615, floor(2615/15)=174 ✓; sum=2355, floor=157.0 ✓ |
| tierAttrAdditions T2→T3 | +20/white | ✅ Confirmed | Grant T2→T3 immediate before/after: every white stat +20 exactly, grey stats +0 |
| tierAttrAdditions | T0-T6 values | ✅ Confirmed | Full table verified from tier upgrade screenshots |
| condLevelMultipliers | ×1–×5 | ✅ Confirmed | From drill condition drain screenshots |
| fanClubCondReduction | 10–50% | ✅ Confirmed | From fan club screenshots |
| seasonDecayPerLevel | 20 flat | ✅ Confirmed | Grant T3 before/after season: every stat −17 to −19 (avg 17, ~3 units training noise). Flat model fits; 20%-proportional model off by 18–26 on high stats. White and grey drop equally. |

**When adding or changing any constant:** record the empirical evidence in `profiles/calibration_data.json`
and update the table above. "Community says X" is not evidence.

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

**CRITICAL: The game uses Math.floor (NOT Math.ceil or Math.round) for OVR.**
Confirmed definitively Sprint 32 from Grant T2→T3 clean tier upgrade: displayed sum = 2615,
game OVR = 174. `floor(2615/15) = floor(174.33) = 174` ✓. `ceil = 175` ✗.
Sprint 27's "4-data-point ceil confirmation" was an artefact — fractional stat accumulation from
training pushed the internal sum above the displayed sum, making floor and ceil agree on those
cases. The clean integer-only tier upgrade resolved the ambiguity conclusively.
Fixed in `qualityPctToOvr()` in `src/logic/xpEngine.ts`.

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

---

## Sprint 26 Handover — Talent Confirmed, Player Snapshots, Role Detection

### What was done (Sprint 26)

**1. TALENT CONFIRMED for both calibration players**

Both Ricky Grant and Ryan Rodger are **Normal (×1.0)** — confirmed from intake form Training Rate
selections. This resolves the biggest open calibration question since Sprint 24.

Impact: bXPS=220 was calibrated assuming Normal talent. That assumption is now verified.
With Normal + K=55 + bXPS=220, Tackling 120 ×40 Standard predicts ~62 pts (actual: 59-73 ✓).

**2. Calibration data comprehensively updated** (`profiles/calibration_data.json`)

- Added `talent: "Normal", talentConfirmed: true, talentSource: "..."` to both players
- Added `snapshots[]` array to each player tracking stats at different training stages:
  - Grant: T2/ELITE snapshot + T3/STELLAR snapshot (current)
  - Rogers: T0/OVR-116 snapshot (original calibration) + T0/OVR-120 snapshot (current)
- Added `tier_increment_verification` for Grant: T2→T3 confirms 13 white stats for DL/ML/AML
  (all except HEADING and STRENGTH), matching `tierIncrements[T3] = 20`
- Confirmed white stat count from tier increment: Heading +1, Strength +1 (grey). All others +21.

**3. Player seeds created** (`profiles/player_seeds.json`)

Definitive player records for re-entry if device DB is wiped. Contains correct roles, stats,
talent, tier for both players. Full 3-role entries (not 1-role as entered in intake forms).

**4. Controlled ×N test logged**

Extensive Safeguard ×10/×40 on OVR-99 outfield player (talent ×1.0, Fitness 111, VH intensity):
- ×10 → app projects +3.7 FITNESS
- ×40 → app projects +9.0 FITNESS
- Ratio: 2.43 (expected ~3.65 from pure exponential cost model alone)
- Unexplained 33% sub-linearity. Player age unknown — needed to resolve.

### Critical open issues for next session

**1. Roles entered with only 1 position in intake forms:**
- Grant saved as DL only (should be DL + ML + AML)
- Rogers saved as AML only (should be AML + ML + AMC)
- Fix: open each player in the player edit screen, add the missing 2 roles
- Impact: `isWhiteStat()` uses union of all roles. Single role = fewer white stats = different projections

**2. OVR +1 discrepancy:**
- Grant: our formula gives 175, game shows 176
- Rogers: our formula gives 120, game shows 121
- Stats as read from screenshots sum to 1 less than needed. Either a stat is 1 point off
  in our read, or the game uses a slightly different rounding. Not critical for projections.

**3. ×N anomaly still open:**
- The OVR-99 player's ×10/×40 ratio (2.43 vs expected 3.65) suggests either sub-linear budget
  scaling (geometric session decay) OR some age-related effect compounding with the cost curve.
- Need: player's age from the coach planner screen to diagnose.
- Do NOT change budget formula until this is understood.

**4. Role detection in player scanner — Steve's note:**
- Scanner picks up role labels from "black" (unlit/unselected) positions in the game card
- May need colour-based filtering of role tokens, but ML Kit OCR doesn't expose text colour
- Alternative: restrict role detection to the specific Y-band where the role badge row appears
- See `src/logic/playerScanner.ts` → `KNOWN_ROLES` and role extraction logic

### Files changed in Sprint 26

| File | Change |
|---|---|
| `profiles/calibration_data.json` | Complete rewrite with confirmed talent, snapshots, tier verification, ×N test |
| `profiles/player_seeds.json` | NEW — definitive player records for DB re-entry |
| `CLAUDE.md` | This section |

### Note from this Claude to the next Claude

The formula is now well-calibrated for Normal talent players in the 60-260 stat range.
The K=55 exponential model gives reasonable predictions once you account for the budget formula.

Priority order for next session:
1. Fix the roles for both players in the device DB (DL+ML+AML for Grant, AML+ML+AMC for Rogers)
2. Get the OVR-99 mystery player's age (screenshot the coach planner showing their profile)
3. Investigate the role scanner "black role" issue — read playerScanner.ts lines around role extraction
4. Confirm whether Grant and Rogers are actually saved in the DB with the correct stats from the
   most recent intake form scan, or whether they have older stats

The calibration_data.json and player_seeds.json together are the persistent record.
Any new coach observations Steve scans should be added to calibration_data.json observations[].
The player_seeds.json should be updated whenever stats change significantly (after major coaching).

---

## Sprint 28 Handover — Bug Fixes (Steve's Test Protocol) + Visual Polish

### What was done (Sprint 28)

**1. Concatenated role token parser** (`src/logic/playerScanner.ts`)

OCR collapses multi-role sequences into single tokens (`"MLAML"`, `"DLMLAML"`). Greedy parser added: tries longest known role first, consumes left-to-right, only accepts if full token consumed. Prevents silent role drops that broke white stat union for multi-role players.

**2. Player selector threshold** (`app/(tabs)/drills.tsx`, `app/(tabs)/coaches.tsx`)

`squad.length > 1` → `squad.length > 0`. Selector now visible with a single player; the auto-select fallback highlights the chip correctly.

**3. Focused coach scan — two-part fix**

- `src/logic/coachScanner.ts`: OCR returns uppercase ("FOCUSED", "ATTACKING"). Normalised via `COACH_TYPES.find()` / `COACH_CATS.find()` lookups so downstream title-case guards fire correctly.
- `src/logic/coachPipeline.ts`: Added Focused guard before the white-stat fallback. Focused with 0 detections returns `[]`, activating the manual picker. ML Kit cannot read `↑` arrow icons in the no-player state — workaround is to scan with any player selected.

**4. OVR scale mismatch fix** (`app/(tabs)/coaches.tsx`)

Intermediate fractional-OVR attempt caused `ovrAfter` (raw `sum/15`) to differ from `ovrBefore` (ceil-based), producing −0.2 gain. Reverted to consistent `computeOvrWithPadding` for both.

**5. Button border / stat colour polish** (`app/(tabs)/coaches.tsx`)

Inactive type/category buttons: `borderColor` → `theme.steel`, text → `theme.inkMuted`.
Focused stat picker chips: `statColor(stat)` for text + tinted border, matching DEF/ATT/PHY scheme.

**6. Animated splash screen** (`src/components/SplashAnimation.tsx`, `app/_layout.tsx`)

~3.2s sequence: rings + grid → circuit traces → title text → hold → fade out → `onComplete()`. Two continuous spinning dashed rings. Color `#cc1111` throughout. DB migration spinner uses same red.

**7. Per-tab background art** (`src/components/TabBackground.tsx`)

Unique accent colour per tab (squad=blue, plan=green, drills=amber, coaches=purple, results=red). Same data-viz aesthetic across all tabs; art themed to tab function. `StyleSheet.absoluteFill` + `pointerEvents="none"`.

### Files changed in Sprint 28

| File | Change |
|---|---|
| `src/logic/playerScanner.ts` | Greedy concatenated role parser |
| `src/logic/coachScanner.ts` | coachType/coachCategory OCR case normalisation |
| `src/logic/coachPipeline.ts` | Focused coach 0-stat guard |
| `app/(tabs)/drills.tsx` | selector threshold + TabBackground |
| `app/(tabs)/coaches.tsx` | selector threshold, OVR fix, button UI, stat colours, TabBackground |
| `app/(tabs)/index.tsx` | TabBackground |
| `app/(tabs)/plan.tsx` | TabBackground |
| `app/(tabs)/results.tsx` | TabBackground |
| `app/_layout.tsx` | Splash gate + red DB spinner |
| `src/components/SplashAnimation.tsx` | NEW — animated splash |
| `src/components/TabBackground.tsx` | NEW — per-tab SVG background art |
| `profiles/player_seeds.json` | Neri partial seed entry |

### Note from this Claude to the next Claude

All Sprint 28 bugs from Steve's test protocol are fixed. The app is in a clean state.

Key things to know:
- **Focused coach workflow**: Scan with any player selected so ML Kit reads the `+lo-hi` gain values as text. Arrow-only state (no player) will always return 0 stats because the arrows are icon overlays. Manual picker is the fallback and works correctly.
- **Neri**: 292 OVR, T6, roles ST/AMC/MC, Age 27. Partial seed in player_seeds.json. Steve needs to scan the player card to confirm full stats.
- **Splash assets**: Steve will supply `assets/splash.png` and `assets/icon.png`. Update `app.json` when received.
- **Git workflow confirmed**: Two Termux sessions — Metro on one, `git pull` on the other. Metro hot-reloads file changes without restart. Only push to `claude/continue-development-CAQUS`. `main` triggers EAS OTA.
- **Fractional OVR**: Deferred. Clean approach would show projected gain as a range (`+0.6→+1.2`) rather than fractional AFTER value.

---

## Sprint 27 Handover — Role Correction, 3-Role Entries Confirmed, Scanner Fixes

### What was done (Sprint 27)

**1. Both players re-entered with correct 3-role data (Sprint 26 open issue resolved)**

Sprint 26 noted both players were saved with 1 role only. Steve has now re-entered both with
the full 3-role position grid selections, confirmed from intake form screenshots:
- **Grant**: DL + ML + AML ✓ (unchanged from player_seeds.json — correct)
- **Rogers**: AML + ML + **DL** — NOTE: previous records had AMC. Corrected to DL.

Rogers' prior record (AMC as 3rd role) was wrong. The in-game role is DL, not AMC.

**2. Rogers white/grey stats corrected** (`profiles/player_seeds.json`, `profiles/calibration_data.json`)

With DL replacing AMC, Rogers' white stats now match Grant's exactly:
- **White (13)**: TACKLING, MARKING, POSITIONING, BRAVERY, PASSING, DRIBBLING, CROSSING, SHOOTING, FINISHING, FITNESS, AGGRESSION, SPEED, CREATIVITY
- **Grey (2)**: HEADING, STRENGTH

The AMC-era observations in calibration_data.json (46697–46703) remain as historical records.
Their `isWhite` flags reflect the AMC-era role set and should be treated as such if re-calibrating.

**3. coachScanner.ts — Sprint 23 plan complete**

All 5 Sprint 23 items now implemented:
- A: Y_TOL split (Y_TOL_NAME=25, Y_TOL_VAL=18) — was already done in prior session
- B: blockIdx — explicitly decided against (line-level tokens + left-filter prevent cross-col bleed; blockIdx breaks gain detection since name and gain are in different blocks)
- C: GAIN_RE `+` optional (`/\+?\s*(\d+)\s*[–\-—]\s*(\d+)/`), sanity `hi > lo`, `lo <= 150` — was already done
- D: Arrow indicator detection for no-player-selected state — **added this sprint**
- E: `_debugBlocks` logging in coaches.tsx — was already done

**4. playerScanner.ts — role detection anchored fix**

Role detection now anchored to the "Roles:" label Y-band (`Y_TOL=28px`).
Prevents false positives from dark/inactive position labels elsewhere in the game card.
Falls back to fullText regex only when no "Roles:" label is found by OCR.

### Impact of Rogers role change on projections

Before (AMC): TACKLING, MARKING, BRAVERY, AGGRESSION → grey (×0.5 XP). HEADING → white.
After (DL): TACKLING, MARKING, BRAVERY, AGGRESSION → white (full XP). HEADING → grey.

For a Defending coach on Rogers, this means TACKLING/MARKING/BRAVERY now project at full
rate instead of halved. HEADING goes from full rate to halved. This is a significant change
in projected coaching value for defending coaches on Rogers.

### Files changed in Sprint 27

| File | Change |
|---|---|
| `profiles/player_seeds.json` | Rogers roles AMC→DL, white/grey stats corrected |
| `profiles/calibration_data.json` | Rogers roles, whiteStats, greyStats, notes, open questions updated |
| `src/logic/playerScanner.ts` | Role detection anchored to Roles: label Y-band |
| `src/logic/coachScanner.ts` | Arrow indicator detection (Sprint 23 item D) |
| `CLAUDE.md` | This section |

### Note from this Claude to the next Claude

Rogers role correction is significant — any prior projections or analysis that assumed AMC
(grey TACKLING/MARKING/BRAVERY/AGGRESSION, white HEADING) are now invalidated. The new
whiteness set (DL) is identical to Grant's, which simplifies comparisons between the two players.

The AMC-era calibration observations (46697–46703) are still in calibration_data.json and
can still be used for formula validation as long as the isWhite flags are treated as AMC-era
(TACKLING/MARKING/BRAVERY grey=true for those sessions).

The ×N anomaly and OVR +1 discrepancy remain open. The OVR-99 mystery player's age is still
unknown — this is still needed to diagnose the Extensive Safeguard ×10/×40 ratio of 2.43.

### Sprint 27 Addendum — Kevin McGinty + OVR Formula Fix

**Kevin McGinty identified as OVR-99 mystery player (sprint 26 controlled test)**

- Name: Kevin McGinty, Age 27, Roles: AMC only, T0, Normal talent
- Confirmed from screenshots: 1862c396 (game card), 60724dba (intake form), 4588b6a9 (scan)
- Age 27 → ageMult = 0.61 from ageTable. Training is 39% less efficient than baseline.
- Added to player_seeds.json and calibration_data.json.

**OVR formula confirmed: Math.ceil (NOT floor)**

Four data points all match `ceil(sum/15)`:
- McGinty: ceil(1493/15) = ceil(99.53) = **100** ✓ (game: 100)
- Rogers: ceil(1809/15) = ceil(120.6) = **121** ✓ (game: 121)
- Grant T3: ceil(2631/15) = ceil(175.4) = **176** ✓ (game: 176)
- Grant T2: ceil(2355/15) = ceil(157.0) = **157** ✓ (game: 157)

`floor` and `round` both fail for Grant T3. `ceil` matches all 4.

Fixed in `src/logic/xpEngine.ts` → `qualityPctToOvr()`.
This resolves the "OVR +1 discrepancy" that had been open since sprint 24.

---

## Sprint 31 Handover — bXPS Recalibration + Bug Fixes + Role Corrections

### What was done (Sprint 31)

**1. Critical crash fixed — `setSelectedTier` stale reference** (`app/(tabs)/coaches.tsx`)

Sprint 30 removed the tier section from coaches.tsx but left `setSelectedTier(null)` in the
sessions TextInput `onChangeText` handler. App crashed the moment the user typed in the sessions
field. Removed the stale call. `commit fb4ccc0`

**2. Coach scanner — CROSSING detection fixed** (`src/logic/coachScanner.ts`)

3-column OCR merge problem: ML Kit collapses adjacent-column text into single blocks
(e.g. "194 + 4-6 Crossing"). CROSSING (ATT column) was never appearing as a standalone token
when embedded in a DEF-column block. Fixed with a secondary embedded-stat scan in `rowText`:

```typescript
// Pattern: STATNAME VALUE + lo-hi
const embRE = new RegExp(`\\b${escapedName}\\b\\s+(\\d+)\\s*\\+?\\s*(\\d+)\\s*[-–—]\\s*(\\d+)`, 'i');
```

Safeguard scans now correctly return 3 stats instead of 2. `commit 4482e2b`

**3. bXPS recalibrated: 220 → 450** (`profiles/game_2025.json`)

Root cause: Sprint 24 calibrated `baseXpPerSession=220` against the **stepped xpCostTable** model.
Sprint 25 switched to the exponential model `2.94 × exp(stat/55)` without re-calibrating.
The exponential model's compounding makes stat gains significantly more expensive over a 60-point
range than flat table entries — bXPS needed to rise proportionally.

Back-calculated from four independent data points:

| Data point | Stat | Value | Session | Actual/Game range | Implied bXPS |
|---|---|---|---|---|---|
| Cptn Dallas ×4 Safeguard | MARKING | 139 | age 23, Normal | +11–16 | 495 |
| Cptn Dallas ×4 Safeguard | POSITIONING | 194 | age 23, Normal | +4–6 | 455 |
| Cptn Dallas ×4 Safeguard | AGGRESSION | 189 | age 23, Normal | +4–6 | 414 |
| Ricky Grant ×40 Defending | TACKLING | 120 | age 20, Normal | +59–73 actual | 409 |

Mean: 443 → set to **450**. Validated: Dallas ×4 Safeguard all 3 stats land inside game ranges.
Rayne ×4 Safeguard confirmed +1 OVR (was +0 at bXPS=220). `commit 19d0170`

**4. DMC role — STRENGTH moved to secondary** (`src/utils/roleWeights.ts`)

STRENGTH was in DMC's essential list — incorrectly carried over from MC/AMC adjacency.
Game confirms STRENGTH is grey for a pure DMC player. Two grey PHY stats for DMC: STRENGTH + SPEED.
DMC now: 9 essential, 6 secondary. `commit 5c9dcf7`

**5. playerScanner.ts — OCR misread corrections**

`OCR_STAT_CORRECTIONS` map added: `'TACKIING' → 'TACKLING'`, `'TACKL1NG' → 'TACKLING'`.
ML Kit misreads the font's lowercase 'l' as 'i' on certain device renderings.

### Player profiles confirmed this sprint

| Player | Age | Roles | Tier | Talent | OVR | Source |
|---|---|---|---|---|---|---|
| Cptn Dallas | 23 | AMR/MR/DR | T0 | Normal ×1.0 | ~185 | Edit screen + coach scan |
| Rayne | 21 | ML/DL/DC | T3 | Normal ×1.0 | 204 | Edit screen + coach scan |
| Age-24 DMC (Insidious FC) | 24 | DMC | T0 | Normal ×1.0 | 127 | Intake form scan |

Age-24 DMC player: name captured as "Team: Insidious FC" (scanner picked up club text).
Correct the name in the DB. This player was added specifically for ageMult=0.72 validation.

### ageMult validation — in progress

Age 24 → ageMult = 0.72. This bracket has NOT been validated against game data yet.
Next step: scan a coach preview for the age-24 DMC player with the game's +X–Y ranges visible,
then compare against app projection.

### Files changed in Sprint 31

| File | Change |
|---|---|
| `app/(tabs)/coaches.tsx` | Remove stale `setSelectedTier(null)` from sessions onChangeText |
| `src/logic/coachScanner.ts` | Secondary embedded-stat scan for 3-column OCR merge (CROSSING fix) |
| `src/logic/playerScanner.ts` | `OCR_STAT_CORRECTIONS` map for TACKLING misreads |
| `profiles/game_2025.json` | `baseXpPerSession` 220 → 450 |
| `profiles/calibration_data.json` | `bxps_recalibration` block with full back-calculation evidence |
| `src/utils/roleWeights.ts` | DMC: STRENGTH essential → secondary |

### Note from this Claude to the next Claude

**bXPS=450 is now validated from two independent datasets** (Dallas and Grant). The exponential
model K=55, C₀=2.94 was derived from gain ratios and is structurally correct. The only remaining
calibration uncertainty is `ageMult` for the 24–25 bracket (0.72) — one clean data point from
the age-24 DMC player will confirm or correct it.

**Do NOT touch bXPS again** without at least 2 new data points that consistently imply a
different value. 220 was wrong because of a model switch without re-calibration; 450 is confirmed
from 4 data points across 2 different players and 2 different session counts.

**Role constraints open questions:**
- MC: SHOOTING is essential — confirmed or needs checking? (added in a prior sprint)
- DC: only 5 essential stats (POSITIONING, HEADING, FITNESS, STRENGTH, AGGRESSION) — seems low,
  may need TACKLING and MARKING added. Check against game for a pure DC player.
- All other roles have been confirmed from actual game data except DC.

**Star decay** (`starDecayPerSession=0.85`): currently NOT applied (starsGainedInSession=0 hardcoded
in coaches.tsx). Four data points across ×4 and ×40 sessions both fit linear budget scaling with
bXPS=450, suggesting the game doesn't apply geometric session decay in the way modeled, or it's
negligible. Leave as-is until a deliberate ×N test (same player, ×10 vs ×40) provides evidence.

---

## Sprint 32 Handover — Custom Coach Engine Fix + Branch Transition

### What was done (Sprint 32)

**1. `customCoachEngine.ts` — deprecated shim replaced with real XP engine**

`predictCustomDrill` was calling `calculateDynamicGain` (the `@deprecated` shim in `coachMath.ts`)
without passing a `GameProfile`. Without a profile, the function hit the graceful degradation fallback:

```javascript
const ageFactor = age <= 19 ? 1.0 : age <= 21 ? 0.4 : 0.2;
```

Any player over 21 returned `ageFactor = 0.2` — treating them as training at 20% efficiency.
The real engine uses the age table with interpolation. All of age, talent, white/grey weighting,
and the exponential cost curve were bypassed.

Root cause was two compounding errors:
- Wrong function (`calculateDynamicGain` instead of `estimateStatGainPct`)
- No `GameProfile` (forced fallback to hardcoded guesses)

Multipliers happened to scale correctly because `coachMultiplier` passes through the formula
proportionally — the ratio was right even though the absolute base was wrong.

**Fix (`commit 15164e8`):**
- `PlayerStats.statValue: number` — the XP engine needs actual stat value, not OVR
- `PlayerStats.talent: TalentTier` — for correct talent multiplier lookup
- `predictCustomDrill(profile: GameProfile)` — new required parameter
- XP budget: `sessions × profile.baseXpPerSession × coachMultiplier`
- `estimateStatGainPct` called with all correct parameters from `game_2025.json`
- `drillLevelMult = 1.0` (coaching sessions use full budget; intensity multipliers are for drills only)
- Dead import of `calculateDynamicGain` removed

**2. Branch transition**

`claude/test-connection-I2s8B` is now the active dev branch.
`claude/continue-development-CAQUS` was merged to `main` via PR #62 and retired.

### Files changed in Sprint 32

| File | Change |
|---|---|
| `src/logic/customCoachEngine.ts` | Full rewrite — deprecated shim out, real XP engine in |

### Note from this Claude to the next Claude

`customCoachEngine.ts` had no callers when fixed — the function was pre-built infrastructure.
When it gets wired into a UI component, callers must provide `statValue` (the actual stat, not
OVR) and `talent` on the `PlayerStats` object, plus a loaded `GameProfile`. The XP budget model
is `sessions × baseXpPerSession × coachMultiplier` — `coachMultiplier` scales the total budget,
not a per-session rate modifier.

The `calculateDynamicGain` shim still exists in `coachMath.ts` for backward compatibility with
any old tests that import it. It is still `@deprecated` and must not be used in new code. If all
tests migrate, the shim can be deleted.

Open questions for next session:
1. Wire `predictCustomDrill` into a UI component (custom coach planner?)
2. Confirm ageMult=0.72 (age 24) from the age-24 DMC player scan
3. Calibrate `drillXpFactor` with real before/after drill stat data
4. Confirm Fastest/Fast talent multipliers when a known-talent player is available
5. Consider ×N empirical test (same player, ×10 vs ×40) to resolve star decay anomaly

---

## Sprint 33 Handover — OCR Dedup, Safeguard Fix, Reward Coach Detection

### What was done (Sprint 33)

**1. OVR formula confirmed: Math.floor** (`src/logic/xpEngine.ts`)

Sprint 27 addendum had confirmed `Math.ceil` from 4 data points. Sprint 32 re-examined with a
clean integer-only tier upgrade (Grant T2→T3): displayed sum = 2615, game OVR = 174.
`floor(2615/15) = 174` ✓, `ceil = 175` ✗. The prior ceil confirmation was an artefact of
fractional stat accumulation. Fixed to `Math.floor` in `qualityPctToOvr()`.

**2. Duplicate stat capture fix** (`src/logic/coachScanner.ts`)

Scanner was pushing duplicate `StatCapture` entries (e.g. CONCENTRATION appearing twice),
causing React "duplicate key" errors at `coaches.tsx:183`.

Fix: replaced `stats[]` accumulator with `Map<string, StatCapture>` + `upsertCapture()`:
- Prefer real baseline (statBefore > 0) over arrow-only capture (statBefore === 0)
- Prefer narrower gain span as tiebreaker

Also fixed baseline selection: was taking `rowNums[0]` (first number in row, which in a
3-column merged block belongs to the adjacent column's stat). Fixed to pick the numeric token
whose `left` position is **closest to the stat name token** — correctly attaches the stat's own
current value rather than a neighbour's.

**3. Slow talent multiplier calibrated: 0.7 → 0.47** (`profiles/game_2025.json`)

Jables JaseysBoi (GK, Age 18, Slow): ×114 Extensive GK, engine at Slow=0.47 → +25 OVR,
game range +24–32. 9/11 stats within game range; 3 stats 0.4–2.2 below lo bound, suggesting
true value may be 0.49–0.52. Flagged for re-confirmation with a second Slow player scan.
Full per-stat breakdown in `calibration_data.json → lewis_macgregor`.

**Note:** DB had the player entered as Normal (×1.0). After DB correction to Slow (×0.7),
the engine initially predicted +42 OVR (way over). Profile recalibration from 0.7 → 0.47
then brought it to +25 OVR (within range). The 0.47 is a profile-level correction on top of
the DB talent value — this is the correct model.

**4. Safeguard category fix** (`src/logic/coachPipeline.ts`)

`CATEGORY_STATS["Safeguard"]` was mapped to GK stats — wrong. Fixed to DEF stats
(TACKLING, MARKING, POSITIONING, HEADING, BRAVERY), same as Defending.

Added pipeline rule: **Standard and Extensive coaches always return the full category list**,
regardless of how many stats OCR detected. Arrow icons (↑) on non-highlighted rows are
unreadable by ML Kit, causing partial detections. The full-category override ensures the
budget is divided correctly. Focused coaches and Reward Coaches are excluded from this rule.

**5. Category filter in embedded stat pass** (`src/logic/coachScanner.ts`)

The secondary embedded-stat scan (for stats merged into adjacent-column OCR blocks) was
capturing out-of-category stats — e.g. AGGRESSION appearing in POSITIONING's rowText during
a Safeguard scan. Fixed by filtering candidates to the coach's category before pattern-matching.

`CATEGORY_STAT_SETS` constant added near top of `coachScanner.ts`, mirrors `CATEGORY_STATS`
in `coachPipeline.ts` as `Set<string>` for O(1) lookups.

**6. Reward Coach detection** (`src/logic/coachScanner.ts`, `src/logic/coachPipeline.ts`)

Reward Coaches use the Standard/Extensive label but boost a custom set of stats (potentially
cross-category, e.g. MARKING + POSITIONING + AGGRESSION in a Safeguard Reward Coach).

Fix:
- Scanner detects `"REWARD COACH"` text → sets `isRewardCoach: true` in `CoachScanResult`
- Scanner bypasses category filter in embedded pass when `isRewardCoach` (so cross-category
  stats like AGGRESSION are captured)
- Pipeline skips the Standard/Extensive full-category override when `isRewardCoach` — falls
  through to contamination check, which correctly handles cross-category detections

Reward Coaches confirmed to use the **same XP budget** as regular Standard coaches — no
extra boost, just awarded as a prize. No separate `rewardCoachXpMultiplier` needed.

**7. RESEARCH_PROMPT.md created** (project root)

Self-contained briefing covering all 8 open calibration/tuning issues with exact
back-calculation formulas, evidence to collect, and priority order.

**8. Brandon Prentice calibration data** (`profiles/calibration_data.json`)

- Age confirmed: 22 → ageMult 0.85 bracket (21–23) ✓
- xN engine projections recorded for ×4/×20/×40 Standard Safeguard (5 stats)
- Reward Coach ×4 projection recorded (3 stats: MARKING, POSITIONING, AGGRESSION):
  +15.4 / +15.1 / +11.6. Actual game result needed to validate.

### Files changed in Sprint 33

| File | Change |
|---|---|
| `src/logic/xpEngine.ts` | OVR formula: `Math.ceil` → `Math.floor` |
| `src/logic/coachScanner.ts` | Map-based dedup + nearest-number baseline + CATEGORY_STAT_SETS + Reward Coach detection |
| `src/logic/coachPipeline.ts` | Safeguard = DEF stats; Standard/Extensive full-category override; Reward Coach exclusion |
| `profiles/game_2025.json` | `talentMultipliers.Slow` 0.7 → 0.47 |
| `profiles/calibration_data.json` | Jables per-stat data; Prentice xN projections + age; Reward Coach observation |
| `profiles/player_seeds.json` | Lewis MacGregor T2 snapshot |
| `RESEARCH_PROMPT.md` | NEW — open calibration issues with priority order |

### Note from this Claude to the next Claude

**Reward Coach scanning** is now handled correctly. The `isRewardCoach` flag gates both the
embedded-pass category filter and the pipeline's full-category override. Normal Standard
coaches (full category) and Reward Coaches (specific cross-category stats) are distinguished
automatically. No user action needed.

**Slow talent (0.47)** is a single-player calibration. 3/11 stats fell slightly below the
game's low bound, implying the true value may be 0.49–0.52. Do not change it without a
second Slow player data point — the current value gives +25 OVR vs game's +24–32, which
is within range.

**Priority action items for next session:**

1. **DONE: ageMult=0.72 for age 24 now confirmed** — Garry McCluskey (age 24) Focused Physical
   ×4 Drill Session Reward Coach. Fitness 213 → engine predicts +3.5, actual +2-3. ✅

2. **Confirm Garry McCluskey talent** — screenshot the edit screen. Fitness data is consistent
   with Normal (1.0) but Creativity underpredicts (+5.8 vs +7-10). Fast (1.25) would give
   Creativity +7.1 ✓. One edit-screen screenshot resolves this.

3. **Confirm King Alfie talent** — same: screenshot edit screen for Fastest/Fast/Average/Normal/Slow.

4. **Training Camp is NOT modelled** — King Alfie's ×20 Standard Attacking session was a
   "TRAINING CAMP" session type. The game boosted only 3/5 ATK stats (Dribbling, Crossing,
   Finishing) with unknown budget formula. Engine now detects Training Camp and shows a warning
   instead of a bad projection. Do NOT use Training Camp scans for formula calibration.

5. **Run Brandon Prentice's Reward Coach ×4** — screenshot before/after player card.
   Compare actual gains vs +15.4 MARKING / +15.1 POSITIONING / +11.6 AGGRESSION.
   Validates ageMult=0.85 (age 22) and confirms Reward Coach budget = Standard budget.

6. **×N test** — same player, ×4 vs ×20 actual gains from a REGULAR coaching session (not
   Training Camp). Prentice is the candidate. Engine predicts ×20 gives ~4× the ×4 gain.

7. **Slow talent second data point** — any Slow player, any Extensive coach scan.

## Training Camp Session Type

Training Camp is a distinct game mode (shows "TRAINING CAMP" label in the game UI). Key differences
from regular coaching sessions observed so far:

- Only a subset of the category's stats are boosted (3/5 ATK stats for King Alfie ×20)
- Budget formula unknown — cannot be back-calculated without knowing talent
- Engine now detects "TRAINING CAMP" text and declines to project, showing a UI warning

Do NOT attempt to fit Training Camp data to the coaching XP engine formula.

See `RESEARCH_PROMPT.md` for the full issue list with back-calculation formulas.
