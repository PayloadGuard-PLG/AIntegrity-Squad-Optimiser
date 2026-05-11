# Squad Optimiser — UI Design Model

**Version 1.0 — Sprint 5**

This document is the single source of truth for layout, navigation, component contracts, and data→UI mappings. Update this when game values change or new screens are added. Claude reads this to make consistent UI decisions across the codebase.

---

## 1. Design System

### 1.1 Color Tokens

All hardcoded values reference these tokens. Never introduce a new colour without adding it here.

```typescript
// backgrounds
BG_BASE       = '#0f1117'   // page background
BG_CARD       = '#1a1d27'   // card / input field bg
BG_RAISED     = '#2a2d3a'   // inactive chip, elevated surface
BG_INPUT      = '#0f1117'   // text input bg (same as page, visually inset)

// primary accent — indigo
ACCENT        = '#6366f1'
ACCENT_PRESS  = '#4f46e5'
ACCENT_LIGHT  = '#a5b4fc'
ACCENT_FAINT  = '#6366f122'  // background tint
ACCENT_BORDER = '#6366f1'    // border when selected

// status
SUCCESS       = '#22c55e'
SUCCESS_FAINT = '#22c55e22'
SUCCESS_BOR   = '#22c55e44'
WARN          = '#f59e0b'
WARN_FAINT    = '#f59e0b33'
DANGER        = '#ef4444'
DANGER_FAINT  = '#ef444433'

// text
TEXT_PRIMARY   = '#e2e8f0'
TEXT_SECONDARY = '#9ca3af'
TEXT_MUTED     = '#6b7280'
TEXT_GHOST     = '#4b5563'   // placeholders

// tier badge colours (text; bg = colour + '33')
TIER_NONE      = '#6b7280'
TIER_RARE      = '#60a5fa'
TIER_ELITE     = '#34d399'
TIER_STELLAR   = '#22d3ee'
TIER_MASTER    = '#a78bfa'
TIER_EPIC      = '#fb923c'
TIER_LEGENDARY = '#fbbf24'

// drill type colours
DRILL_ATTACK   = '#6366f1'   // indigo
DRILL_DEFENCE  = '#22d3ee'   // cyan
DRILL_PHYSICAL = '#f59e0b'   // amber

// OVR badge thresholds (≥150 green / ≥100 indigo / <100 amber)
OVR_HIGH = '#22c55e'
OVR_MID  = '#6366f1'
OVR_LOW  = '#f59e0b'
```

### 1.2 Typography Scale

```
Label / Section header   — fontSize 11, fontWeight '600', uppercase, TEXT_SECONDARY
Body                     — fontSize 13–14, fontWeight '400', TEXT_PRIMARY
Body bold                — fontSize 13–14, fontWeight '700', TEXT_PRIMARY
Player name              — fontSize 16, fontWeight '700', TEXT_PRIMARY
OVR number (badge)       — fontSize 12, fontWeight '800', white
OVR number (result)      — fontSize 22–28, fontWeight '900', colour from OVR range
Gain number              — fontSize 14–16, fontWeight '800', SUCCESS
Title (AppHeader)        — fontSize 20, fontWeight '900', TEXT_PRIMARY
Subtitle (AppHeader)     — fontSize 9,  fontWeight '700', ACCENT_LIGHT, letterSpacing 2
Tab label                — fontSize 11, fontWeight '600'
Button label             — fontSize 14–16, fontWeight '700'
```

### 1.3 Spacing & Radius

```
Page padding        : 16
Section gap         : 20
Card padding        : 12–14
Row gap             : 8
Chip gap            : 6
Border radius (card): 12
Border radius (chip): 8
Border radius (input): 10
Border radius (badge): 6
FAB size            : 56 × 56, radius 28
AppHeader height    : ~96 (paddingTop 52 + content)
```

### 1.4 Interaction Patterns

