# Squad Optimiser — Dev Log

Reverse-chronological. Each entry covers what shipped, what broke, and what the next sprint targets.

---

## Sprint 4 — Formula Engine Rewrite
**2026-05-06**

### Shipped

Research confirmed the entire formula engine was built on wrong game mechanics. Sprint 4 replaces it with the verified XP-based model and adopts a profile-based architecture so all game coefficients are configurable without touching code.

**Files added:**

| File | Purpose |
|---|---|
| `profiles/game_2025.json` | All game coefficients as configurable JSON (XP table, age table, talent/drill multipliers, tier additions, fan club reductions) |
| `src/logic/xpEngine.ts` | Core XP engine — `xpBaseForStat`, `xpNeededFor1Pct`, `estimateStatGainPct`, `statsToQualityPct`, `qualityPctToOvr`, `applyTierBonusToStats`, `getAgeMultiplier` |
| `src/components/DrillSessionRow.tsx` | Drill picker UI row (name, session count, drill level) replacing CoachInputRow in Plan/Compare screens |
| `drizzle/0001_natural_northstar.sql` | Migration adding `drill_sessions` table |

**Files rewritten:**

| File | Change |
|---|---|
| `src/types/resources.ts` | Added `GameProfile`, `TalentTier`, `DrillLevel`, `DrillSession`; removed `coaches` from `ManagerProfile`; added `twoxAdActive`, `talentTier`, `drillLevel` |
| `src/utils/coachMath.ts` | Removed coach-multiplier model; profile-driven `getAgeFactor`, `getStatXpCost`, `getGreyMultiplier`; deprecated shim kept for backward compat |
| `src/utils/math.ts` | `TIER_DATA.bonus` → `TIER_DATA.attrAddition` (flat per-white-stat, not OVR); removed `calculateDecay` |
| `src/utils/roleWeights.ts` | Fixed `isEssentialGain` — was returning true for secondary (grey) stats; now essential-only; added `getWhiteStatKeys`; grey weight = 0.5 |
| `src/logic/ovrProjector.ts` | Rewritten — drill sessions → per-stat XP → Quality%/4 → OVR; tier as flat attr addition; greens = condition restore step only |
| `src/logic/mutantEngine.ts` | Removed greens-as-OVR; greens are condition, not OVR |
| `src/logic/investmentEngine.ts` | New signature: `DrillSession[]` + `GameProfile`; added `compareInvestmentScenarios` |
| `src/logic/scenarioComparator.ts` | Updated to new engine signature |
| `src/context/ManagerContext.tsx` | Added `twoxAdActive`, `talentTier`, `drillLevel` state; removed `coaches` |
| `src/database/drillDatabase.ts` | Added 11 missing drills; fixed `Fast Counter-Attacks` baseLoss (3.0→3.75) |
| `src/db/schema.ts` | Added `drill_sessions` table |
| `app/(tabs)/plan.tsx` | Replaced "Add Coach" with "Add Drill"; added talent tier picker and 2× Ad toggle |
| `app/compare.tsx` | Same drill input replacement |
| `src/index.ts` | CLI updated to drill session workflow |
| `tests/investment-test.ts` | Full rewrite — 40 tests covering 180-rule, cap, age, talent, grey weight, tier delta, greens model, end-to-end plan |
| `tsconfig.json` | Added `resolveJsonModule: true` |

### Key decisions

**Profile JSON.** All game coefficients live in `profiles/game_2025.json` — no magic numbers in engine code. Updating game mechanics requires only a JSON edit, not code changes.

**XP model replaces coach-multiplier model.** The previous `×30 multiplier → direct OVR` model had no basis in the actual game. The new model: each drill session = 1 XP unit; `xpNeededFor1Pct = base / (ageMult × talentMult × greyMult × adMult × drillLevelMult)`; stat gains accumulate to Quality% → OVR.

**Tier bonus = attribute addition.** Previous code added a flat OVR number on tier up. Correct model: `+X per white attribute → recalculate Quality% → recalculate OVR`. Stellar on a 6-white-stat player at 100% each = +50×6/15 = +20 Quality% = +5 OVR.

**Greens = 15% condition restore.** Removed from OVR projection entirely; shown as informational `condition` step.

**Grey weight = 0.5 (was 0.1).** Secondary stats contribute half the XP efficiency of white stats.

**180-rule.** Stats at or above 180% return Infinity XP cost — drill ceases to pay that stat.

### Tests

```
40/40 passing (tests/investment-test.ts)
drill-logic-test.ts ✓
logic-test.ts ✓
storage-test.ts ✓
npm run typecheck — zero errors
```

### Still TODO

