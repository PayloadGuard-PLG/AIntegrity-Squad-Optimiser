# AIntegrity Squad Optimiser

A mobile-first investment planner for stat-based football management games. Answers the question every manager asks before spending resources: **which player, which drills, which tier — and exactly what OVR will they reach?**

Built with React Native / Expo. Live on branch `claude/continue-development-uXA5D` via EAS OTA.

---

## What It Does

You have coaches, tier points, greens, and a budget. You have a squad. You want a deterministic answer before committing anything.

The engine models each player's age, role, stat profile, talent tier, and current stat values — then projects an exact OVR outcome for any combination of drills, tier upgrade, and condition resources.

---

## Four Tabs

| Tab | Purpose |
|---|---|
| **SQUAD** | All players — OVR, role, age, tier, mutant flag. Tap to edit. |
| **PLAN** | Select a player, configure drills + tier + greens → get a step-by-step OVR projection with gain breakdown and warnings. |
| **DRILLS** | Ranked drill recommendations for a player — sorted by ROI (lowest white stat value first = cheapest gain per XP). Fan Club level + drill level aware. Zero-drain protocol detection at L4 + Very Easy. |
| **COACHES** | Simulate any coaching session: select which stats the coach covers, enter session count (×N), set intensity and talent tier → exact per-stat gains and OVR change projected. |

---

## Engine Overview

```
Drill Sessions  →  Tier Upgrade  →  Greens (condition only)
```

**XP model (calibrated):**
```
budget_per_stat = sessionCount × 150 (baseXpPerSession) / drill.stats.length
xpCost_per_1%  = xpCostTable[stat] / (ageMult × talentMult × greyMult × adMult × drillLevelMult)
gain           = fractional accumulation until budget exhausted
```

Validated against Standard Attacking ×30 real data (age 18, Normal, Medium intensity):
- Passing 121 → +26–33 observed | ~27 model ✓
- Dribbling 132 → +20–27 observed | ~25 model ✓

**Key parameters** (all in `profiles/game_2025.json`):
- `baseXpPerSession: 150` — XP per training slot
- `starDecayPerSession: 1.0` — no decay (validated; linear gains observed)
- `statCap: 340` — maximum stat value
- `totalAttributeCount: 15` — for OVR mean calculation
- `greyWeightMultiplier: 0.5` — secondary stats cost 2× per XP

**OVR formula:**
```
OVR = mean(all 15 stats)    (qualityOvrDivisor = 1)
```

---

## Architecture

```
app/(tabs)/
├── index.tsx          — Squad list
├── plan.tsx           — Investment projection (drills + tier + greens)
├── drills.tsx         — Drill recommendations ranked by ROI
└── coaches.tsx        — Coach session simulator (stat selector + OVR output)

src/
├── types/resources.ts       — All interfaces: GameProfile, ManagerProfile, DrillSession…
├── database/
│   ├── playerSchema.ts      — Player interface + SQLite persistence
│   └── drillDatabase.ts     — DRILL_LIST: all 24 drills with stats + condition loss
├── logic/
│   ├── xpEngine.ts          — XP cost formula, estimateStatGainPct (fractional)
│   ├── ovrProjector.ts      — applyDrillSessionsToStats, projectOvr, computeOvrFromStats
│   ├── investmentEngine.ts  — planPlayerInvestment, compareInvestmentScenarios
│   └── controller.ts        — getDrillRecommendations (ROI sort, condition costs)
├── utils/
│   ├── roleWeights.ts       — ROLE_CONSTRAINTS, isWhiteStat, getAllStatKeys
│   ├── math.ts              — getTierAttrAddition, getTierCost
│   └── conditionEngine.ts   — calculateActualLoss (Fan Club reduction)
├── context/ManagerContext.tsx — talentTier, drillLevel, tierPoints, twoxAd state
└── components/
    ├── AppHeader.tsx         — 4-tab nav bar (SQUAD · PLAN · DRILLS · COACHES)
    └── atoms/               — MonoLabel, Chip, CornerBrackets, OvrMovement

profiles/game_2025.json      — All game constants (XP table, age/talent multipliers…)
```

---

## Quick Start

```bash
npm install
npm run typecheck     # must return zero errors before any push
```

### Deploy (EAS OTA)
```bash
git push origin claude/continue-development-uXA5D
# GitHub Actions → EAS OTA → reopen app to get update
```

---

## Web App

The app builds to a static site and can be hosted anywhere — GitHub Pages, Netlify, Cloudflare Pages, or your own server.

### Build

```bash
npx expo export -p web
# outputs to dist/
```

### Local preview

```bash
npx serve dist
# or: python3 -m http.server 8080 --directory dist
```

### Deploy to GitHub Pages (automated)

Add `.github/workflows/deploy-web.yml`:

```yaml
name: Deploy Web
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx expo export -p web
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          cname: payloadguard.org   # remove this line if not using a custom domain
```

Then in **Settings → Pages** set source to `gh-pages` branch.

### Custom domain DNS (Namecheap / any registrar)

#### GitHub Pages — add these A records + CNAME in Advanced DNS:

| Type | Host | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | `<your-org>.github.io` |

#### Netlify — point the apex record at Netlify's load balancer:

| Type | Host | Value |
|------|------|-------|
| A | @ | 75.2.60.5 |
| CNAME | www | `<your-site>.netlify.app` |

HTTPS is provisioned automatically (Let's Encrypt) on both. DNS propagates in ~15–30 min.

### How web storage works

On web the app uses `localStorage` instead of SQLite — Metro resolves the `.web.ts` variants automatically:

| Native | Web |
|--------|-----|
| `src/db/index.ts` (expo-sqlite) | `src/db/index.web.ts` (no-op migration) |
| `src/services/playerService.ts` (Drizzle) | `src/services/playerService.web.ts` (localStorage) |
| `src/hooks/useSquad.ts` (useLiveQuery) | `src/hooks/useSquad.web.ts` (useState + window events) |

Player data is stored under the key `aintegrity_squad` in the browser's localStorage and persists across sessions. Writes dispatch a `'aintegrity_squad_updated'` window event so all open tabs stay in sync.

---

## Docs

| File | Content |
|---|---|
| [`DEVLOG.md`](./DEVLOG.md) | Sprint-by-sprint build history — what shipped, what broke, what's next |
| [`WHITEPAPER.md`](./WHITEPAPER.md) | Full formula derivations, XP calibration, role weights, tier model |
| [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) | Open bugs + resolved issue log |
| [`HANDOVER.md`](./HANDOVER.md) | Agent handover brief — current state, pending tasks, key file map |

---

## Disclaimer

Unofficial and unaffiliated with any game developer or publisher. No game assets or proprietary data used. All calibration is based on publicly observable game behaviour. Personal, non-commercial use only.
