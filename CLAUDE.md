# AIntegrity Squad Optimiser — Developer Notes

Persistent findings from game-play analysis and OCR debugging. Read this before touching scanner logic.

---

## Game Layout: Coach Preview Screen

### Stat Grid — 3-Column Layout
The in-game coach preview shows stats in **3 side-by-side columns**:

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
Each drill has one fixed `DrillIntensity` level matching the in-game difficulty selector.
The drills tab filters to `d.intensity === drillLevel` — it does NOT weight by intensity.

| Intensity | Drills |
|---|---|
| Very Easy | Ball Control, Video Analysis, Warm-Up |
| Easy | Shooting Technique, Set-Piece Delivery, Slalom Dribble, 1-on-1 Finishing, Head It, Porky in Centre, Defensive Line, Defending Crosses, Hold Shape, Hurdles, Stretch, Carioca with Ladders, Hurdle Jumps |
| Medium | Move & Finish, Press Up, Stop the Attacker, Sprints, Shuttle Runs |
| Hard | Wing Play, Fast Counter-Attacks, Long Run |
| Very Hard | Gym |

### Drill Renames (IP-Safe)
| Original name | Current name | Notes |
|---|---|---|
| Skill Drill | Ball Control | Renamed to First Touch Play (Sprint 11), then to Ball Control (Sprint 15, user confirmed) |
| Piggy in the Middle | Porky in Centre | User explicitly confirmed this style |
| Pass, Go & Shoot | Move & Finish | |
| Use Your Head | Head It | |
| Press the Play | Press Up | |
| Hold the Line | Hold Shape | |

Ball Control trains: `['CONCENTRATION', 'DRIBBLING', 'HEADING', 'CREATIVITY']`, intensity Very Easy, baseLoss 0.75.

---

## Architecture Notes

- **OVR formula**: `qualityPct / divisor` where divisor=1 in current game profile
- **180-rule**: stats at or above 180 yield `Infinity` XP cost — treated as hard cap
- **Grey stats cost 2× XP** (grey weight = 0.5 multiplier vs white)
- **Tier bonus = flat attribute addition** to each white stat (NOT a direct OVR boost)
- **Condition (greens)**: restores condition only — zero OVR change
- **DB**: Drizzle ORM + expo-sqlite; migrations in `drizzle/` folder; current latest is m0005 (tier rename)
