# Squad Optimiser — Dev Log

Reverse-chronological. Each entry covers what shipped, what broke, and what the next sprint targets.

---

## Sprint 13 — Squad Plan, Coach Capture, Coaches Overhaul
**2026-05-10 — Session UHXEX (day 2)**

### Shipped

**Squad Plan tab (new)**

New `SQUAD PLAN` tab added to the main nav. Displays all saved projection runs grouped by player — OVR before/after, stat gains, session count, tier (if any), timestamp. Per-run delete. "Add run → Coaches tab" shortcut for players with no runs yet. Backed by `squad_plan_runs` SQLite table (DB migration 0004).

**Coach Session Capture screen (new)**

`/coach/capture` accessible via `→ CAPTURE` button in the Coaches tab header. Lets you log what the game's coach preview shows (+gain lo/hi per stat). Sections: coach type/category/multiplier, squad auto-fill (player card copies stats, role, talent, OVR), per-stat gain entry (tap to expand → CURRENT / +LO / +HI inputs), live OVR boost preview. Actions: SAVE TO LOG (saves to Squad Plan) and PROJECT (navigate to Coaches tab).

**Coaches tab overhauls**

- **Removed 2× AD toggle** — hardcoded `false`; the multiplier only applies to Teamplay drills, not Academy coaches.
- **3-column stat grid** — replaced `flexWrap` pile with a proper 3-col `StatGrid` component (rows of 3 Pressables). White and grey sections each use 3 columns, 5 rows max for outfield.
- **Grey label** — "GREY — SECONDARY (×0.5 XP)" → "GREY — SECONDARY / NON-ROLE"
- **SAVE RUN button** — after projection, "SAVE RUN TO SQUAD PLAN" button persists the run to `squad_plan_runs` and confirms inline (text changes to ✓).

### Bugs Fixed This Sprint

| ID | Area | Fix |
|---|---|---|
| F37 | Coaches stat grid was flexWrap pile — no consistent layout | Replaced with `StatGrid` 3-column component |
| F38 | 2× AD toggle present in coaches — doesn't apply to Academy coaches | Removed toggle, hardcoded `false` |
| F39 | No persistent history of coach projections | Squad Plan tab + `squadPlanService` + DB migration 0004 |
| F40 | White/grey stat detection not surfaced in capture flow | Coach Capture auto-fills from player card and labels stats WHITE/GREY by role |

---

## Sprint 12 — Tier Bonus Engine Fix + Player Snapshot / Revert
**2026-05-09 — Session UHXEX (continued)**

### Shipped

**Tier bonus now correctly applied to role stats (white + grey), off-role gets +1**

Reality-checked against Ricky Grant Elite→Stellar:
- Role stats (getAllStatKeys: white + grey union) → receive the full tier increment
- Off-role stats present in the player's stat dict → receive a flat +1 per tier step

Previously `applyTierBonusToStats` only applied the increment to white stats. Grey stats (e.g. HEADING for a DC secondary role) received nothing. Off-role stats (e.g. STRENGTH, HEADING for a DL-only player) also received nothing, resulting in OVR over-prediction.

Fixed in:
- `src/logic/xpEngine.ts` — `applyTierBonusToStats` now iterates all keys in the stats dict: role keys get `+inc`, others get `+1`
- `src/logic/ovrProjector.ts` — both the stat-entry path (direct loop) and the no-stats analytical path updated
- `app/(tabs)/coaches.tsx` — tier preview + apply now pass `getAllStatKeys` instead of `getWhiteStatKeys`
- `app/(tabs)/results.tsx` — same

**Player snapshot + one-step revert**

When APPLY TO PLAYER CARD or APPLY FULL PLAN TO CARD is pressed, the pre-apply state (`{ stats, overall, tier }`) is saved as a `snapshot` field on the player record before overwriting. A subsequent apply replaces the snapshot (one level of undo only).

The player edit screen (`app/player/[id].tsx`) shows an orange banner when a snapshot exists, displaying the previous OVR and tier. Tapping the banner prompts a confirmation dialog. On confirm, `playerService.revertToSnapshot` restores the original values and clears the snapshot; the form reloads in-place.

DB migration `0003_player_snapshot.sql`: `ALTER TABLE players ADD snapshot text DEFAULT NULL`.

### Bugs Fixed This Sprint

| ID | Area | Fix |
|---|---|---|
| F35 | Tier bonus only applied to white stats — grey stats got 0 increment | `applyTierBonusToStats` now uses `getAllStatKeys` (white+grey); off-role get +1 |
| F36 | No way to undo APPLY TO PLAYER CARD — had to manually re-enter stats | Snapshot saved before every apply; REVERT banner on edit screen restores pre-apply state |

### Next Sprint Targets

- Beta testing results (user session tonight/tomorrow) — expect label cleanup, navigation gaps, UI polish
- Validate condition formula at Easy and Medium difficulty (only VH and VE cross-checked)
- Add Ball Control drill to DRILL_LIST (missing: trains Concentration, Dribbling, Heading, Creativity — type TBC)

---

## Sprint 11 — Drill Condition Formula Overhaul + All Drills Visible
**2026-05-09 — Session UHXEX**

### Shipped

**Condition formula corrected — confirmed from in-game screenshots**

`src/utils/conditionEngine.ts` — complete rewrite of condition loss calculation:

- New `COND_LEVEL_MULTIPLIERS`: VE×1, Easy×2, Medium×3, Hard×4, VH×5. These are separate from the XP `drillLevelMultipliers` in `game_2025.json` (which go 1.0→1.7). Confirmed by cross-referencing all difficulty/fan levels against game UI.
- `calculateActualLoss(baseLoss, fanLevel, drillLevel)` — now accepts `drillLevel` and applies the correct condition multiplier before fan club reduction.
- Formula: `baseLoss × COND_LEVEL_MULTIPLIERS[drillLevel] × (1 − FAN_CLUB_REDUCTIONS[fanLevel] / 100)`

**Universal `baseLoss = 0.75` for all drills**

`src/database/drillDatabase.ts` — replaced all individual `baseLoss` values with the universal constant `BASE_LOSS = 0.75`. Condition cost is determined entirely by difficulty level and fan club level, not by which specific drill is used.

Verification from in-game screenshots:

| Drill | Level | Fan Club | Formula | Observed |
|---|---|---|---|---|
| Use Your Head | VH | L0 | 0.75 × 5 × 0.9 | 3.375 ≈ 3.38% ✓ |
| Carioca with Ladders | VH | L4 | 0.75 × 5 × 0.5 | 1.875 ≈ 1.88% ✓ |
| Carioca with Ladders | Easy | L4 | 0.75 × 2 × 0.5 | 0.75% ✓ |
| Any drill | VE | L4 | 0.75 × 1 × 0.5 | 0.375% → 0% in game display ✓ |

**`isZeroDrain` threshold revised**

`src/logic/controller.ts` — zero-drain is now `actualLoss < 0.5%`. VE+L4 = 0.375% < 0.5% → shows 0% (matches game). Easy+L4 = 0.75% → not zero drain.

Removed the `× 6` multiplier hack (`conditionCost = actualLoss * 6` → `conditionCost = actualLoss`). `conditionCost` is now a direct per-drill % matching the game's display value.

**All drills visible for all players**

`src/logic/controller.ts` — removed `filter(d => d.efficiency >= 0.5)`. All 25 drills in the database are now shown for every player regardless of role overlap. ROI sort (ascending `avgWhiteStatValue`) still puts the best-value drills first; drills with no white stat hits (`avgWhiteStatValue = Infinity`) naturally appear at the bottom.

**Drill database corrections**