| Option count | Control |
|---|---|
| 2–3 options | Toggle chips in a row |
| 4–7 options | Wrap chip group |
| 5 (drill levels) | Wrap chip row, fullwidth if needed |
| 8–25 options | Horizontal-scroll chip list inside a DrillSessionRow |
| Long list (squad) | FlatList / ScrollView with PlayerCard |
| Numeric free entry | TextInput, keyboardType="numeric" |
| Boolean | Pressable row with colour-fill checkbox square |

No native `<Picker>` — use chip groups on mobile for all discrete options.

---

## 2. Navigation Map

```
Root Stack (headerShown: false)
│
├── (tabs)                        ← Tabs component, tabBar={() => null}
│   ├── / (index)                 → Squad Dashboard
│   ├── /plan                     → OVR Planner
│   └── /drills                   → Drill Selector
│
├── /compare                      → Scenario Comparator  [header visible]
├── /player/new   (modal)         → Add Player
└── /player/[id]  (modal)         → Edit / Delete Player
```

**Tab navigation lives in `AppHeader`** (not the bottom bar). Active tab determined by `usePathname()`. Use `router.navigate(path)` for tab switches.

**Headers for stack screens** (`/compare`, `/player/*`): bg `#1a1d27`, tintColor `#e2e8f0`, title in `TEXT_PRIMARY`.

---

## 3. AppHeader Component

**File:** `src/components/AppHeader.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  ▌ Squad Optimiser                                  │  ← title row, paddingTop 52
│    FOOTBALL MANAGER                                 │  ← subtitle, ACCENT_LIGHT
├─────────────────────────────────────────────────────┤
│  [Squad]   [Plan]   [Drills]                        │  ← tab row
└─────────────────────────────────────────────────────┘
```

- Purple accent bar left of title: width 4, height 28, radius 2, bg `ACCENT`
- Active tab: icon filled, label `TEXT_PRIMARY`, indigo underline bar (height 2)
- Inactive tab: icon outlined, label `TEXT_MUTED`
- Tab icons: Squad=`people`, Plan=`trending-up`, Drills=`barbell` (Ionicons)
- Bottom border: `BG_CARD` (1px, separates from content)

**Rule:** Every tab screen (`index`, `plan`, `drills`) renders `<AppHeader />` at top, before ScrollView/FlatList. Compare and Player modals use native Stack header instead.

---

## 4. Screen Specifications

---

### 4.1 Squad Dashboard (`/`)

**File:** `app/(tabs)/index.tsx`

**Purpose:** Full squad at a glance. Entry point to add / edit players.

**Layout:**
```
AppHeader
─────────────────────────────────
  [Squad Summary Bar]              ← horizontal scroll, chips
─────────────────────────────────
  Player 1   OVR badge  Age  Tier  ←┐
  Player 2   ...                    ├ FlatList of PlayerCards
  ...                              ←┘
─────────────────────────────────
  [FAB  +]                         ← bottom-right, absolute
```

**Squad Summary Bar (add when squad ≥ 1):**
- Chips: `{n} Players` · `Avg OVR: {x}` · `Avg Age: {x}` · `{n} Mutant`
- Computed from `squad` array at render time; no extra state

**PlayerCard contents:**
```
┌─────────────────────────────────────────────┐
│  NAME                    [OVR badge]  Age    │
│  [ST] [AMC]  [Stellar badge]  ★ mutant chip │
└─────────────────────────────────────────────┘
```
- Border: `ACCENT_BORDER` (1px) when `selected`, else transparent
- onPress → navigate to `/player/{id}`

**Empty state:** `EmptyState` with icon `people-outline`, message "No players yet", CTA "Add Your First Player" → `/player/new`

**FAB:** Absolute, bottom 24 right 20, size 56, bg `ACCENT`, `+` label, 24px white, elevation 4. Navigates to `/player/new`.

**Data source:** `useSquad()` → `squad: Player[]`

---

### 4.2 OVR Planner (`/plan`)

**File:** `app/(tabs)/plan.tsx`

**Purpose:** Project OVR gain for a single player. Choose drills, tier, resources. See step-by-step outcome.

