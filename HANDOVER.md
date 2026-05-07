# AIntegrity Squad Optimiser — Handover Brief

**Branch:** `claude/continue-development-uXA5D`
**Last pushed commit:** `884dafd` — engine calibration fix (drill gains now work)
**To apply changes:** paste the code blocks into files via your Termux editor, then `git add <files> && git commit -m "..." && git push -u origin claude/continue-development-uXA5D`

---

## Current State Summary

The app is a React Native / Expo football squad management tool with 3 tabs: Squad, Plan, Drills.

**What works:**
- Squad tab: view/add/edit players with full Direction B (pitch-black, JetBrains Mono) UI
- Drills tab: ranked drill recommendations with efficiency display
- Plan tab: bordered config cards (talent, drill level, sessions, tier, greens), projected OVR gain, step-by-step plan
- Compare screen: head-to-head player projection with AppHeader
- OTA pipeline: push to `claude/continue-development-uXA5D` → GitHub Actions → EAS OTA update → app updates on reopen

**What's pending (4 roles below):**

---

## Role 1 — "The Historian": DEVLOG Sprint 6 + KNOWN_ISSUES update

**Files to edit:**
- `DEVLOG.md` — prepend a Sprint 6 entry (before the Sprint 5 block)
- `KNOWN_ISSUES.md` — close resolved issues, add new ones

### DEVLOG.md — Insert at top (after the `---` separator, before `## Sprint 5`)

```markdown
## Sprint 6 — Direction B UI + Engine Calibration Fix
**2026-05-07**

### Shipped

**Direction B design system**

The app UI was fully redesigned to a "Operator" aesthetic: pitch-black background (#0a0a0c), gunmetal navy surface, JetBrains Mono throughout, zero border radius, steelblue accents. Key design tokens in `src/constants/theme.ts`:

| Token | Value |
|---|---|
| `bg` | #0a0a0c |
| `surface` | #111116 |
| `surface2` | #1a1a21 |
| `ink` | #f0f0f5 |
| `inkSec` | #c8c8d2 |
| `steelLight` | #5b8fe8 |
| `negRed` | #e85b5b |
| `hotOrange` | #e87d2a |
| `mono` | JetBrains Mono |

**New screens: player/new.tsx + player/[id].tsx**

| File | Content |
|---|---|
| `app/player/new.tsx` | Add Player screen — 4-column ROLE_GRID position picker, 2-column bordered stats grid with ●/○ white stat indicators, colour-coded tier chips, MUTANT CANDIDATE toggle, full-width SAVE CTA |
| `app/player/[id].tsx` | Edit Player screen — same layout + loads existing player + SAVE/DELETE side-by-side CTAs (DELETE = negRed outline) |

**Plan tab config section**

`app/(tabs)/plan.tsx` — configuration area rebuilt as bordered cards. Each group (TALENT, DRILL LEVEL, SESSIONS, GREENS, TIER) has a dark header row with steelLight accent stripe and content below within the same border. Section tabs changed to full ink-fill button bar. All param setters call `invalidate()` → `setPlan(null)` to clear stale projections.

**OvrMovement pure-RN rewrite**

`src/components/atoms/OvrMovement.tsx` — removed all `react-native-svg` imports (Pattern element + `width="100%"` on Svg crashed Android). Rewritten as pure View/Text. Removed conflicting `lineHeight: 56` with `fontSize: 62` (lineHeight < fontSize also crashes Android).

**OVR display delta fix**

Plan tab now anchors the FROM value to `player.overall` (stored in DB) and computes TO as `storedOvr + engineGain`. Previous approach used engine-computed FROM (partial-stat mean differs from stored OVR) causing persistent -1.2 regression display.

**Contrast + readability improvements**

`src/constants/theme.ts`: raised inkSec (#a1a1aa → #c8c8d2), inkMuted (#6b6b73 → #909099), hairline3 (→ rgba(255,255,255,0.38)).
`src/components/atoms/MonoLabel.tsx`: default color inkMuted → inkSec, fontWeight 500 → 600.
`src/components/atoms/Chip.tsx`: inactive state bg transparent → surface2, border hairline2 → hairline3, text inkSec → ink.

**Drill name fix**

`app/(tabs)/plan.tsx`: `DRILL_NAMES` now derived from `DRILL_LIST` import. Was hardcoded with invalid "Finishing School" which doesn't exist in the drill database.

**Engine calibration fix (critical)**

| File | Change |
|---|---|
| `profiles/game_2025.json` | Extended `xpCostTable` — 180–339 now has finite costs (80/100/125/160/200/250 XP per 1%) |
| `profiles/game_2025.json` | `rule180StatCap`: 180 → 340 (was blocking ALL stats ≥ 180 from training; most top-level players have stats 180–250) |
| `profiles/game_2025.json` | Added `baseXpPerSession: 150` |
| `src/types/resources.ts` | Added `baseXpPerSession: number` to `GameProfile` interface |
| `src/logic/ovrProjector.ts` | XP budget: `session.sessionCount` → `session.sessionCount * profile.baseXpPerSession` |

Root cause: raw `sessionCount` (e.g. 6) was used as XP budget. Cost for 1% on a stat-113 grey attr at age 24 = ~250 XP. Budget of 6 << 250 → 0 gains every time.

### Bugs Fixed This Sprint

| Bug | Fix |
|---|---|
| Plan tab: first projection shows -1.2, button stops working | `invalidate()` added to all param setters; FROM anchored to `player.overall` |
| Drills DRILL_NAMES included "Finishing School" (not in DB) | Derived from `DRILL_LIST` import |
| All players show +0.0 OVR from drills | Two-layer fix: extended XP table above 180, added `baseXpPerSession` multiplier |
| `compareInvestmentScenarios` shape mismatch | Rewritten to return `{ results, recommendedPlayer, reasoning }` |
| OvrMovement crashes Android | Removed react-native-svg entirely; pure RN implementation |

### Next Sprint Targets

- Verify `baseXpPerSession: 150` against observed session gains
- GK white stat list — currently estimated; needs empirical confirmation
- Calibration: per-session gain reference table for common player profiles
```

