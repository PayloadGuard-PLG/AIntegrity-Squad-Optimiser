Assumption is the mother of all fuck ups, and every fuck up costs Steve money in credits and rewrites.

Stop doing it Claude. Ask him. Don't guess.

---

## IP and Naming

Never reference the source application, its developer, or any of its branded terms — in code, comments, commit messages, or documentation. Steve provides numbers to validate math. That is all. The codebase uses its own vocabulary (see CLAUDE.md). When in doubt about a term, check CLAUDE.md or ask.

This applies to **comments** too. Do not add source-game drill names, item names, or feature names as code comments alongside their renamed equivalents. Comments like `// Shooting Technique` above a `Target Practice` entry are IP leakage. Write comments that describe behaviour, not origin.

---

## Git Discipline

Every sprint ends with a docs commit. No exceptions.

1. Docs commit (DEVLOG + CLAUDE.md) goes to the dev branch first.
2. Merge dev branch to main immediately after — main must always be a clean, up-to-date recovery point.
3. Both branches must be identical at the end of every session. If the session drops or the branch diverges, main is the fallback.
4. **Never push code to main directly.** main receives merges from the dev branch only. Pushing code directly to main triggers a live field update — changes go straight to production devices in the field.
5. Dev branch: `claude/continue-development-CAQUS`. All development work goes here.
6. Two device console sessions for development: the hot-reload server on one, git on the other. Pull in the git session — the bundler picks up file changes and reloads without restart. No need to kill the server to pull.
