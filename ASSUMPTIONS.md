Assumption is the mother of all fuck ups, and every fuck up costs Steve money in credits and rewrites.

Stop doing it Claude. Ask him. Don't guess.

Fletcher — *"Good enough!.... Not my Tempo!!"*

---

## IP and Naming

Never reference the source application, its developer, or any of its branded terms — in code, comments, commit messages, or documentation. Steve provides numbers to validate math. That is all. The codebase uses its own vocabulary (see CLAUDE.md). When in doubt about a term, check CLAUDE.md or ask.

This applies to **comments** too. Do not add source-game drill names, item names, or feature names as code comments alongside their renamed equivalents. Comments like `// Shooting Technique` above a `Target Practice` entry are IP leakage. Write comments that describe behaviour, not origin.

---

## Git Discipline

Every sprint ends with a docs commit. No exceptions.

1. Start each task from the **current `main`** and use a task-specific branch. No historical branch name is permanently authoritative.
2. Code reaches `main` by reviewed PR/merge only. Do not push development code directly to `main`; a main update may trigger EAS OTA.
3. Before merge, audit the exact PR head and require the relevant proof/test jobs to pass. A stale earlier review does not approve a moved head.
4. Documentation close-out follows the merged implementation and must describe the code that actually shipped, not the branch that was planned.
5. **Docs scope:** DEVLOG.md · CLAUDE.md · HANDOVER.md · README.md · PRINCIPIA.md · WHITEPAPER.md · FORMULAS.md · KNOWN_ISSUES.md · ASSUMPTIONS.md; update CALIBRATION_RECORD.md / CALIBRATION_COLLECTION.md when empirical-model state changes.
6. Two device console sessions remain useful for development: hot-reload server on one, git on the other. Pull in the git session; the bundler reloads file changes.
7. **PR title max 256 characters.** Put detail in the PR body.
## Role Constraints

When adding or correcting white/grey stat assignments, always verify against the game card screenshot:

- "Key attributes for this player are highlighted" — highlighted stats = white (essential)
- Every role has exactly 15 stats total (essential + secondary = 15)
- Multi-role players use the **union** of all roles' essential lists for white stats
- After changing `ROLE_CONSTRAINTS` in `roleWeights.ts`, update `FORMULAS.md` and `HANDOVER.md` role tables and `CLAUDE.md` Role-Based Stat Whiteness section

## Calibration

When Steve provides before/after stats from a game session:

1. **Do not guess** the effective values — back-calculate from actual data
2. For `drillXpFactor`: needs a controlled drill-only run (no tier, no coach) with known cycles and all 15 stats recorded before and after
3. For `baseXpPerSession`: current value is **676** (in `profiles/game_2025.json`). Do not change without empirical evidence — back-calculated from Grant ×40 Standard Defending with all 5 stats within game range.
4. Fastest/Fast/Average/Normal/Slow in our app is manual empirical hypothesis metadata. The repository does not establish a source-game "Training Rate" screen or automatically observed field. Do not request one, infer it from OCR, or treat historical stored values as observed. Resource Coach V2 does not use this selector.

## Sprint 39 Open Questions

1. **Resource Coach stat-cost/display-class structure** — highest priority. Use an existing ordinary multi-stat preview where affected stats span widely separated starting values and known WHITE/MID_GREY classes; collect new evidence only if the corpus lacks a clean within-player contrast. Hold player, age, tier, coach, multiplier and affected-stat count fixed.
2. **Zero-gain suppression** — preserve `[0,0]` observations but do not fit anchors from them until the mechanism is identified.
3. **Reward transfer** — ordinary Resource Coach V2 is falsified for Reward transfer. Keep Reward evidence separate and abstain until a replacement representation is identified.
4. **Resource Coach device validation** — test real preview scans/entry, offline restart persistence, share/export, class confirmation and separate-anchor behavior on Android.
5. **drillXpFactor** — legacy drill path remains provisional at 0.3 and still needs a controlled drill-only before/after observation.
6. **Non-Normal talent multipliers** — legacy training model values remain unconfirmed hypotheses. Do not use the app selector as observation provenance and do not let this uncertainty leak into Resource Coach V2.
7. **PayloadGuard regression** — PR #134 is the concrete replacement-aware structural/semantic/gating regression fixture for PayloadGuard development; fix it in PayloadGuard, not by weakening the Optimiser architecture.