---

### KNOWN_ISSUES.md — Full replacement content

```markdown
# Known Issues

## Open

| # | Area | Description | Priority |
|---|---|---|---|
| 1 | Plan / OVR projection | Drill gains skipped when player has no individual stats entered (only OVR). Engine warns and returns base OVR. Individual stat entry required for full drill projection. | High |
| 2 | XP calibration | `baseXpPerSession: 150` is an estimate. Needs empirical validation — observe stat gains per session, compare to engine output. See Role 3 handover for calibration approach. | High |
| 3 | GK white stats | `ROLE_CONSTRAINTS.GK.essential` in `src/utils/roleWeights.ts` is marked TODO — estimated as REFLEXES/AGILITY/ANTICIPATION/RUSHING OUT/COMMUNICATION. Unconfirmed. The stat entry UI also shows outfield stats for GK players. | Medium |
| 4 | GK stat entry UI | `app/player/new.tsx` always shows OUTFIELD_STATS grid regardless of role. GK needs different stats (no FINISHING/CROSSING/HEADING etc.; instead REFLEXES/HANDLING/etc.). | Medium |
| 5 | CLI drill levels | `src/index.ts` collectDrillSessions prompt updated but not yet tested end-to-end | Low |

## Fixed

| # | Area | Fix |
|---|---|---|
| F1 | Drills tab efficiency blank | `app/(tabs)/drills.tsx`: controller returns 0–1 fraction; DrillTable expects 0–100 — multiplied by 100 |
| F2 | Plan OVR ~48 instead of ~195 | `profiles/game_2025.json`: `qualityOvrDivisor` 4 → 1 (OVR = mean stat directly) |
| F3 | ST+AMC+MC role rejected | `src/utils/roleWeights.ts`: `validateRoleAdjacency` now transitive |
| F4 | Bottom tab bar ghost | `app/(tabs)/_layout.tsx`: `tabBar={() => null}` |
| F5 | Tier points single input | Per-tier pool UI with individual inputs + thresholds in plan.tsx + compare.tsx |
| F6 | Plan tab: +0.0 drill gains | Extended XP table above 180, `baseXpPerSession` multiplier added |
| F7 | Plan tab: stale projection / locked button | `invalidate()` called on all param changes |
| F8 | Compare screen shape mismatch | `compareInvestmentScenarios` returns `{ results, recommendedPlayer, reasoning }` |
| F9 | OvrMovement crashes Android | Removed react-native-svg; pure View/Text implementation |
| F10 | Plan OVR showing -1.2 | FROM anchored to `player.overall`; TO = storedOvr + engineGain delta |
```

---

## Role 2 — "The Academic": WHITEPAPER Section 3 XP Engine update

**File to edit:** `WHITEPAPER.md`

Find Section 3 and replace lines 39–79 (§3.2 and §3.3) with the following.
The key changes: line 56 removes "Infinity if statValue ≥ 180", §3.3 table gains 180+ rows, 180-rule paragraph replaced with budget explanation.

