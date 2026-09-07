# Current product state — 2026-09-07

Baseline: main `ebfb9eedbe8ed8dbdbed0f7862051bebfecd2032` (PR #124).
Session branch: `codex/player-next-action-20260907`.
Read order used: PRINCIPIA, current CLAUDE guidance, recent commits, live callers.

## Pipeline map

| Stage | Live implementation | Verified state / limitation |
|---|---|---|
| Screenshot / manual input | `app/player/new.tsx`, `app/player/[id].tsx` | Gallery or manual player entry. Screens call `useScanner`. |
| Observation / OCR | `playerScanner.ts`, `playerCardParse.ts`, `glyphReader.ts` | Frozen text pass plus calibrated pixel readers; unread differs from observed absence. At the baseline **both live callers omitted pixels**, so glyph readers abstained. This session wires lossless PNG preparation and matching OCR coordinates. |
| Player state | `playerSchema.ts`, `playerScanState.ts` | Established roles alone confer whiteness. Learning role/progress, playstyle, abilities and boosts are separate fields. This session shares observation merging and role/tier review between add and rescan. |
| Persistence | `playerService.ts`, `src/db/schema.ts`, migration 0008; `playerService.web.ts` | SQLite/Drizzle on mobile, localStorage on web. Glyph fields already had storage columns. At baseline ordinary edit saves omitted them; this session preserves them. No schema migration. |
| Deterministic training | `engineMath.ts`, `engineConstants.ts`, `xpEngine.ts`, `game_2025.json` | Exponential cost, geometric coach budget, established-role union, grey multiplier 0.22, tier bonus, base OVR lock. No engine or calibration changes this session. |
| Condition / drills | `conditionEngine.ts`, `surges.ts`, `drillDatabase.ts` | Exact raw drain, observed charged envelope, minimum 1%; inactive Perfect Conditions gives no reduction. Zero drain retired and bundling withheld. Drill XP factor 0.3 and XP intensity multipliers remain assumptions. |
| Projection | `ovrProjector.ts`, Coaches, Drills and Results screens | Shared core exists, but some screen-specific simulations remain. Coaches explicitly uses Normal. Drills/Results still consume stored talent; consistency work remains. |
| Recommendation | `controller.ts`, `investmentEngine.ts`, `scenarioComparator.ts`, Drills screen | Drill ranking is white-hit fraction divided by expected condition, not a calibrated gain-per-cost optimum. Presets show condition ranges; individual recommendation rows still show a point cost. Investment text is not yet a complete evidence-qualified next-action answer. |

## Selected task and result

**Finish live screenshot → reviewed → persisted player state.** This precedes new
advice because a learning role misread as established changes XP cost, tier bonus,
base OVR and the advice built on all three.

- `preparePlayerScreenshot.ts` creates a lossless cache PNG without resizing.
  OCR reads that exact URI; glyphs receive pixels decoded from the same PNG.
  Native image handles and the generated cache file are released; the original
  is never deleted. PNG conversion uses the existing Expo module and a pure JS
  codec ([UPNG API](https://github.com/photopea/UPNG.js#decoder)).
- Pixel-preparation failure falls back to text with review flags. Text role
  candidates never silently become established roles. Unread roles/tier require
  explicit review in the form before saving.
- Undefined and flagged partial state preserve previously entered values;
  observed `null`, `[]`, `{}` clear stale values. Learning progress is editable
  separately from the established-role grid. Boosts never enter base stats.
- Ordinary edit saves retain all loaded player fields and apply reviewed changes.
  The merge layer does not simulate role completion or grant projected tier gains.

## Verification

- Baseline: typecheck; engine 49, projection 53, scanner 60, condition 33 checks passed.
- After change: the same suites plus 13 scan/state integration tests passed.
  The added tests run as part of the existing `test:scanner` CI gate.
- Z3/Crosshair/Hypothesis: 24 tests passed, no skips. The differential runner now
  uses `node --import tsx` directly because the tsx CLI's IPC socket is blocked
  locally; the compared functions, properties, tolerances and example counts are unchanged.
- Android export compiled successfully to Hermes bytecode. This verifies bundling,
  not live ML Kit / ImageManipulator execution on a device.
- Real-capture scanner pass not run: captures are intentionally absent. Synthetic
  tests verify integration and abstention, not independent calibration boundaries.
- Dafny is not installed locally; the existing PR gate must verify its proofs.
- Frozen text golden, glyph calibration corpus, game profile and engine are unchanged.

## Remaining uncertainty and next product increment

Drill XP still needs a controlled before/after observation. Charged condition's
spread driver is unresolved; its envelope is provisional, not a guaranteed game
law. Non-Normal talent lacks calibration and several age brackets remain assumed.

Once on-device scanning is checked, the next product increment is a shared
recommendation result that carries action, expected stat/OVR change, condition
range, resource requirements and reasons together. It must consistently apply the
Normal-talent policy, expose drill-XP uncertainty and avoid point-cost claims.
The existing duplicate projection paths should consume that shared result before
adding new game mechanics.

## Hardening pass (follow-up on 38e84d3)

Two demonstrable defects in the observation layer, each with a regression test
that fails against 38e84d3:

- `roleChips` returned `establishedRoles: []` with an empty review whenever no
  chip classified as established — a role row OCR missed entirely, or one whose
  only classified chip was a dark learning chip. `[]` is an observation the merge
  layer acts on, so a failed read cleared the stored established roles *and* the
  learning role and its progress. It now abstains with a `roles` flag unless a
  flag already explains the empty set (the ambiguous-chip case is unchanged).
- `findBoostCandidates` matched single-token stat names only, so the two-word GK
  stats `RUSHING OUT` and `AERIAL REACH` could never carry a boost. A boost on
  those rows was silently absent rather than observed or flagged.

Base stats, calibration, the frozen text golden, the engine and the game profile
are unchanged. Verified after the change: typecheck; logic, engine 49, projection
53, condition 33, scanner 60, scan/state 16. Z3 + Crosshair + TS↔Python
differential: 24 passed, no skips. Dafny remains unrun here (not installed); the
change touches no engine math those proofs cover. Real-capture scanner validation
is still absent by policy, so pixel boundaries remain synthetically exercised only.
