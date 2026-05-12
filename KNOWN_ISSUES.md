# Known Issues

## Open

| # | Area | Description | Priority |
|---|---|---|---|
| 1 | Plan / OVR projection | Drill gains skipped when player has no individual stats entered (only OVR). Engine warns and returns base OVR. Drill-level projection requires all 15 stats to be entered. | High |
| 2 | XP calibration | `baseXpPerSession: 150` confirmed vs Standard Attacking ×30 real data (Passing 121 → +26–33 observed, model gives ~27 at Medium intensity). `starDecayPerSession` corrected to 1.0 (was 0.85^gain — too aggressive). Budget now divided by `drill.stats.length`. Treat as calibrated; refine if coach-tab scenario data shows systematic deviation. | Low |
| 3 | GK white stats | ✓ CLOSED Sprint 8 — confirmed: white = REFLEXES, AGILITY, ANTICIPATION, RUSHING OUT, COMMUNICATION, THROWING, KICKING, PUNCHING, AERIAL REACH, CONCENTRATION (10 stats). Grey = FITNESS, STRENGTH, AGGRESSION, SPEED, CREATIVITY (5 stats). GK solo only. | ✓ |
| 4 | GK stat entry UI | `app/player/new.tsx` and `app/player/[id].tsx` always show the outfield stats grid (SHOOTING, PASSING, etc.) regardless of position. GK players need different stats (REFLEXES, HANDLING, AERIAL REACH, etc.). | Medium |
| 5 | Premium sponsor cooldown | `isPremiumSponsor` is stored in `ManagerProfile` but the Faster Condition Recovery cooldown reduction from premium milestone rewards (confirmed: milestone 6 = +10%, milestone 12 = further reduction) is not factored into engine output. | Medium |
| 6 | CLI drill levels | `src/index.ts` drill level prompts updated to Very Easy/Easy/Medium/Hard/Very Hard but not yet tested end-to-end via CLI. | Low |
| 7 | Squad-wide OVR projection | Plan tab projects a single player in isolation. The observed ~+7 OVR/season from squad-wide Very Easy drilling (L4 zero-drain, all low white stats, free ad drills for teamplay) is not expressible in the UI. A "Season Simulator" view across all players is out of scope but this is the real-world calibration target. | Low |
| 8 | Drill stat priority | ✓ CLOSED Sprint 8 — drills now sorted by ascending average white stat value (ROI sort). Lowest stat first = cheapest gain per XP. Tiebreaker: efficiency. | ✓ |

---

## Fixed — Sprint 8 (2026-05-07 night)

| ID | Area | Fix |
|---|---|---|
| F22 | Star decay caused near-zero gains for high-stat players | `profiles/game_2025.json`: `starDecayPerSession` 0.85 → 1.0 (validated vs Standard Attacking ×30 real data) |
| F23 | XP budget not divided across drill stats | `src/logic/ovrProjector.ts`: budget ÷ `drill.stats.length` |
| F24 | Use Your Head listed as Attack type | `src/database/drillDatabase.ts`: type → Defence, stats corrected, baseLoss 1.5 → 3.0 |
| F25 | Stop the Attacker missing STRENGTH + DRIBBLING | Stats list corrected to 5: STRENGTH, MARKING, BRAVERY, DRIBBLING, TACKLING; baseLoss 2.25 → 4.5 |
| F26 | All skipped drills showed generic "Stats missing" | `ovrProjector.ts`: categorises skipped stats as role-irrelevant vs un-entered; tailored warning message per case |
| F27 | Tier not auto-applied when points available but no explicit selection | `plan.tsx`: `getBestAffordableTier()` auto-selects highest affordable tier on projection |
| F28 | OVR baseline used stale `player.overall` when stats entered | Stats-computed OVR used as FROM baseline when `player.stats` is non-empty |

## Fixed — Sprint 7 (2026-05-07 evening)

| ID | Area | Fix |
|---|---|---|
| F17 | Warning said "Slow trainer (age X)" for all ages ≥20 | `ovrProjector.ts`: now shows actual age multiplier ("Age 21 — multiplier 0.40×"); separate Slow talent warning added |
| F18 | Zero-drain never triggered at L4 | `controller.ts`: `isZeroDrain = fanClubLevel === 4 && drillLevel === 'Very Easy'` — L4+Very Easy now returns 0% |
| F19 | Fastest/Fast/Average talent labels were opaque | `plan.tsx`: chips now show "Fast ×1.25" etc. |
| F20 | Drills tab had no drill level input | `drills.tsx`: drill level selector added; feeds zero-drain and condition cost display |
| F21 | OTA push failed on multi-line commit messages | `.github/workflows/eas-update.yml`: message via env var, not inline template |

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
| F3 | Restorers counted as OVR gain | Corrected to condition restore only (15% per restorer, no OVR change) |
| F4 | Grey weight 0.1 | Corrected to 0.5 per verified game mechanic |
| F5 | 180-rule missing from engine | Implemented: stat ≥ 180% previously returned Infinity XP cost (later extended in Sprint 6 to full stat range) |