- Calibrate exact `baseXpPerSession` scaling once user screenshots confirm real session gains
- GK white skill set needs verification from research
- OCR scanner stub — next sprint
- Pro tier gating

---

## Sprint 3 — Mobile UI
**2026-05-06**

### Shipped

Full React Native / Expo mobile UI. App now runs on device — zero CLI required.

**FTUE target achieved:** Launch → Add Player → Add Coach → Project OVR in under 90 seconds.

**Files added:**

| File | Purpose |
|---|---|
| `babel.config.js` | NativeWind + Reanimated babel preset |
| `metro.config.js` | NativeWind CSS interop |
| `global.css` / `global.d.ts` / `tailwind.config.js` | NativeWind v4 setup |
| `app/_layout.tsx` | Root Stack; migration gate; ManagerProvider |
| `app/(tabs)/_layout.tsx` | Tab bar — Squad / Plan / Drills |
| `app/(tabs)/index.tsx` | Squad Dashboard — live reactive player list, FAB |
| `app/(tabs)/plan.tsx` | Investment Planner — coaches, manager profile, OVR projection |
| `app/(tabs)/drills.tsx` | Drill Optimiser — Fan Club level picker, drill table |
| `app/compare.tsx` | Scenario Comparator — multi-select, ranked results |
| `app/player/new.tsx` | Add Player modal — role grid, auto-built stats |
| `app/player/[id].tsx` | Edit/Delete Player modal |
| `src/components/OVRBadge.tsx` | Coloured OVR chip |
| `src/components/TierBadge.tsx` | Tier chip with tier-specific colour |
| `src/components/EmptyState.tsx` | Empty state with icon and CTA |
| `src/components/PlayerCard.tsx` | Player row card with role chips |
| `src/components/CoachInputRow.tsx` | Coach entry form (type, multiplier, session, source) |
| `src/components/InvestmentStepTable.tsx` | Step-by-step OVR projection table |
| `src/components/DrillTable.tsx` | Drill recommendations with zero-drain highlight |
| `src/services/playerService.ts` | Drizzle CRUD for players table |
| `src/services/coachService.ts` | Drizzle CRUD for coaches table |
| `src/context/ManagerContext.tsx` | Session-level manager profile state |
| `src/hooks/useSquad.ts` | Live reactive squad query via `useLiveQuery` |
| `RESEARCH.md` | Renamed from `Research`; game name reference removed |

**Files modified:**

| File | Change |
|---|---|
| `src/db/schema.ts` | Extended — `players` aligned with Player interface; `coaches` table added |
| `drizzle/migrations.ts` | Regenerated with real SQL (2 tables, 19 columns) |
| `tsconfig.json` | Added `app/**` and `global.d.ts` to includes |
| `tests/storage-test.ts` | Added `tier: 'None'` to satisfy updated Player interface |
| `package.json` | Added `nativewind`, `tailwindcss`, `react-native-reanimated`, `@expo/vector-icons` |

### Key decisions

**Drizzle as sole data layer.** `storageService.ts` (Node `fs`) stays for CLI only and is never imported from `app/`. `useLiveQuery` provides reactive updates — no manual state refresh needed after insert/update/delete.

**`nanoid/non-secure` for IDs.** React Native does not polyfill `crypto.getRandomValues`. Using the non-secure export avoids a polyfill dependency; IDs are non-sensitive.

**Dark theme, plain StyleSheet.** NativeWind v4 installed and configured, but base components use RN StyleSheet for reliability on first run. NativeWind utility classes available for future use.

**Migration gate in root layout.** `useDbMigration().success` must be true before any screen renders — prevents queries against non-existent tables on first install.

### Still TODO

- Formula calibration: `estimateOvrGainFromCoach` awaiting research data (tonight)
- ML Kit OCR: `useScanner` stub — next sprint
- Pro tier gating: planned after formula update
- Push notifications: planned after mobile UI stabilises

---

## Sprint 2 — Investment Engine
**2026-05-06**

### Shipped

**Resource-allocation decision engine** — the core value of the app is now functional via CLI.

`planPlayerInvestment(player, profile, targetTier)` produces a full step-by-step investment plan respecting manager style (FTP / Hybrid / PTW) and enforcing the coaches-first rule. `compareInvestmentScenarios` runs the same plan for N players against an identical resource pool and returns a ranked recommendation.

**Files added/modified:**

