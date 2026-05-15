<div align="center">
  <img src="./assets/logo.png" alt="Squad Optimiser Engine" width="320" />
</div>

<div align="center">

# 🔴 AIntegrity Squad Optimiser

![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS%20%7C%20Web-blue)
![Updates](https://img.shields.io/badge/updates-OTA%20via%20EAS-brightgreen)
![License](https://img.shields.io/badge/license-Non--Commercial-red)

**The Manager's Dilemma:** *Which player, which drills, which tier — and exactly what OVR will they reach?*

**AIntegrity Squad Optimiser gives you the exact, mathematically proven answer before you commit a single in-game asset.**

🔒 *All calculations run entirely on-device. No accounts, no servers, no API calls.*

</div>

---

## ✨ Core Capabilities

- 🎯 **Deterministic OVR Projections** — Models age, role, stat profile, and talent tier to project the exact OVR outcome for any combination of coaching, upgrades, and condition resources — before you spend anything.
- 📸 **Instant OCR Scanning** — Tap **SCAN PLAYER CARD** to read all 15 stats, OVR, age, role, and tier straight from a screenshot. No manual entry.
- 📈 **Drill ROI Ranking** — All 25 drills ranked by return on investment for the selected player and Fan Club level. Zero-drain detection at L4 + Very Easy.
- 🔗 **Sequential Planning** — Chain coaching blocks, tier upgrades, and restorers into one sequential plan with a per-step OVR breakdown, saved to device history.

📡 *Post-build updates deploy via EAS OTA — no app store submission required.*

---

## 🗺️ The Workflow

**📋 SQUAD** — The roster overview. Scan a player card screenshot to instantly add a player, or tap to edit manually. Includes a one-step revert to undo applied gains.

**🧑‍🏫 COACHES** — Simulate a coaching block. Select the stats it covers, enter session count → exact per-stat gains and OVR delta. Scan a coach preview screenshot to auto-fill.

**💊 DRILLS** — All 25 drills ranked by ROI for the selected player. Fan Club level selector. Drill type colour-coded. Build a preset on this tab and load it into PLAN.

**⚙️ PLAN** — Combine drills, tier upgrades, and restorers into a single projection. Analyses per-resource gain breakdown across the full chain.

**✅ RESULTS** — The full sequential OVR chain before you execute it in-game.

**📊 SQUAD PLAN** — Saved coaching history per player — OVR before/after, stat gains, session count, tier, date.

> 🎨 **Visual Interface:** Stats use fixed colour-coding across every screen — DEF 🔵 `#4A7FC1`, ATT 🟣 `#7C3AED`, PHY 🟠 `#C05621`. Essential (white) stats display at full opacity; secondary (grey) stats are dimmed.

---

## ⚠️ The One Rule

> **Always drill before tier upgrade.**
>
> Tier permanently raises base stat values — coaching afterwards costs more XP per gain. Run all drills first to maximise total OVR gain per resource unit.

The engine enforces this ordering in every plan it generates.

---

## 💻 Quick Start

> Requires a **development build** — on-device OCR cannot run in Expo Go.

```bash
npm install
npx expo start
```

Device build: `npx eas build --profile development --platform android`

OTA updates push automatically on merge to `main`. An `EXPO_TOKEN` secret must be set in the repository for EAS to deploy.

---

## 🧠 Architecture & Documentation

The core logic — calibrated XP models, OVR projection formulas, role weight tables, and condition drain calculations — is validated against real in-game data.

| Doc | Contents |
|---|---|
| [`WHITEPAPER.md`](./WHITEPAPER.md) | Formula derivations, XP calibration data, role weights, tier models, OCR system mechanics |
| [`FORMULAS.md`](./FORMULAS.md) | Concise formula reference with worked examples |
| [`DESIGN.md`](./DESIGN.md) | UI/visual design conventions — safe-to-edit vs logic-critical files |
| [`DEVLOG.md`](./DEVLOG.md) | Sprint-by-sprint build history and changelogs |
| [`HANDOVER.md`](./HANDOVER.md) | Complete file map, database schemas, and deployment instructions |
| [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) | Open bugs and resolved issue tracking |

---

## ⚠️ Disclaimer

Unofficial and unaffiliated with any game developer or publisher. No game assets or proprietary data utilised. All calibration relies on publicly observable game behaviour. Strictly for personal, non-commercial use.
