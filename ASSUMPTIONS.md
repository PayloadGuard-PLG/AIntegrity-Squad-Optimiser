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

1. Docs commit (DEVLOG + CLAUDE.md + all other docs) goes to **dev branch first**.
2. Then push docs to **main** as well — both branches stay identical at end of session.
3. **Both branches must be identical at the end of every session.** If the session drops or the branch diverges, main is the fallback recovery point.
4. **Never push code to main directly.** main receives merges (or cherry-picks) from the dev branch only. Pushing code directly to main triggers a live EAS OTA field update — changes go straight to production devices.
5. **Dev branch:** `claude/continue-development-CAQUS`. All development work goes here.
6. **Docs scope:** DEVLOG.md · CLAUDE.md · HANDOVER.md · README.md · WHITEPAPER.md · FORMULAS.md · KNOWN_ISSUES.md · ASSUMPTIONS.md — all must be updated to reflect the current sprint before session close.
7. Two device console sessions for development: the hot-reload server on one, git on the other. Pull in the git session — the bundler picks up file changes and reloads without restart.

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
3. For `baseXpPerSession`: confirmed at 220 from coach sessions (Ricky Grant ×40, Lewis MacGregor ×114); do not change without new empirical evidence
4. For talent multipliers: Normal (×1.0) confirmed for Grant, Rogers, McGinty; Slow (×0.7) confirmed for Lewis MacGregor; Fastest/Fast pending

## Sprint 31 Open Questions (Game Readiness Dashboard)

Before implementing Sprint 31, Steve must confirm:

1. **Fan club level** — per-player or global (single value for whole squad)?
2. **Daily streak road** — manual tap (user sets current step) or auto-increment (app tracks per-day)?
3. **Teamplay pillars** — are current pillar scores already stored somewhere, or is this a new input field?