```markdown
### 3.2 XP cost per 1% stat gain

```typescript
xpNeededFor1Pct(
  statValue: number,       // current stat value (%)
  age: number,
  starsGainedInSession: number,
  talentTier: TalentTier,
  isWhite: boolean,        // essential stat for this role?
  twoxAdActive: boolean,
  drillLevelMult: number,  // from profile drillLevelMultipliers
  profile: GameProfile
): number
```

Formula:
```
base       = xpCostTable[statValue]   (see §3.3)
ageMult    = ageTable[age]
starMult   = 0.85 ^ starsGainedInSession
talentMult = talentMultipliers[talentTier]
greyMult   = 1.0 if isWhite else 0.5
adMult     = 2.0 if twoxAdActive else 1.0

xpCost = base / (ageMult × starMult × talentMult × greyMult × adMult × drillLevelMult)
```

### 3.3 XP cost table

| Stat range | XP per 1% |
|---|---|
| 0–59 | 8 |
| 60–79 | 10 |
| 80–99 | 20 |
| 100–119 | 30 |
| 120–139 | 40 |
| 140–159 | 50 |
| 160–179 | 60 |
| 180–199 | 80 |
| 200–219 | 100 |
| 220–239 | 125 |
| 240–259 | 160 |
| 260–279 | 200 |
| 280–339 | 250 |

Costs above 180 are steep but finite up to `statCap = 340`. The old "180-rule" (hard infinite block at 180) was removed — top-level players commonly hold stats in the 180–260 range.

**Session XP budget:**

```
xpBudget = sessionCount × baseXpPerSession
```

`baseXpPerSession = 150` (calibration estimate — see §10). A player doing 6 sessions of a drill generates 900 XP. Cost to gain 1% on a stat-240 white attribute for an age-24 Normal-talent player at Very Easy drill level = 160 / 0.24 ≈ 667 XP → 1 gain per 6 sessions.
```

Also update **§10 Limitations** — find the baseXpPerSession row and replace:
```
| Drill XP baseline | `baseXpPerSession` calibration pending — requires observed stat gains per session |
```
with:
```
| Drill XP baseline | `baseXpPerSession = 150` is a working estimate. Needs validation: note a player's stat before/after N sessions, compare to engine output. Adjust value in `profiles/game_2025.json` to match. |
```

---

## Role 3 — "The Calibrator": XP gain reference + calibration guide

**Task:** Create `docs/calibration-reference.md` — a table of expected % gains per scenario for common player profiles. User observes actual gains, compares, and adjusts `baseXpPerSession` in `profiles/game_2025.json`.

**How to calibrate:**
1. Pick a player whose stat value, age, talent tier, and drill level are known
2. Run N sessions of a drill that hits a stat you're watching
3. Note the % gain from the game
4. Compare to the table below — if actual > predicted, increase `baseXpPerSession`; if less, decrease it

**Formula reminder:**
```
xpBudget  = sessionCount × baseXpPerSession   (currently 150)
costPer1% = xpCostBase / (ageMult × talentMult × greyMult × drillMult)
gains      = floor(xpBudget / costPer1%)       (simplified — ignores star decay for first few %)
```

**File to create: `docs/calibration-reference.md`**

```markdown
# XP Gain Calibration Reference

`baseXpPerSession = 150` (current estimate). To adjust: edit `profiles/game_2025.json`.

## Formula

```
xpBudget  = sessions × 150
costPer1% = xpCostTable[stat] / (ageMult × talentMult × greyMult × drillLevelMult)
approx_gain = floor(xpBudget / costPer1%)
```
(Star decay makes each subsequent % slightly more expensive — actual gains are slightly less than this approximation for large budgets.)

## Expected gains — white stat, Normal talent, Very Easy drill (×1.0)

| Sessions | Age 18 (×1.0) | Age 20 (×0.55) | Age 24 (×0.24) | Age 28 (×0.14) |
|---|---|---|---|---|
| **Stat ~100** (cost 30/%) | | | | |
| 3 | 15% | 8% | 3% | 2% |
| 6 | 22% | 12% | 5% | 2% |
| 10 | 28% | 18% | 8% | 4% |
| **Stat ~150** (cost 50/%) | | | | |
| 3 | 9% | 4% | 2% | 1% |
| 6 | 18% | 9% | 3% | 2% |
| 10 | 26% | 13% | 6% | 3% |
| **Stat ~200** (cost 100/%) | | | | |
| 3 | 4% | 2% | 1% | 0% |
| 6 | 9% | 4% | 2% | 1% |
| 10 | 15% | 7% | 3% | 1% |
| **Stat ~240** (cost 160/%) | | | | |
| 3 | 2% | 1% | 0% | 0% |
| 6 | 5% | 2% | 1% | 0% |
| 10 | 9% | 4% | 2% | 1% |

## FT1 talent multiplier boost (×1.5 vs Normal ×1.0)

FT1 talent gives 1.5× the gains of a Normal player. Multiply the table values above by 1.5 for FT1.

## Drill level multiplier boost

| Drill Level | Multiplier | Gain vs Very Easy |
|---|---|---|
| Very Easy | 1.0 | baseline |
| Easy | 1.15 | +15% |
| Medium | 1.3 | +30% |
| Hard | 1.55 | +55% |
| Very Hard | 1.7 | +70% |

## How to adjust

If a stat-150 age-24 Normal player does 6 Very Easy sessions and gains **6%** but the table says **3%**:
- Actual ≈ 2× predicted → double `baseXpPerSession` from 150 → 300
- Edit `profiles/game_2025.json`: `"baseXpPerSession": 300`
- Push and test again
```