**Layout:**
```
AppHeader
ScrollView
  [PLAYER SELECTOR]          ← hidden if squad.length === 1
  [PLAYER ATTRIBUTES]        ← Talent tier chips
  [DRILL SESSIONS]           ← DrillSessionRow list + Add Drill
  [TRAINING SETTINGS]        ← Default level chips + 2× Ad toggle
  [RESOURCES]                ← Style chips + Greens + Premium Sponsor + Tier Upgrade rows
  [Project OVR button]
  [Compare link]
  [PROJECTION results]       ← InvestmentStepTable + warnings
```

**PLAYER SELECTOR section** (only if `squad.length > 1`):
- Section label: `SELECT PLAYER`
- One `PlayerCard` per squad member, `selected={p.id === selectedPlayer?.id}`
- Single player in squad: auto-selected, shown as non-tappable card

**PLAYER ATTRIBUTES section:**
- Label: `PLAYER ATTRIBUTES`
- Sub-label: `TALENT`
- Talent chips: `FT1 | FT2 | FT3 | Normal | Slow` — active bg `ACCENT`, text white; inactive bg `BG_CARD`, text `TEXT_SECONDARY`
- Source of truth: `TalentTier` type + `gameProfile.talentMultipliers` keys

**DRILL SESSIONS section:**
- Label: `DRILL SESSIONS`
- List of `DrillSessionRow` components (see §6.3)
- `+ Add Drill` button: bg `BG_CARD`, text `ACCENT`, bold

**TRAINING SETTINGS section:**
- Sub-label: `DEFAULT DRILL LEVEL`
- Chips: `Very Easy | Easy | Medium | Hard | Very Hard` (source: `gameProfile.drillLevelMultipliers` keys)
- 2× Ad toggle row: checkbox + label "2× Ad active (doubles XP this session)"

**RESOURCES section:**
- Sub-label: `STYLE`
- Style chips: `FTP | Hybrid | PTW`
- Sub-label: `GREENS`
- Single TextInput, numeric
- Premium Sponsor toggle row: amber checkbox
- Sub-label: `TIER UPGRADE — tap to select target`
- **Tier rows** (one per tier: Rare → Legendary):

```
┌──────────────────────────────────────────────────────┐
│  Stellar         [    points input    ]    ✓ if ≥50  │
│  need 50                                              │
└──────────────────────────────────────────────────────┘
```
  - Tapping row toggles it as `targetTier` (indigo tint + border when selected)
  - Threshold from `TIER_COSTS` constant (hardcoded to match `gameProfile.tierPointsRequired`)
  - Green ✓ when `have >= threshold`
  - Source of truth: `TierName` type values + `gameProfile.tierPointsRequired`

**Project OVR button:**
- Disabled (bg `BG_RAISED`, grey text) when no player selected
- Active: bg `ACCENT`, pressed `ACCENT_PRESS`

**Compare link:** Text link below button → `router.push('/compare')`

**PROJECTION results** (rendered when `plan !== null`):
```
PROJECTION
{plan.recommendation text}

InvestmentStepTable
  Action | Description | Before | After | +Gain | Resources

⚠ warning text (if any)
```

**State variables:**
```typescript
selectedId: string | null
drillRows: DrillSession[]
style: ManagerStyle           // 'FTP' | 'Hybrid' | 'PTW'
talentTier: TalentTier
drillLevel: DrillLevel
tierPointInputs: Partial<Record<TierName, string>>
greens: string
isPremiumSponsor: boolean
twoxAd: boolean
targetTier: TierName | null
plan: InvestmentPlan | null
```

---

### 4.3 Drill Selector (`/drills`)

**File:** `app/(tabs)/drills.tsx`

**Purpose:** Show best drills for selected player and fan club level. Highlight zero-drain options.

