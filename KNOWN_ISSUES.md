# Known Issues

## Open

| # | Area | Description | Priority |
|---|---|---|---|
| 1 | Plan / OVR projection | Drill gains skipped when player has no individual stats entered (only OVR). Engine warns and returns base OVR. Drill-level projection requires all 15 stats to be entered. | High |
| 2 | XP calibration | `baseXpPerSession: 150` is a working estimate. Needs validation against real in-game screenshots — note a player's stat value before a known number of sessions, compare actual % gain to engine output, adjust value in `profiles/game_2025.json` accordingly. | High |
| 3 | GK white stats | `ROLE_CONSTRAINTS.GK.essential` in `src/utils/roleWeights.ts` is estimated as `['REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION']` — marked TODO, unconfirmed against in-game data. | Medium |
| 4 | GK stat entry UI | `app/player/new.tsx` and `app/player/[id].tsx` always show the outfield stats grid (SHOOTING, PASSING, etc.) regardless of position. GK players need different stats (REFLEXES, HANDLING, AERIAL REACH, etc.). | Medium |
| 5 | Premium sponsor cooldown | `isPremiumSponsor` is stored in `ManagerProfile` but the Faster Condition Recovery cooldown reduction from premium milestone rewards (confirmed: milestone 6 = +10%, milestone 12 = further reduction) is not factored into engine output. | Medium |
| 6 | CLI drill levels | `src/index.ts` drill level prompts updated to Very Easy/Easy/Medium/Hard/Very Hard but not yet tested end-to-end via CLI. | Low |

---

## Fixed — Sprint 6 (2026-05-07 afternoon)

| ID | Area | Fix |
|---|---|---|
| F11 | Plan tab: first run shows −1.2, button locks after | `invalidate()` → `setPlan(null)` added to all param setters; FROM OVR anchored to `player.overall` (DB value) |
| F12 | Drill picker contained invalid "Finishing School" | `DRILL_NAMES` now derived from `DRILL_LIST` import — always reflects real drill database |
| F13 | All players show +0.0 OVR from drills | Two-bug fix: extended XP table above 180 (was Infinity); added `baseXpPerSession: 150` multiplier |
| F14 | `compareInvestmentScenarios` returned wrong shape | Rewritten to return `{ results, recommendedPlayer, reasoning }` matching `ScenarioComparison` type |
| F15 | OvrMovement crashes Android | Removed react-native-svg entirely; pure View/Text implementation |
| F16 | Plan OVR display persistent −1.2 | FROM anchored to stored `player.overall`; TO = storedOvr + engineGain delta |

## Fixed — Sprint 5 (2026-05-07 morning)

| ID | Area | Fix |
|---|---|---|
| F6 | Drills tab efficiency blank | `app/(tabs)/drills.tsx`: controller returns 0–1 fraction; DrillTable expects 0–100 — multiplied by 100 |
| F7 | Plan OVR ~48 instead of ~195 | `profiles/game_2025.json`: `qualityOvrDivisor` 4 → 1 (OVR = mean stat directly) |
| F8 | ST+AMC+MC role rejected | `src/utils/roleWeights.ts`: `validateRoleAdjacency` now transitive — each role checked against any accepted role, not just primary |
| F9 | Bottom tab bar ghost below AppHeader | `app/(tabs)/_layout.tsx`: changed `tabBarStyle: { display: 'none' }` to `tabBar={() => null}` |
| F10 | Single tier points input for all tiers | Plan + Compare screens redesigned: each of 6 tiers has its own input, threshold, and tap-to-select-target |

## Fixed — Sprint 4 (2026-05-06)

| ID | Area | Fix |
|---|---|---|
| F1 | OVR formula wrong model | Replaced coach-card multiplier model with XP-based drill session engine |
| F2 | Tier bonus as flat OVR | Corrected to flat attr addition per white stat → recalculate OVR |
| F3 | Greens counted as OVR gain | Corrected to condition restore only (15% per green, no OVR change) |
| F4 | Grey weight 0.1 | Corrected to 0.5 per verified game mechanic |
| F5 | 180-rule missing from engine | Implemented: stat ≥ 180% previously returned Infinity XP cost (later extended in Sprint 6 to full stat range) |