---

## Role 4 — "The Role Engineer": GK stat handling

**Context:**
- `src/utils/roleWeights.ts` line 20: `ROLE_CONSTRAINTS.GK.essential` is estimated as `['REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION']` but is marked `// TODO: verify GK white stats from research`
- `app/player/new.tsx`: the stat entry grid always shows `OUTFIELD_STATS` (SHOOTING, PASSING, CROSSING, DRIBBLING, FINISHING, HEADING, TACKLING, MARKING, POSITIONING, BRAVERY, AGGRESSION, STRENGTH, SPEED, FITNESS, CREATIVITY) — wrong for GK
- GK players have different stat categories in the game (REFLEXES, HANDLING, AERIAL REACH, etc.)

**Task A — Verify GK white stats**

Research GK stat requirements. The stat keys must match the string keys used in the `OUTFIELD_STATS` array pattern (all-caps). Once confirmed, update `src/utils/roleWeights.ts`:

```typescript
// Current (line 20):
GK: { essential: ['REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION'], secondary: [...] }
// Remove the // TODO comment once verified
```

**Task B — GK stat grid in player/new.tsx + player/[id].tsx**

In `app/player/new.tsx`, add a `GK_STATS` constant and conditionally render it when GK is the selected role. After the existing `OUTFIELD_STATS` const (around line 30), add:

```typescript
const GK_STATS = [
  'REFLEXES',   'HANDLING',
  'AERIAL REACH','RUSHING OUT',
  'COMMUNICATION','AGILITY',
  'ANTICIPATION','KICKING',
  'THROWING',   'PUNCHING',
  'BRAVERY',    'FITNESS',
  'STRENGTH',   'SPEED',
  'POSITIONING',
];
```

Then in the stat grid render, replace the hardcoded `OUTFIELD_STATS.map(...)` with:
```typescript
const statList = roles.includes('GK') ? GK_STATS : OUTFIELD_STATS;
// then: statList.map(stat => ...)
```

Apply the same change in `app/player/[id].tsx`.

**Task C — Remove GK from adjacency validation early-exit**

`src/utils/roleWeights.ts` lines 36 and 40 block GK from any multi-role combination. This is correct gameplay-wise (GK can't play with outfield roles) but the early return at line 36 should handle `roles.length > 1 && primary === 'GK'` clearly:

Current code is already correct — no changes needed to logic. But the comment is missing. Add a comment:

```typescript
// GK cannot be combined with any other position
if (primary === 'GK') return false;
```

---

## Verification (all roles)

After applying changes:

```bash
# In the repo directory (Termux):
npm run typecheck        # must return zero errors
git add <changed files>
git commit -m "feat/fix: <brief description>

https://claude.ai/code/session_01NbN7HpqmFs1vaTREmwEsBT"
git push -u origin claude/continue-development-uXA5D
```

GitHub Actions picks up the push → EAS OTA update → reopen app to see changes.

---

## Key files quick-reference

| File | Purpose |
|---|---|
| `profiles/game_2025.json` | All game constants — XP table, age/talent multipliers, statCap, baseXpPerSession |
| `src/types/resources.ts` | TypeScript interfaces — GameProfile, ManagerProfile, DrillSession, etc. |
| `src/logic/xpEngine.ts` | XP math — xpBaseForStat, xpNeededFor1Pct, estimateStatGainPct |
| `src/logic/ovrProjector.ts` | applyDrillSessionsToStats, projectOvr, computeOvrFromStats |
| `src/logic/investmentEngine.ts` | planPlayerInvestment, compareInvestmentScenarios |
| `src/utils/roleWeights.ts` | ADJACENCY_MAP, ROLE_CONSTRAINTS (white/grey stats), isWhiteStat |
| `src/database/drillDatabase.ts` | DRILL_LIST — all drills with stat targets, isBase flag |
| `src/constants/theme.ts` | Direction B design tokens |
| `app/(tabs)/plan.tsx` | Plan screen — bordered config cards, OVR projection display |
| `app/compare.tsx` | Compare screen — head-to-head player projections |
| `app/player/new.tsx` | Add player screen |
| `app/player/[id].tsx` | Edit player screen |