**Layout:**
```
AppHeader
ScrollView
  [SELECT PLAYER]           ← if squad > 1
  [FAN CLUB LEVEL]          ← L0–L4 chips
  ─────────────────────
  DrillTable                ← sorted by efficiency desc
  ─────────────────────
  Zero-Drain hint           ← only when fanClubLevel === 4
```

**FAN CLUB LEVEL:**
- Chips: `L0 | L1 | L2 | L3 | L4`
- Active bg `ACCENT`; each represents a `fanClubCondReduction` index from `gameProfile`
- L4 caption: "Zero-Drain available" in `SUCCESS` text

**DrillTable row:**
```
┌──────────────────────────────────────────────────────────┐
│  [ATTACK]  Skill Drill         [Zero Drain ✓]            │
│  CREATIVITY · DRIBBLING · PASSING                        │
│  Efficiency: 67%     Condition: 0.00%                    │
└──────────────────────────────────────────────────────────┘
```
- Type badge: colour from `DRILL_ATTACK / DRILL_DEFENCE / DRILL_PHYSICAL`
- Zero-drain badge: `SUCCESS` bg tint + border, visible when `conditionCost === 0`
- White stats in efficiency calculation = role essential stats
- Condition cost from `baseLoss × (1 - gameProfile.fanClubCondReduction[level])`

**Empty state:** "Select a player to see drill recommendations" when no player selected.

**Data pipeline:**
```
getBestDrillSelections(player, fanClubLevel)
  → { name, type, efficiency, conditionCost, statsHit }[]
mapped → { ...result, efficiency: result.efficiency * 100 }
sorted → highest efficiency first
```

---

### 4.4 Scenario Comparator (`/compare`)

**File:** `app/compare.tsx`

**Purpose:** Compare 2+ players against the same drill + resource scenario. Get a ranked recommendation.

**Layout:**
```
[Native Stack Header: "Scenario Comparator"]
ScrollView
  [SELECT PLAYERS TO COMPARE]    ← multi-select PlayerCards
  [TALENT (SHARED)]              ← talent tier chips
  [SHARED DRILL SESSIONS]        ← DrillSessionRow list
  [TRAINING SETTINGS]            ← drill level + 2× Ad
  [RESOURCES]                    ← style chips + greens + tier upgrade rows
  [Compare button]
  [RESULTS]                      ← recommendation box + ranked player rows
```

Identical input sections to Plan screen. Key differences:
- Multi-select PlayerCards (border + tint when in `selectedIds[]`)
- Needs ≥ 2 players selected to enable Compare button
- No Premium Sponsor toggle (no per-player inputs)
- No "Compare link" (already on compare)

**RESULTS section:**
```
RESULTS
┌─────────────────────────────────────────────────────┐
│  ✓ Recommended: {name}                              │  ← SUCCESS bg tint
│  {reasoning text}                                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  #1  Player Name    OVR 195→201  [badge] +6.0  │
│  #2  ...                                │
└─────────────────────────────────────────┘
```
- Rank badge: `ACCENT` bg for #1, `BG_RAISED` for others
- OVR gain: `SUCCESS`, bold, fontSize 16
- OVRBadge shows projected OVR

**TODO — missing AppHeader:** Compare currently uses the Stack header only. Add `<AppHeader />` below Stack header so tab navigation remains accessible, or promote Compare into tabs and remove the Stack header.

---

### 4.5 Add / Edit Player (`/player/new` and `/player/[id]`)

**Files:** `app/player/new.tsx`, `app/player/[id].tsx`

**Purpose:** Create or update a player with roles, age, OVR, tier, individual stats.

**Layout:**
```
[Native Stack Header: "Add Player" / "Edit Player"]
ScrollView
  [NAME]                    ← TextInput
  [ROLES]                   ← 12-position grid, tap to toggle (max 3 adjacent)
  [AGE]  [OVR]              ← side-by-side numeric inputs
  [TIER]                    ← 7 tier chips (None–Legendary)
  [MUTANT CANDIDATE]        ← toggle checkbox
  ─────────────────────
  [STATS]                   ← only rendered if role selected
    Attack stats row
    Defence stats row
    Physical stats row
  ─────────────────────
  [Save]  /  [Save] [Delete]
```

