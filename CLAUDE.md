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
The scanner captures it correctly; the UI shows it in a "DETECTED — NOT IN ROLE" section (`theme.hot` amber).

---

## Drill System

### Intensity Levels (Fixed Per Drill)
Each drill has one fixed `DrillIntensity` level per drill.
The drills tab filters to `d.intensity === drillLevel` — it does NOT weight by intensity.

| Intensity | Drills |
|---|---|
| Very Easy | Touch Training, Tactical Review, Activation |
| Easy | Target Practice, Dead Ball Practice, Cone Weave, Solo Finish, Aerial Work, Porky in Centre, Back Line Drill, Box Clearance, Compact Block, Hurdle Work, Flexibility Session, Footwork Ladder, Plyometrics |
| Medium | Run & Strike, Pressure Trap, Challenge Drill, Speed Work, Interval Runs |
| Hard | Wide Channel, Break Away, Endurance Loop |
| Very Hard | Weight Room |

Touch Training trains: `['CONCENTRATION', 'DRIBBLING', 'HEADING', 'CREATIVITY']`, intensity Very Easy, baseLoss 0.75.

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
- **Tier bonus** applies to ALL key (role) attributes only — off-role stats receive 0 (confirmed from game data)
- **Tier OVR contribution**: `floor(tier_bonus × key_count / 15)` — varies by role (10–13 key stats)
- **Condition (restorers)**: restores condition only — zero OVR change; +15% per restorer (confirmed)
- **Seasonal decay**: ~20% base OVR drop per season (unmodeled — affects base quality, not tier)
- **DB**: Drizzle ORM + expo-sqlite; migrations in `drizzle/` folder; current latest is m0006 (drill_presets)
- **Drill Presets**: stored in `drill_presets` table; service at `src/services/drillPresetService.ts`

---

## IP-Agnostic Naming (keep it this way)

The codebase is scrubbed of source-game IP. Do not reintroduce these terms:

| Source-game term | Use instead |
|---|---|
| Greens / green (the item) | restorers / restorer |
| Rest packs | recovery kits |
| Skill Drill / First Touch Play / Ball Control | Touch Training |
| Piggy in the Middle | Porky in Centre |
| EliteChest | PremiumChest |
| Nordeus / Top Eleven / T11 | (omit — never reference the source game) |

Match Advisor is OK to keep — it's a generic descriptor, not a protected name.

Colour names (`green`, `amber`, `red`) in UI styling are fine — they describe pixels, not items.

When adding new features, choose generic football-management vocabulary. Run
`git grep -niE '\bgreens\b|skill drill|nordeus|top eleven|elitechest'` before
committing to verify nothing crept back in.