| File | Change |
|---|---|
| `src/types/resources.ts` | New — `Coach`, `ManagerProfile`, `InvestmentPlan`, `ScenarioComparison` types |
| `src/logic/ovrProjector.ts` | New — step-by-step OVR chain (coaches → tier → greens) |
| `src/logic/investmentEngine.ts` | New — style-filtered planning + recommendation text |
| `src/logic/scenarioComparator.ts` | New — multi-player ranking for shared resource pool |
| `src/utils/coachMath.ts` | Rewritten — calibrated piecewise gain table, age factor, seminar bonus |
| `src/database/playerSchema.ts` | Modified — added `tier: TierName` field |
| `src/index.ts` | Modified — Plan Investment (option 4) + Compare Players (option 5) |
| `tests/investment-test.ts` | New — 3-scenario regression test |
| `.gitignore` | New |
| `package-lock.json` | Added |

**Sample test output (18yo, OVR 120 striker, Elite Chest coaches → Stellar):**

```
Step 1  Attacking ×30      120.0 → 130.3   +10.3   FREE
Step 2  Defending ×40      130.3 → 140.2   +9.9    FREE
Step 3  Physical ×28       140.2 → 152.0   +11.8   FREE
Step 4  Tier → Stellar     152.0 → 202.0   +50.0   600 tier pts
Step 5  100 greens (×1.3)  202.0 → 210.7   +8.7    100 greens
Final: 210.7   Gain: +90.7

Scenario comparison:
  #1  Alpha Striker (18yo, 120 → 210.7, +90.7)
  #2  Academy GK    (17yo,  88 → 154.2, +66.2)
  → Recommended: Alpha Striker
```

### Key decisions

**OVR_NORMALIZER = 16.** OVR is a weighted composite of ~16 stats. Dividing total stat-gain by the number of stats a coach trains (5) inflated projections by ~3×. Fixed to divide by 16 (total contributing stats), keeping individual-coach gain in the observed +9–12 OVR range.

**Grey stat weight = 0.1.** Stats not in the player's role white-list still receive coaching but contribute minimally to OVR. A weight of 0.4 overestimated gains; 0.1 aligns with observed data.

**Seminar bonus = 1.6×.** Skill Seminar sessions yield noticeably higher OVR gains than equivalent Training sessions, not fully explained by multiplier differences. Empirically calibrated at 1.6×; formula marked TODO pending research docs.

**Coach attribute list is per-card.** A Standard Attacking card does not always train all 5 attack stats. The count varies by card instance (3–5 observed). Model stores `attributes: string[]` per card, not derived from type name.

### Known limitations / TODO

- `estimateOvrGainFromCoach` formula is empirically approximated. Research docs will be added to repo; formula body will be updated without changing the function signature.
- Drizzle migrations are a stub. Full migration generation pending schema stabilisation before mobile build sprint.

---

## Sprint 1 — Foundations
**2026-05-05**

### Shipped

Project skeleton, build tooling, and all pre-existing logic brought to a working state.

**Problem:** repository had logic files but no `package.json`, no `tsconfig.json`, broken imports, and syntax errors from leftover citation artifacts — nothing ran.

**Fixed:**

| Issue | Fix |
|---|---|
| No `package.json` | Created — Expo 53, RN 0.76.5, Drizzle ORM, `tsx` for CLI |
| No `tsconfig.json` | Created — ES2022, bundler module resolution, strict |
| `[cite: ...]` artifacts in `zeroDrainProtocol.ts` | Removed — were TypeScript syntax errors |
| Missing `getRecommendedDrills` export | Added alias in `controller.ts` |
| Missing `drizzle/migrations.ts` | Created stub to unblock import |

**Confirmed mechanics (from empirical observation):**

- Fan Club condition reductions: L0 −10% through L4 −50% ✓
- Zero-Drain protocol: Fan Club L4 + chants on Very Easy drills = 0% condition loss ✓
- Coach multiplier: the ×N number IS the multiplier fed to `calculateDynamicGain` ✓
- Hard stat cap: at maximum stat value, session gain = exactly 0 ✓
- Age drop-off: gains fall sharply between age 18 and 20; plateau after ~25 ✓
- Premium sponsor path: Elite Chest unlocks higher-multiplier coach cards ✓

**Tests passing after Sprint 1:**
- `tests/drill-logic-test.ts` ✓
- `tests/logic-test.ts` ✓
- `tests/storage-test.ts` ✓

---

## Backlog

| Item | Priority | Notes |
|---|---|---|
| Research docs → formula update | High | User to commit docs; update `estimateOvrGainFromCoach` |
| Mobile UI (Expo screens) | High | Next sprint once logic is stable |
| Screenshot OCR / stat reader | Medium | `useScanner` is a stub; depends on UI sprint |
| Drizzle DB migrations | Medium | Run `npm run db:generate` after schema stabilises |
| Squad synergy / formation engine | Low | `engine.js` stubs left as-is |
| Play Store release | — | Target after mobile UI sprint |
