# Known Issues

## Open

| # | Area | Description | Priority |
|---|---|---|---|
| 1 | Plan / OVR projection | Drill gains skipped when player has no individual stats entered (only OVR). Engine warns and returns base OVR. Individual stat entry required for full drill projection. | High |
| 2 | Drill XP calibration | `baseXpPerSession` scaling unconfirmed — needs real in-game screenshots of stat gains per session to calibrate | High |
| 3 | GK white stats | Essential stat list for GK role is estimated; needs verification from in-game data | Medium |
| 4 | Compare screen | Missing AppHeader — uses raw ScrollView with no app title or tab navigation | Low |
| 5 | CLI drill levels | `src/index.ts` collectDrillSessions prompt updated but not yet tested end-to-end | Low |

## Fixed This Sprint (Sprint 5)

| # | Area | Fix |
|---|---|---|
| F1 | Drills tab efficiency blank | `app/(tabs)/drills.tsx`: controller returns 0–1 fraction; DrillTable expects 0–100 — multiplied by 100 |
| F2 | Plan OVR ~48 instead of ~195 | `profiles/game_2025.json`: `qualityOvrDivisor` 4 → 1 (OVR = mean stat directly) |
| F3 | ST+AMC+MC role rejected | `src/utils/roleWeights.ts`: `validateRoleAdjacency` now transitive — each role checked against any accepted role, not just primary |
| F4 | Bottom tab bar ghost | `app/(tabs)/_layout.tsx`: changed `tabBarStyle: { display: 'none' }` to `tabBar={() => null}` |
| F5 | Single tier points input | Plan + Compare screens redesigned: each of 6 tiers has its own input, threshold, and tap-to-select |

## Fixed in Sprint 4

| # | Area | Fix |
|---|---|---|
| F6 | OVR formula wrong model | Replaced coach-card multiplier model with XP-based drill session engine |
| F7 | Tier bonus as flat OVR | Corrected to flat attr addition per white stat → recalculate OVR |
| F8 | Greens as OVR gain | Corrected to condition restore only (15% per green, no OVR) |
| F9 | Grey weight 0.1 | Corrected to 0.5 per verified game mechanic |
| F10 | 180-rule missing | Implemented: stat ≥ 180% returns Infinity XP cost |