**Role grid (3 rows × 4 cols):**
```
Row 1:  —    DR   DC   DL
Row 2:  GK   MR   MC   ML
Row 3:  —    AMR  AMC  AML
Row 4:  —    —    ST   —
```
- Tapped role: bg `ACCENT`, text white
- Invalid combo: show `roleError` text in `WARN` below grid
- Max 3; GK cannot combine with others

**Stats section:**
- Stats grouped by category label (ATTACK STATS / DEFENCE STATS / PHYSICAL STATS)
- White (essential) stats: label in `ACCENT_LIGHT`, input border `ACCENT_FAINT`
- Grey (secondary) stats: label `TEXT_MUTED`, standard input
- `isWhiteStat(roles, stat)` used to classify
- Stat key list:
  - Outfield (15): CREATIVITY, DRIBBLING, PASSING, SHOOTING, FINISHING, CROSSING, HEADING, STRENGTH, SPEED, AGILITY, FITNESS, STAMINA, TACKLING, MARKING, POSITIONING, BRAVERY, AGGRESSION
  - GK (10): REFLEXES, AGILITY, ANTICIPATION, RUSHING OUT, COMMUNICATION, THROWING, KICKING, PUNCHING, AERIAL REACH, FITNESS

**Tier chips:** `None | Rare | Elite | Stellar | Master | Epic | Legendary` — active bg = `TIER_{NAME}` + '33', active text = `TIER_{NAME}`

**Save button:** full-width, bg `ACCENT`
**Delete button** (edit only): full-width, bg `DANGER_FAINT`, text `DANGER`

---

## 5. Component Library

### 5.1 PlayerCard

```typescript
interface Props {
  player: Player;
  selected?: boolean;   // indigo border when true
  onPress: () => void;
}
```
Renders: name, role badges, TierBadge, mutant chip (amber, if true), OVRBadge, age.

### 5.2 OVRBadge

```typescript
interface Props { ovr: number }
```
Colour: `≥150 → SUCCESS`, `≥100 → ACCENT`, `<100 → WARN`. Badge bg = colour+'33'.

### 5.3 TierBadge

```typescript
interface Props { tier: TierName }
```
Returns null for `'None'`. Colour from `TIER_{NAME}` tokens. bg = colour+'33'.

### 5.4 DrillSessionRow