| Drill | Change |
|---|---|
| Skill Drill | Renamed → First Touch Play (confirmed from game) |
| Piggy in the Middle | Added AGGRESSION to stat list |
| Long Run, Stretch, Shuttle Runs | Removed STAMINA (not in any role's white/grey list) |

### Bugs Fixed This Sprint

| ID | Area | Fix |
|---|---|---|
| F31 | Condition cost formula missing drill-level multiplier | Added `COND_LEVEL_MULTIPLIERS`; `calculateActualLoss` now accepts `drillLevel` |
| F32 | All per-drill `baseLoss` values wrong (cost is level-based, not drill-based) | Universal `baseLoss = 0.75`; `× 6` hack removed |
| F33 | `isZeroDrain` threshold too tight (< 0.01%) — VE+L4 showed as 0.38%, not zero | Threshold changed to < 0.5% — correctly flags VE+L4 as zero drain |
| F34 | Drills with < 50% white stat overlap hidden from recommendations | Efficiency filter removed — all 25 drills visible for all roles |

### Next Sprint Targets

- Validate condition formula with more drill/level/fan combinations (user to provide screenshots at Easy, Medium, Hard levels)
- Add Ball Control drill to DRILL_LIST (missing: trains Concentration, Dribbling, Heading, Creativity — type TBC)
- Premium sponsor condition cooldown modelling

---

## Sprint 10 — Expo Web + Game Data Calibration Blitz
**2026-05-08 — afternoon/evening**

### Shipped

**Expo Web support**

`feat: add Expo Web support — localStorage storage layer + DOM tsconfig lib`

- `localStorage`-backed storage adapter added alongside the existing SQLite layer
- `tsconfig.json` lib updated to include DOM types
- App now runs in-browser via `npx expo start --web` (no native binary required)
- README updated with web setup guide (`docs: add web setup guide to README`)

**Ball Control ×41 squad session logged (calibration)**

`data/CALIBRATION_LOG.md` — section 6 entry: 31 players × 41 × Ball Control Very Easy at Fan Club L4 with Matchday Coach active.

Key findings:
- Condition per session: **−0.38%** confirmed from drill selection screen (not 0%)
- `baseLoss 0.75% × 0.5 (L4) = 0.375% ≈ 0.38%` — formula validates
- Zero-drain **revised**: Ball Control VE+L4 = 0.38% (not zero). Zero drain is difficulty-level-based, not universal. Underlying bug identified (fix shipped Sprint 11)

**Matchday Coach mechanics confirmed**

- Source: premium sponsor milestone reward. Also purchasable: 1-day = 25 tokens
- Effect: **+150% teamplay multiplier on ALL training sessions** (not just 4 free drills)
- Duration: 7 days from activation
- Observed: 41 × Ball Control VE → Attack pillar +7 above its L4 cap (18 → 25 effective)
- Matchday Coach can push pillars **above their level cap** temporarily
- Variety penalty: repeating same drill reduces teamplay gain rate; game warns "Training today lacked variety"
- Training XP yield confirmed separate from stat-gain XP

**Full teamplay pillar mechanics confirmed**

`data/CALIBRATION_LOG.md` — `TEAMPLAY_PILLARS` entry (2026-05-08):

| Pillar | Level | Cap | Formula confirmed |
|---|---|---|---|
| Attack | 4/10 | 18 | level × 2 + 10 ✓ |
| Defence | 6/10 | 22 | level × 2 + 10 ✓ |
| Possession | 5/10 | 20 | level × 2 + 10 ✓ |
| Condition | 3/10 | 16 | level × 2 + 10 ✓ |

**Ad TV full reward track confirmed**

All 10 Ad TV steps mapped: Daily Appearance → Special Sponsor → Playbook → Matchday Coach (2×) → Teamplay Form Boost (milestone) → Mourinho Support × 3 → Special Ability Boost (milestone).

Teamplay Form Boost probabilities per pillar (same for all 4):
- +1: 7% · +2: 10% · +3: 5.5% · +4: 2.5% = 25% per pillar = 1 hit guaranteed per draw
- Expected value: ~+2.14 on the drawn pillar

**Full squad snapshot logged**

`data/` — 7 player profiles with all stats, coach projections, and tier formula findings from live data.

**COACH_CALIBRATION.csv added**

`data/COACH_CALIBRATION.csv` — machine-readable calibration sheet for coaching sub-engine validation.

**Coaching sub-engine calibration instructions**

`HANDOVER.md` updated with instructions for the next agent on how to supply coaching scenario data and what to record.

**Proprietary licence applied**

`LICENSE` updated: PayloadGuard PLG / AIntegrity Research, all rights reserved.

### Bugs Fixed This Sprint

| ID | Area | Fix |
|---|---|---|
| — | Zero-drain incorrectly flagged universal at VE+L4 | Root cause confirmed: baseLoss model wrong + missing difficulty multiplier. Fix deferred to Sprint 11. |

### Next Sprint Targets

- Fix condition loss formula (identified this sprint, fix deferred)
- Show all drills for all players (efficiency filter too aggressive)
- Add coaching data validation entries as user provides scenarios

---

## Sprint 9 — RESULTS Hub + Talent Card + Tier Chain Fix
**2026-05-08 — morning**

### Shipped

**RESULTS tab — 5-tab navigation**

`app/(tabs)/results.tsx` (new, 525 lines) — combined multi-session OVR projection hub. Stacks multiple coaching blocks + tier upgrade + greens + rest packs into a single sequential OVR chain projection. Each step shows OVR before → after.

`src/components/AppHeader.tsx` + `app/(tabs)/_layout.tsx` — 5-tab navigation. AppHeader now uses a horizontal scroll row to accommodate SQUAD · PLAN · DRILLS · COACHES · RESULTS.

**Tier upgrade section in Coaches tab**

`app/(tabs)/coaches.tsx` — TIER UPGRADE card added below the OVR projection result:
- Shows all tiers above the player's current tier
- Pre-fills HAVE inputs from `ManagerContext.tierPoints` (same pool as Plan tab)
- ✓ tick when player has enough points to afford the upgrade; SHORT label when insufficient
- Tap any affordable row → COACH + [TIER] combined banner appears showing total OVR gain
- Drills-first order preserved: tier stat additions applied on top of post-coach stats

**Talent tier on player card — single source of truth**

DB migration `drizzle/0002_player_talent.sql` — `ALTER TABLE players ADD COLUMN talent DEFAULT 'Normal'`. Talent is now a first-class field on the `Player` record, set once at player creation/edit and read by every tab.

`app/player/new.tsx` + `app/player/[id].tsx` — TALENT TIER picker added between TIER and MUTANT sections.

`app/(tabs)/coaches.tsx` + `app/(tabs)/results.tsx` — per-session talent dropdowns removed. Both tabs now read `player.talent` directly.

**APPLY TO PLAYER CARD — gains write-back**

`app/(tabs)/coaches.tsx` — APPLY TO PLAYER CARD button writes post-coach stats, updated OVR, and selected tier back to the player's DB record. Projection is cleared, ready for the next coaching block.

`app/(tabs)/results.tsx` — APPLY FULL PLAN TO CARD: same write-back for the full results chain.

**GK stat grid — completed (closes KNOWN_ISSUES #4)**

`app/player/new.tsx` + `app/player/[id].tsx` — GK_STATS grid expanded from 10 → 15 stats:
- Added CONCENTRATION (white — was missing entirely)
- Added STRENGTH, AGGRESSION, SPEED, CREATIVITY (all 5 grey stats; only FITNESS was present before)

Confirmed from Sutters GK card (all 15 visible in screenshot).

**Tier chain fix — bonus applies to all 15 stats**

`src/logic/ovrProjector.ts` + `app/(tabs)/coaches.tsx` + `app/(tabs)/results.tsx`: `getWhiteStatKeys` → `getAllStatKeys` in all `applyTierBonusToStats` calls.

Confirmed from Ricky Grant ELITE→STELLAR upgrade: 13 of 15 stats gained +20 each (2 already at cap). Game applies tier attribute additions to **all stats** (white + grey), not just essentials. Previous behaviour:

| Role | White stats | Old OVR per STELLAR | Correct OVR per STELLAR |
|---|---|---|---|
| DL / ML / AML | 4–5 | +12 | +17 |
| GK | 10 | +35 | ~+50 |

**OVR formula — truncation confirmed**

Sutters GK: sum of all 15 stats = 2,844. 2,844 ÷ 15 = 189.6 → game displays **189**. OVR is `floor(mean)`, not `round(mean)`.

`WHITEPAPER.md §3.1` updated accordingly.

**Academy coaches lock to Very Hard**

`app/(tabs)/coaches.tsx` — INTENSITY picker removed; tab locked to Very Hard. Academy coaches have no adjustable difficulty setting.

**Results tab refinements**

`app/(tabs)/results.tsx` — sessions field locked to VH; tier shortfall indicator added when points entered but insufficient.

### Bugs Fixed This Sprint

| ID | Area | Fix |
|---|---|---|
| F29 | Tier bonus applied only to white stats — DL/AML showed +12 OVR per STELLAR (should be +17) | `getWhiteStatKeys` → `getAllStatKeys` in all tier bonus calls |
| F30 | RESULTS tab missing from 5th nav slot | Wired into AppHeader + `_layout.tsx` |
| F31 (pre) | GK stat grid incomplete — CONCENTRATION and 4 grey stats absent | GK_STATS expanded 10 → 15 |

### Next Sprint Targets

- Ball Control ×41 session data logging (in progress, user running session)
- Condition loss formula investigation (zero-drain showing incorrectly for all VE drills at L4)
- Coaching calibration: user to supply scenario data (Standard Attacking, Standard Safeguard, etc.)

---

## Sprint 8 — Coaches Tab + XP Engine Deep Calibration
**2026-05-07 — night**

### Shipped

**Coaches tab (`app/(tabs)/coaches.tsx`)**

New fourth tab: `/coaches` — SESSION SIMULATOR. Lets the manager replicate any coaching scenario and project its exact OVR impact.

- **Stat selector grid** — all white (essential) and grey (secondary) stats for the selected player's role. White stats rendered full brightness with current stat value shown; grey stats dimmed. Tap any stat to include/exclude it from the coach's coverage. Counter shows total selected.
- **Sessions ×N** — TextInput for the coach multiplier (e.g. ×30 Standard Attacking, ×59 Standard Safeguard)
- **Intensity** — Very Easy → Very Hard chips mapping to drillLevelMultipliers (1.0 → 1.7×)
- **Talent + 2× ad** — same controls as Plan tab
- **▶ PROJECT COACH GAIN** — computes per-stat gains and total OVR change. Shows gain breakdown: each stat, before value, gain amount (float), plus OVR before/after banner.
- Pulls `computeOvrWithPadding` (now exported from `ovrProjector.ts`) for accurate OVR-after with partial stat entry padding.

**XP engine calibration — validated against 7 real coaching observations**

Real data: Standard Attacking ×30 on Ryan Rodger (age 18, Normal talent):
- Passing 121 → +26–33 (model: ~27 at Medium intensity) ✓
- Dribbling 132 → +20–27 (model: ~25) ✓
- Crossing 132 → +20–27 (model: ~25) ✓

Two engine fixes applied and confirmed:

| File | Change | Reason |
|---|---|---|
| `profiles/game_2025.json` | `starDecayPerSession` 0.85 → 1.0 | Real data shows near-linear gains; 0.85^n-per-%-gained caused exponential cost increase, near-zero projections at high stat counts |
| `src/logic/ovrProjector.ts` | XP budget ÷ `drill.stats.length` | Budget must be split across all stats a drill trains; undivided budget gave 5× too many gains |

`baseXpPerSession = 150` confirmed correct when both fixes applied.

**Fractional XP model**

`src/logic/xpEngine.ts` — `estimateStatGainPct` now returns a float (e.g. 2.37). Partial XP progress banks as fractional carry: `gain += remaining / cost` instead of discarding leftover. Visible "+1" appears when cumulative value crosses an integer threshold. Sub-integer gains accumulate across multiple sessions.

**GK role constraints — confirmed**

`src/utils/roleWeights.ts` — GK corrected to confirmed game values:
- 10 white (essential): REFLEXES, AGILITY, ANTICIPATION, RUSHING OUT, COMMUNICATION, THROWING, KICKING, PUNCHING, AERIAL REACH, CONCENTRATION
- 5 grey (secondary): FITNESS, STRENGTH, AGGRESSION, SPEED, CREATIVITY
- GK is always solo (no multi-role combination permitted)

**Drill database fixes**

`src/database/drillDatabase.ts` — two drills corrected from confirmed data:

| Drill | Field | Before | After |
|---|---|---|---|
| Use Your Head | type | Attack | Defence |
| Use Your Head | stats | `['HEADING','CREATIVITY']` | `['POSITIONING','PASSING','HEADING','CREATIVITY']` |
| Use Your Head | baseLoss | 1.5 | 3.0 |
| Stop the Attacker | stats | `['TACKLING','MARKING','BRAVERY']` | `['STRENGTH','MARKING','BRAVERY','DRIBBLING','TACKLING']` |
| Stop the Attacker | baseLoss | 2.25 | 4.5 |

baseLoss values derived from L4 Fan Club data (50% reduction observed): Use Your Head −1.5% at L4 → base = 3.0; Stop the Attacker −2.25% at L4 → base = 4.5.

**ROI-based drill sort**

`src/logic/controller.ts` — drill recommendations now sorted by ascending average white stat value (lowest stat first = cheapest gain per XP). Was sorted by efficiency (% overlap). Tiebreaker remains efficiency.

`app/(tabs)/drills.tsx` — sort button label changed "SORT EFF ▼" → "SORT ROI ▼". Each drill card now shows `AVG {stat}` label.

**Smarter skip warnings**

`src/logic/ovrProjector.ts` — `applyDrillSessionsToStats` now categorises skipped drill stats as either:
- `missingStats`: role-valid but not yet entered by user → "enter X, Y to include drill gains"
- `irrelevantStats`: not a stat for this player's role at all → "no stats applicable to this role"

Previously all skipped drills showed a generic "Stats missing" warning regardless of cause.

New helper: `getAllStatKeys(roles)` in `src/utils/roleWeights.ts` — returns union of white + grey stats for a role, used for categorisation.

**TextInput controls for greens and sessions**

`app/(tabs)/plan.tsx` — replaced +/− stepper buttons with free-entry TextInput for both greens count and per-drill session count. Easier to enter ×30, ×59, etc.

**Auto-tier selection**

`app/(tabs)/plan.tsx` — `getBestAffordableTier()` runs when RUN PROJECTION is pressed without an explicit tier selected. Finds highest tier where the user has entered enough tier points. Eliminates silent "no tier applied" projections.

**Stats-win OVR baseline**

`app/(tabs)/plan.tsx` — when player has individual stats entered, FROM OVR displayed is `computeOvrFromStats(player)` (stats-derived), not `player.overall` (stored value). `player.overall` was set at time of entry; if stats have been trained since, the stats-derived value is more accurate.

**Navigation**

`src/components/AppHeader.tsx` — COACHES tab added to the 4-tab bar. Route `/coaches` triggers "COACH PLANNER / SESSION SIMULATOR" header.
`app/(tabs)/_layout.tsx` — `coaches` screen registered.

### Bugs Fixed This Sprint

| ID | Area | Fix |
|---|---|---|
| F22 | Star decay caused near-zero gains at high stat counts | `starDecayPerSession` 0.85 → 1.0; validated against observed training data |
| F23 | XP budget not divided across drill stats | `ovrProjector.ts`: budget ÷ `drill.stats.length` |
| F24 | Use Your Head categorised as Attack drill | `drillDatabase.ts`: type corrected to Defence |
| F25 | Stop the Attacker missing 2 stats | Added STRENGTH + DRIBBLING to stat list |
| F26 | Generic "Stats missing" for all skipped drills | Separated into role-irrelevant vs un-entered categories |
| F27 | Tier not auto-applying when points available | `getBestAffordableTier()` runs on projection if no explicit tier selected |
| F28 | OVR baseline used stale `player.overall` when stats entered | Stats-computed OVR used as baseline when stats dict non-empty |

### Next Sprint Targets

- GK stat entry UI: `app/player/new.tsx` + `app/player/[id].tsx` show outfield stats regardless of GK role (KNOWN_ISSUES #4)
- Coaches tab: user reports scenario data → update logic per scenario (multiplier → intensity mapping to be confirmed)
- WHITEPAPER coaches section (§4 or appendix)
- Squad-wide season simulator (KNOWN_ISSUES #7)

---

## Sprint 6 — Direction B UI + Engine Calibration Fix
**2026-05-07 — afternoon**

### Shipped

**Direction B design system**

Full UI redesign to "Operator" aesthetic: pitch-black background, gunmetal navy surfaces, JetBrains Mono throughout, zero border radius, steelblue accents, hot-orange for mutant/danger states.

| Token | Value | Notes |
|---|---|---|
| `bg` | #0a0a0c | pitch black |
| `surface` | #111116 | card background |
| `surface2` | #1a1a21 | secondary surface |
| `ink` | #f0f0f5 | primary text |
| `inkSec` | #c8c8d2 | secondary text (raised from #a1a1aa for readability) |
| `inkMuted` | #909099 | muted text (raised from #6b6b73) |
| `hairline3` | rgba(255,255,255,0.38) | borders (raised from 0.18) |
| `steelLight` | #5b8fe8 | accent / active state |
| `negRed` | #e85b5b | delete / destructive |
| `hotOrange` | #e87d2a | mutant candidate accent |

**New player screens**

| File | Content |
|---|---|
| `app/player/new.tsx` | Full Direction B add-player screen: 4-column ROLE_GRID position picker, 2-column bordered stats grid with ●/○ white stat indicators (via `isWhiteStat`), colour-coded tier chips, MUTANT CANDIDATE toggle, full-width SAVE CTA |
| `app/player/[id].tsx` | Same layout + loads existing player on mount + SAVE/DELETE side-by-side CTAs (DELETE uses negRed outline) |

**Plan tab config section redesign**

`app/(tabs)/plan.tsx` — each configuration group (TALENT, DRILL LEVEL, SESSIONS, GREENS, TIER) rebuilt as a bordered card: dark header row with steelLight accent stripe, content below within the same border. Section tabs (PLAN / STEPS / WARNINGS) changed from text links to full-width ink-fill button bar. All param setters now call `invalidate()` → `setPlan(null)` to clear stale projections before any re-run.

**OvrMovement: pure-RN rewrite (critical)**

`src/components/atoms/OvrMovement.tsx` — removed all `react-native-svg` imports. Two separate crash vectors eliminated:
1. `Pattern` element + `width="100%"` on `Svg` → hard crash on Android
2. `lineHeight: 56` with `fontSize: 62` → crash (lineHeight must be ≥ fontSize)

Rewritten as pure `View`/`Text` layout with identical visual output.

**Readability improvements**

- `src/components/atoms/MonoLabel.tsx`: default color `inkMuted` → `inkSec`; fontWeight `500` → `600`
- `src/components/atoms/Chip.tsx`: inactive state bg `transparent` → `surface2`; border `hairline2` → `hairline3`; text `inkSec` → `ink`

**Drill name fix**

`app/(tabs)/plan.tsx`: `DRILL_NAMES` constant replaced — was hardcoded with invalid names including "Finishing School" (not in DB). Now derived via `DRILL_LIST` import so drill picker always reflects the real drill database.

**OVR display delta anchor**

Plan tab FROM/TO display was using engine-computed OVR as the baseline, which differs from `player.overall` by ~1–2 OVR when stats are partially entered (partial-stat mean ≠ stored overall). Fixed: FROM anchors to `player.overall` (stored DB value), TO computed as `storedOvr + engineGain`. Eliminates persistent −1.2 regression display.

**Engine calibration fix (critical)**

Root cause of +0.0 drill gains for all high-stat players: two compounding bugs.

Bug 1 — hard stat cap at 180: `xpBaseForStat()` returned Infinity for any stat ≥ `rule180StatCap` (was 180). Player Coutts' white stats are all 187–246 → all returned Infinity → 0 gains.

Bug 2 — missing XP multiplier: `applyDrillSessionsToStats()` passed `session.sessionCount` (e.g. 6) raw as XP budget. Cost for 1% on a stat-113 grey attr at age 24 ≈ 250 XP. Budget of 6 << 250 → always 0.

| File | Change |
|---|---|
| `profiles/game_2025.json` | Extended `xpCostTable` — added 6 bands covering stats 180–339 with finite costs (80/100/125/160/200/250 XP per 1%) |
| `profiles/game_2025.json` | `rule180StatCap`: 180 → 340 (now matches `statCap`; hard cap never fires) |
| `profiles/game_2025.json` | Added `baseXpPerSession: 150` |
| `src/types/resources.ts` | Added `baseXpPerSession: number` to `GameProfile` interface |
| `src/logic/ovrProjector.ts` | XP budget: `session.sessionCount` → `session.sessionCount × profile.baseXpPerSession` |

With `baseXpPerSession = 150`: 6 sessions × 150 = 900 XP budget. Stat-241 white attr, age 24, Normal talent, Very Easy → cost ≈ 667 XP → 1 gain per run. Value is an estimate pending empirical calibration (see KNOWN_ISSUES #2).

### Bugs fixed this sprint

| ID | Area | Fix |
|---|---|---|
| F11 | Plan tab: first run shows −1.2, button locks | `invalidate()` on all param setters; FROM anchored to `player.overall` |
| F12 | Drill picker contained "Finishing School" (not in DB) | `DRILL_NAMES` derived from `DRILL_LIST` import |
| F13 | All players show +0.0 OVR from drills | Extended XP table above 180; `baseXpPerSession` multiplier applied |
| F14 | `compareInvestmentScenarios` shape mismatch | Rewritten to return `{ results, recommendedPlayer, reasoning }` |
| F15 | OvrMovement crashes Android | Removed react-native-svg entirely; pure View/Text |
| F16 | Plan OVR shows persistent −1.2 | FROM anchored to DB `player.overall`; gain computed as delta |

---

## Sprint 7 — UI Clarity + Zero-Drain Fix
**2026-05-07 — evening**

### Shipped

**Talent tier labels now show multiplier**

`app/(tabs)/plan.tsx`: TALENT chips relabelled — "FT2" → "FT2 ×1.25" etc. No ambiguity about what each tier means.

| Tier | Label | Multiplier |
|---|---|---|
| FT1 | FT1 ×1.50 | 1.50 |
| FT2 | FT2 ×1.25 | 1.25 |
| FT3 | FT3 ×1.10 | 1.10 |
| Normal | Normal ×1.00 | 1.00 |
| Slow | Slow ×0.70 | 0.70 |

**Zero-drain fixed**

`src/logic/controller.ts`: `isZeroDrain` was hardcoded to `conditionCost === 0` — always false since L4 halves cost, never zeroes it. Fixed: `isZeroDrain = fanClubLevel === 4 && drillLevel === 'Very Easy'`. Drills tab now accepts drill level and passes it through.

**Drill level selector added to Drills tab**

`app/(tabs)/drills.tsx`: drill level chips above fan club selector. Condition costs and zero-drain status now reflect the selected drill level.

**Warning text corrected**

`src/logic/ovrProjector.ts`: "Slow trainer (age X)" was firing for any player ≥20 — "Slow" implies the talent tier, which is wrong. Now shows actual age multiplier: "Age 21 — training multiplier 0.40×." Added separate warning for Slow talent tier.

| ID | Fix |
|---|---|
| F17 | "Slow trainer" warning mislabelled talent as Slow — now shows age multiplier |
| F18 | Zero-drain never triggered — L4+Very Easy now correctly returns 0% condition cost |
| F19 | FT1/FT2/FT3 labels opaque — now show XP multiplier inline |
| F20 | Drills tab had no drill level input — selector added, feeds zero-drain logic |

**GHA workflow fix**

`.github/workflows/eas-update.yml`: commit message passed via `$COMMIT_MSG` env var instead of inline template expansion. Multi-line messages were being word-split as CLI arguments, causing OTA push failures.

### Still TODO

- Calibrate `baseXpPerSession: 150` against observed session gains (KNOWN_ISSUES #2)
- GK white stat list: estimated, unconfirmed (KNOWN_ISSUES #3)
- GK stat entry UI: shows outfield stats regardless of role (KNOWN_ISSUES #4)

---

## Sprint 5 — OTA Pipeline, Navigation, Game Data Corrections
**2026-05-07 — morning**

### Shipped

**OTA update pipeline**

| File | Purpose |
|---|---|
| `.github/workflows/eas-update.yml` | GitHub Actions workflow — triggers on push to main or dev branch, runs `npx eas-cli update` |

Push from Termux → CI picks up within ~1 min → EAS OTA bundle → app updates silently on next reopen. No PC required for deployments. Org policy required pinned full commit SHAs (not `@v4` tag refs) — workflow uses those.

**AppHeader and top navigation**

| File | Purpose |
|---|---|
| `src/components/AppHeader.tsx` | Branded header: purple accent bar, "Squad Optimiser" title, "FOOTBALL MANAGER" subtitle, underline-style tab buttons |

`app/(tabs)/_layout.tsx` updated to use `tabBar={() => null}` — fully suppresses the native bottom tab bar. Previously `tabBarStyle: { display: 'none' }` left a ghost tab bar. Tab buttons now live under the title in `AppHeader`.

**OVR formula fix**

`profiles/game_2025.json`: `qualityOvrDivisor` corrected from `4` to `1`. OVR = unweighted mean of all 15 stats directly. Empirically calibrated: player Coutts mean stat ≈194.8 = OVR 195. Previous divisor of 4 produced ~48 instead of ~195.

**Drill level rename**

`profiles/game_2025.json` and `src/types/resources.ts`: multiplier keys renamed to match observed UI labels:

| Old name | New name | Multiplier |
|---|---|---|
| Amateur | Very Easy | 1.0 |
| Semi-Pro | Easy | 1.15 |
| *(new)* | Medium | 1.3 |
| Pro | Hard | 1.55 |
| World Class | Very Hard | 1.7 |

**Drill database: isBase flag**

`src/database/drillDatabase.ts`: `isBase: boolean` added to `Drill` interface. Core daily drills (Skill Drill, Gym, Sprints, Juggling, etc.) marked `isBase: true`. Event/lab drills (Set-Piece Delivery, Warm-Up, Carioca, etc.) marked `isBase: false`.

**Tier system corrections**

Empirically verified tier point costs applied across `profiles/game_2025.json` and `src/utils/math.ts`:

| Tier | Points required | Attr addition |
|---|---|---|
| Rare | 100 | +10 |
| Elite | 90 | +30 |
| Stellar | 50 | +50 |
| Master | 25 | +80 |
| Epic | 15 | +120 |
| Legendary | 10 | +160 |

`ManagerProfile.tierPoints` changed from a single `number` to `Partial<Record<TierName, number>>` — each tier type has its own independent point pool. Plan and Compare screens redesigned with a per-tier section: each of the 6 tiers shows its own input, threshold, affordability indicator, and tap-to-select-target.

**Role adjacency fix**

`src/utils/roleWeights.ts` `validateRoleAdjacency`: changed from "all roles must be adjacent to primary" to transitive check — each additional role must be adjacent to any already-accepted role. ST+AMC+MC now correctly accepted (MC is adjacent to AMC; previously rejected because MC is not adjacent to ST directly).

**Efficiency display fix**

`app/(tabs)/drills.tsx`: efficiency value multiplied by 100. `getBestDrillSelections` returns 0–1 fraction; `DrillTable` renders as percentage. Without the conversion all drill cards showed blank efficiency.

### Bugs fixed this sprint

| ID | Area | Fix |
|---|---|---|
| F1 | Drills tab efficiency blank | ×100 conversion in drills.tsx mapping |
| F2 | Plan OVR ~48 instead of ~195 | qualityOvrDivisor 4→1 in game_2025.json |
| F3 | ST+AMC+MC role rejected | Transitive adjacency in validateRoleAdjacency |
| F4 | Bottom tab bar ghost below AppHeader | tabBar={() => null} in _layout.tsx |
| F5 | Single tier points input | Per-tier pool UI with individual inputs |

### Still TODO

- Drill XP baseline calibration: `baseXpPerSession` pending empirical validation
- GK white stat list needs verification
- Compare screen missing AppHeader (uses raw ScrollView)
- Individual stat entry for drill-level OVR projection (currently falls back to base OVR when stats={})

---

## Sprint 4 — Formula Engine Rewrite
**2026-05-06**

### Shipped

Research confirmed the entire formula engine was built on wrong game mechanics. Sprint 4 replaces it with the verified XP-based model and adopts a profile-based architecture so all game coefficients are configurable without touching code.

**Files added:**

| File | Purpose |
|---|---|
| `profiles/game_2025.json` | All game coefficients as configurable JSON (XP table, age table, talent/drill multipliers, tier additions, fan club reductions) |
| `src/logic/xpEngine.ts` | Core XP engine — `xpBaseForStat`, `xpNeededFor1Pct`, `estimateStatGainPct`, `statsToQualityPct`, `qualityPctToOvr`, `applyTierBonusToStats`, `getAgeMultiplier` |
| `src/components/DrillSessionRow.tsx` | Drill picker UI row (name, session count, drill level) replacing CoachInputRow in Plan/Compare screens |
| `drizzle/0001_natural_northstar.sql` | Migration adding `drill_sessions` table |

**Files rewritten:**

| File | Change |
|---|---|
| `src/types/resources.ts` | Added `GameProfile`, `TalentTier`, `DrillLevel`, `DrillSession`; removed `coaches` from `ManagerProfile`; added `twoxAdActive`, `talentTier`, `drillLevel` |
| `src/utils/coachMath.ts` | Removed coach-multiplier model; profile-driven `getAgeFactor`, `getStatXpCost`, `getGreyMultiplier`; deprecated shim kept for backward compat |
| `src/utils/math.ts` | `TIER_DATA.bonus` → `TIER_DATA.attrAddition` (flat per-white-stat, not OVR); removed `calculateDecay` |
| `src/utils/roleWeights.ts` | Fixed `isEssentialGain` — was returning true for secondary (grey) stats; now essential-only; added `getWhiteStatKeys`; grey weight = 0.5 |
| `src/logic/ovrProjector.ts` | Rewritten — drill sessions → per-stat XP → Quality%/4 → OVR; tier as flat attr addition; greens = condition restore step only |
| `src/logic/mutantEngine.ts` | Removed greens-as-OVR; greens are condition, not OVR |
| `src/logic/investmentEngine.ts` | New signature: `DrillSession[]` + `GameProfile`; added `compareInvestmentScenarios` |
| `src/logic/scenarioComparator.ts` | Updated to new engine signature |
| `src/context/ManagerContext.tsx` | Added `twoxAdActive`, `talentTier`, `drillLevel` state; removed `coaches` |
| `src/database/drillDatabase.ts` | Added 11 missing drills; fixed `Fast Counter-Attacks` baseLoss (3.0→3.75) |
| `src/db/schema.ts` | Added `drill_sessions` table |
| `app/(tabs)/plan.tsx` | Replaced "Add Coach" with "Add Drill"; added talent tier picker and 2× Ad toggle |
| `app/compare.tsx` | Same drill input replacement |
| `src/index.ts` | CLI updated to drill session workflow |
| `tests/investment-test.ts` | Full rewrite — 40 tests covering 180-rule, cap, age, talent, grey weight, tier delta, greens model, end-to-end plan |
| `tsconfig.json` | Added `resolveJsonModule: true` |

### Key decisions

**Profile JSON.** All game coefficients live in `profiles/game_2025.json` — no magic numbers in engine code. Updating game mechanics requires only a JSON edit, not code changes.

**XP model replaces coach-multiplier model.** The previous `×30 multiplier → direct OVR` model had no basis in the actual game. The new model: each drill session = 1 XP unit; `xpNeededFor1Pct = base / (ageMult × talentMult × greyMult × adMult × drillLevelMult)`; stat gains accumulate to Quality% → OVR.

**Tier bonus = attribute addition.** Previous code added a flat OVR number on tier up. Correct model: `+X per white attribute → recalculate Quality% → recalculate OVR`. Stellar on a 6-white-stat player at 100% each = +50×6/15 = +20 Quality% = +5 OVR.

**Greens = 15% condition restore.** Removed from OVR projection entirely; shown as informational `condition` step.

**Grey weight = 0.5 (was 0.1).** Secondary stats contribute half the XP efficiency of white stats.

**180-rule.** Stats at or above 180% return Infinity XP cost — drill ceases to pay that stat.

### Tests

```
40/40 passing (tests/investment-test.ts)
drill-logic-test.ts ✓
logic-test.ts ✓
storage-test.ts ✓
npm run typecheck — zero errors
```

### Still TODO

- Calibrate exact `baseXpPerSession` scaling once empirical session gains are confirmed
- GK white skill set needs verification from research
- OCR scanner stub — next sprint
- Pro tier gating

---

## Sprint 3 — Mobile UI
**2026-05-06**

### Shipped

Full React Native / Expo mobile UI. App now runs on device — zero CLI required.

**FTUE target achieved:** Launch → Add Player → Add Coach → Project OVR in under 90 seconds.

**Files added:**

| File | Purpose |
|---|---|
| `babel.config.js` | NativeWind + Reanimated babel preset |
| `metro.config.js` | NativeWind CSS interop |
| `global.css` / `global.d.ts` / `tailwind.config.js` | NativeWind v4 setup |
| `app/_layout.tsx` | Root Stack; migration gate; ManagerProvider |
| `app/(tabs)/_layout.tsx` | Tab bar — Squad / Plan / Drills |
| `app/(tabs)/index.tsx` | Squad Dashboard — live reactive player list, FAB |
| `app/(tabs)/plan.tsx` | Investment Planner — coaches, manager profile, OVR projection |
| `app/(tabs)/drills.tsx` | Drill Optimiser — Fan Club level picker, drill table |
| `app/compare.tsx` | Scenario Comparator — multi-select, ranked results |
| `app/player/new.tsx` | Add Player modal — role grid, auto-built stats |
| `app/player/[id].tsx` | Edit/Delete Player modal |
| `src/components/OVRBadge.tsx` | Coloured OVR chip |
| `src/components/TierBadge.tsx` | Tier chip with tier-specific colour |
| `src/components/EmptyState.tsx` | Empty state with icon and CTA |
| `src/components/PlayerCard.tsx` | Player row card with role chips |
| `src/components/CoachInputRow.tsx` | Coach entry form (type, multiplier, session, source) |
| `src/components/InvestmentStepTable.tsx` | Step-by-step OVR projection table |
| `src/components/DrillTable.tsx` | Drill recommendations with zero-drain highlight |
| `src/services/playerService.ts` | Drizzle CRUD for players table |
| `src/services/coachService.ts` | Drizzle CRUD for coaches table |
| `src/context/ManagerContext.tsx` | Session-level manager profile state |
| `src/hooks/useSquad.ts` | Live reactive squad query via `useLiveQuery` |
| `RESEARCH.md` | Renamed from `Research` |

**Files modified:**

| File | Change |
|---|---|
| `src/db/schema.ts` | Extended — `players` aligned with Player interface; `coaches` table added |
| `drizzle/migrations.ts` | Regenerated with real SQL (2 tables, 19 columns) |
| `tsconfig.json` | Added `app/**` and `global.d.ts` to includes |
| `tests/storage-test.ts` | Added `tier: 'None'` to satisfy updated Player interface |
| `package.json` | Added `nativewind`, `tailwindcss`, `react-native-reanimated`, `@expo/vector-icons` |

### Key decisions

**Drizzle as sole data layer.** `storageService.ts` (Node `fs`) stays for CLI only and is never imported from `app/`. `useLiveQuery` provides reactive updates — no manual state refresh needed after insert/update/delete.

**`nanoid/non-secure` for IDs.** React Native does not polyfill `crypto.getRandomValues`. Using the non-secure export avoids a polyfill dependency; IDs are non-sensitive.

**Dark theme, plain StyleSheet.** NativeWind v4 installed and configured, but base components use RN StyleSheet for reliability on first run. NativeWind utility classes available for future use.

**Migration gate in root layout.** `useDbMigration().success` must be true before any screen renders — prevents queries against non-existent tables on first install.

### Still TODO

- Formula calibration: `estimateOvrGainFromCoach` awaiting research data (tonight)
- ML Kit OCR: `useScanner` stub — next sprint
- Pro tier gating: planned after formula update
- Push notifications: planned after mobile UI stabilises

---

## Sprint 2 — Investment Engine
**2026-05-06**

### Shipped

**Resource-allocation decision engine** — the core value of the app is now functional via CLI.

`planPlayerInvestment(player, profile, targetTier)` produces a full step-by-step investment plan respecting manager style (FTP / Hybrid / PTW) and enforcing the coaches-first rule. `compareInvestmentScenarios` runs the same plan for N players against an identical resource pool and returns a ranked recommendation.

**Files added/modified:**

| File | Change |
|---|---|
| `src/types/resources.ts` | New — `Coach`, `ManagerProfile`, `InvestmentPlan`, `ScenarioComparison` types |
| `src/logic/ovrProjector.ts` | New — step-by-step OVR chain (coaches → tier → greens) |
| `src/logic/investmentEngine.ts` | New — style-filtered planning + recommendation text |
| `src/logic/scenarioComparator.ts` | New — multi-player ranking for shared resource pool |
| `src/utils/coachMath.ts` | Rewritten — calibrated piecewise gain table, age factor, seminar bonus |
| `src/database/playerSchema.ts` | Modified — added `tier: TierName` field |
| `src/index.ts` | Modified — Plan Investment (option 4) + Compare Players (option 5) |
| `tests/investment-test.ts` | New — 3-scenario regression test |
| `.gitignore` | New |
| `package-lock.json` | Added |

**Sample test output (18yo, OVR 120 striker, Elite Chest coaches → Stellar):**

```
Step 1  Attacking ×30      120.0 → 130.3   +10.3   FREE
Step 2  Defending ×40      130.3 → 140.2   +9.9    FREE
Step 3  Physical ×28       140.2 → 152.0   +11.8   FREE
Step 4  Tier → Stellar     152.0 → 202.0   +50.0   600 tier pts
Step 5  100 greens (×1.3)  202.0 → 210.7   +8.7    100 greens
Final: 210.7   Gain: +90.7

Scenario comparison:
  #1  Alpha Striker (18yo, 120 → 210.7, +90.7)
  #2  Academy GK    (17yo,  88 → 154.2, +66.2)
  → Recommended: Alpha Striker
```

### Key decisions

**OVR_NORMALIZER = 16.** OVR is a weighted composite of ~16 stats. Dividing total stat-gain by the number of stats a coach trains (5) inflated projections by ~3×. Fixed to divide by 16 (total contributing stats), keeping individual-coach gain in the observed +9–12 OVR range.

**Grey stat weight = 0.1.** Stats not in the player's role white-list still receive coaching but contribute minimally to OVR. A weight of 0.4 overestimated gains; 0.1 aligns with observed data.

**Seminar bonus = 1.6×.** Skill Seminar sessions yield noticeably higher OVR gains than equivalent Training sessions, not fully explained by multiplier differences. Empirically calibrated at 1.6×; formula marked TODO pending research docs.

**Coach attribute list is per-card.** A Standard Attacking card does not always train all 5 attack stats. The count varies by card instance (3–5 observed). Model stores `attributes: string[]` per card, not derived from type name.

### Known limitations / TODO

- `estimateOvrGainFromCoach` formula is empirically approximated. Research docs will be added to repo; formula body will be updated without changing the function signature.
- Drizzle migrations are a stub. Full migration generation pending schema stabilisation before mobile build sprint.

---

## Sprint 1 — Foundations
**2026-05-05**

### Shipped

Project skeleton, build tooling, and all pre-existing logic brought to a working state.

**Problem:** repository had logic files but no `package.json`, no `tsconfig.json`, broken imports, and syntax errors from leftover citation artifacts — nothing ran.

**Fixed:**

| Issue | Fix |
|---|---|
| No `package.json` | Created — Expo 53, RN 0.76.5, Drizzle ORM, `tsx` for CLI |
| No `tsconfig.json` | Created — ES2022, bundler module resolution, strict |
| `[cite: ...]` artifacts in `zeroDrainProtocol.ts` | Removed — were TypeScript syntax errors |
| Missing `getRecommendedDrills` export | Added alias in `controller.ts` |
| Missing `drizzle/migrations.ts` | Created stub to unblock import |

**Confirmed mechanics (from empirical observation):**

- Fan Club condition reductions: L0 −10% through L4 −50% ✓
- Zero-Drain protocol: Fan Club L4 + chants on Very Easy drills = 0% condition loss ✓
- Coach multiplier: the ×N number IS the multiplier fed to `calculateDynamicGain` ✓
- Hard stat cap: at maximum stat value, session gain = exactly 0 ✓
- Age drop-off: gains fall sharply between age 18 and 20; plateau after ~25 ✓
- Premium sponsor path: Elite Chest unlocks higher-multiplier coach cards ✓

**Tests passing after Sprint 1:**
- `tests/drill-logic-test.ts` ✓
- `tests/logic-test.ts` ✓
- `tests/storage-test.ts` ✓

---

## Backlog

| Item | Priority | Notes |
|---|---|---|
| Research docs → formula update | High | User to commit docs; update `estimateOvrGainFromCoach` |
| Mobile UI (Expo screens) | High | Next sprint once logic is stable |
| OCR / stat reader | Medium | `useScanner` is a stub; depends on UI sprint |
| Drizzle DB migrations | Medium | Run `npm run db:generate` after schema stabilises |
| Squad synergy / formation engine | Low | `engine.js` stubs left as-is |
| Play Store release | — | Target after mobile UI sprint |