```typescript
interface Props {
  value: DrillSession;
  onChange: (s: DrillSession) => void;
  onRemove: () => void;
}
```
Sections:
1. Header: type badge (derived from selected drill's `.type`) + toggle "Lab/Event drills" + × remove
2. Drill name picker: horizontal-scroll chips; `isBase === true` always shown; `isBase === false` shown only when toggled
3. Session count: TextInput (numeric)
4. Level: 5 chips (`Very Easy … Very Hard`) — labels from `gameProfile.drillLevelMultipliers` keys
5. Trains line: grey text listing `drill.stats` for selected drill

### 5.5 DrillTable

```typescript
interface DrillRow {
  name: string;
  type: 'Attack' | 'Defence' | 'Physical';
  statsHit: string[];
  efficiency: number;    // 0–100 (percentage)
  conditionCost: number; // 0–100 (percentage)
  isZeroDrain?: boolean;
}
interface Props { drills: DrillRow[] }
```
Each row: type badge, name, zero-drain badge (if applicable), stats list, efficiency (green), condition cost (green if 0, amber if >0, red if >50).

### 5.6 InvestmentStepTable

```typescript
interface Props {
  steps: InvestmentStep[];
  finalOvr: number;
  totalOvrGain: number;
}
```
Horizontally scrollable table. Columns: Action | Description | OVR Before | OVR After | Gain | Resources. Footer: Final OVR + total gain. `minWidth: 420`.

Action chips:
- `drill` → bg `ACCENT_FAINT`, text `ACCENT_LIGHT`
- `tier` → bg `TIER_STELLAR+'22'`, text `TIER_STELLAR`
- `condition` → bg `SUCCESS_FAINT`, text `SUCCESS`

### 5.7 AppHeader

```typescript
// No props — reads pathname internally
```
See §3 for full spec.

### 5.8 EmptyState

```typescript
interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  message: string;
  ctaLabel: string;
  onCta: () => void;
}
```

---

## 6. Data → UI Mapping

Every place a number from `profiles/game_2025.json` appears in the UI.

### 6.1 Talent Tier Chips

| UI | Source |
|---|---|
| Chip labels: `FT1 FT2 FT3 Normal Slow` | `Object.keys(gameProfile.talentMultipliers)` |
| Tooltip / sub-label multiplier | `gameProfile.talentMultipliers[tier]` |

**To add a new talent tier:** Add key to `talentMultipliers` in `game_2025.json` + add to `TalentTier` type in `resources.ts`. Chips auto-render from `TALENT_TIERS` array — update that constant in plan.tsx and compare.tsx.

### 6.2 Drill Level Chips

| UI | Source |
|---|---|
| Chip labels: `Very Easy Easy Medium Hard Very Hard` | `Object.keys(gameProfile.drillLevelMultipliers)` |
| Multiplier shown in DrillSessionRow details | `gameProfile.drillLevelMultipliers[level]` |

**To rename or add a level:** Update `drillLevelMultipliers` keys in `game_2025.json` + update `DrillLevel` type + update `DRILL_LEVELS` constant in plan.tsx, compare.tsx.

### 6.3 Tier Upgrade Rows (Plan + Compare)

| UI element | Source |
|---|---|
| Row labels: `Rare Elite Stellar Master Epic Legendary` | `Object.keys(TIER_COSTS)` |
| "need {N}" threshold text | `TIER_COSTS[tier]` (must match `gameProfile.tierPointsRequired`) |
| Attribute addition (tooltip/detail) | `gameProfile.tierAttrAdditions[tier]` |
| ✓ affordability check | `have >= TIER_COSTS[tier]` |

**To update costs:** Change `tierPointsRequired` in `game_2025.json` AND update `TIER_COSTS` constant in plan.tsx and compare.tsx. These two must stay in sync. *TODO: derive TIER_COSTS directly from gameProfile at runtime to eliminate duplication.*

### 6.4 Fan Club Level Chips (Drills)

| UI | Source |
|---|---|
| Chips: `L0 L1 L2 L3 L4` | Indices 0–4 of `gameProfile.fanClubCondReduction` |
| Condition reduction per level | `gameProfile.fanClubCondReduction[level]` |

### 6.5 OVR Badge Thresholds

Currently hardcoded in `OVRBadge.tsx`:
- `≥ 150` → green
- `≥ 100` → indigo
- `< 100` → amber

*TODO: move these thresholds into `game_2025.json` as `ovrBadgeThresholds: { green: 150, indigo: 100 }` so they can be tuned.*

### 6.6 Drill List

| UI | Source |
|---|---|
| DrillSessionRow drill picker chips | `DRILL_LIST.filter(d => d.isBase)` (base) + all when toggled |
| DrillTable rows | `getBestDrillSelections(player, fanLevel)` |
| "Trains:" line | `DRILL_LIST.find(d => d.name === drillName)?.stats` |

**To add a drill:** Add entry to `DRILL_LIST` in `src/database/drillDatabase.ts`. It auto-appears in all pickers. Mark `isBase: true` for always-available drills, `false` for lab/event unlocks.

### 6.7 XP Formula Inputs (Plan / Compare projection)

These flow from `gameProfile` into `planPlayerInvestment` / `compareInvestmentScenarios` automatically. No UI constants to update.

| Game value | Profile key |
|---|---|
| XP cost curve | `xpCostTable` |
| Age decay | `ageTable` |
| Talent multipliers | `talentMultipliers` |
| Grey weight | `greyWeightMultiplier` |
| Star decay | `starDecayPerSession` |
| 2× Ad multiplier | `twoxAdMultiplier` |
| 180-rule cap | `rule180StatCap` |
| Hard stat cap | `statCap` |
| OVR divisor | `qualityOvrDivisor` |
| Total attributes | `totalAttributeCount` |

---

## 7. State Architecture

### Local state (per-screen)

| Screen | Key state |
|---|---|
| Squad | `squad` from `useSquad()` |
| Plan | All form inputs + `plan: InvestmentPlan \| null` |
| Drills | `selectedId`, `fanClubLevel` |
| Compare | `selectedIds[]`, form inputs, `comparison: ScenarioComparison \| null` |
| Player modal | All player fields |

### Global state (ManagerContext)

`src/context/ManagerContext.tsx` holds: `style`, `tierPoints`, `greens`, `isPremiumSponsor`, `storeBudget`, `twoxAdActive`, `talentTier`, `drillLevel`.

**Currently unused by Plan/Compare screens** — they manage their own local copies of these values. Two options going forward:
- **Option A (current):** Keep per-screen local state; context is available for cross-screen persistence if needed
- **Option B (future):** Bind Plan and Compare inputs to ManagerContext so settings persist between tab switches

### Persistent data (Drizzle / SQLite)

- `players` table — Player interface; managed via `src/services/playerService.ts`
- `drill_sessions` table — historical session log (not yet surfaced in UI)

---

## 8. Page Count Rationale

| Screen | Why it exists | Decisions it supports |
|---|---|---|
| Squad | Full roster view; entry to add/edit | Who's in my squad? Who's worth investing in? |
| Plan | Single-player projection | What OVR will this player reach? Which drill + tier combo is optimal? |
| Drills | Role-specific drill picker | Which drill should I run today? Am I hitting zero-drain? |
| Compare | Multi-player side-by-side | Between player A and B, who benefits more from the same resource spend? |
| Player modal | Create/edit player data | Entering stats for accurate projection |

**5 screens is sufficient** for the current feature set. Additions to consider as logic grows:

| Future screen | Trigger |
|---|---|
| Player Profile (read-only stat view) | When individual stats become common; show stat bars by category |
| Tier Tracker | When players have varied tier point balances; show all players' balances in one view |
| Session History | When `drill_sessions` table is surfaced; show past training log |
| Squad Overview / Dashboard | When squad size grows; show avg OVR chart, age distribution, tier breakdown |

---

## 9. Update Protocols

### When you change a number in `game_2025.json`

| Changed field | Also update |
|---|---|
| `drillLevelMultipliers` keys | `DrillLevel` type in `resources.ts`; `DRILL_LEVELS` constant in plan.tsx + compare.tsx |
| `talentMultipliers` keys | `TalentTier` type; `TALENT_TIERS` constant in plan.tsx + compare.tsx |
| `tierPointsRequired` values | `TIER_COSTS` constant in plan.tsx + compare.tsx |
| `tierAttrAdditions` values | Nothing in UI; reflected automatically in projection |
| `xpCostTable`, `ageTable` etc. | Nothing in UI; engine reads profile at runtime |

### When you add a new role

1. Add entry to `ROLE_CONSTRAINTS` in `roleWeights.ts` (essential + secondary stats)
2. Add to `ADJACENCY_MAP`
3. Add role chip to role grid in `player/new.tsx` and `player/[id].tsx`
4. No other changes needed

### When you add a new drill

1. Add entry to `DRILL_LIST` in `drillDatabase.ts`
2. Chips auto-appear in `DrillSessionRow`; recommendations auto-update in `DrillTable`
3. Mark `isBase: false` for event/lab drills (hidden behind toggle)

### When you change the OVR formula

1. Update `game_2025.json` profile values
2. Run `npm run typecheck` + `tsx tests/investment-test.ts`
3. If `qualityOvrDivisor` changes: re-calibrate OVR badge thresholds in `OVRBadge.tsx`
