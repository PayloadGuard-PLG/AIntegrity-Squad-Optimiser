# Squad Optimiser — Formula Reference

All constants live in `profiles/game_2025.json`. All formulas are implemented against those constants — changing a value in the JSON changes behaviour app-wide with no code edits required.

---

## 1. OVR (Overall Rating)

```
OVR = floor( sum(all 15 stats) / totalAttributeCount )
```

| Constant | JSON key | Value |
|---|---|---|
| totalAttributeCount | `totalAttributeCount` | 15 |

**Source:** `qualityOvrDivisor = 1` confirms unweighted mean. Truncation (floor) confirmed from Sutters GK: sum 2,844 ÷ 15 = 189.6 → displays 189.

**Training lock:** When `floor(sum / 15) >= maxBaseOvr (180)`, drills and academy coaching are locked. Tier bonuses can push the displayed OVR well above 180 — the lock is on the base (pre-tier) mean, not the displayed total.

---

## 2. Stat Gain (XP Engine)

### 2.1 XP budget per stat per session block

```
budget = sessionCount × baseXpPerSession / drill.stats.length
```

| Constant | JSON key | Value |
|---|---|---|
| baseXpPerSession | `baseXpPerSession` | 150 |

A 5-stat drill run for ×30 sessions: `30 × 150 / 5 = 900 XP per stat`.

### 2.2 XP cost per 1% stat gain

```
xpCost = xpCostTable[statValue] / ( ageMult × talentMult × greyMult × adMult × drillLevelMult )
```

Each factor:

| Factor | Source | Notes |
|---|---|---|
| `xpCostTable[statValue]` | `xpCostTable` array | Base cost (XP per 1%) at current stat value |
| `ageMult` | `ageTable[age]` | 1.10 at 17, 1.00 at 18, drops to 0.10 at 30+ |
| `talentMult` | `talentMultipliers[talent]` | Fastest=1.5 … Slow=0.7 |
| `greyMult` | `greyWeightMultiplier` | 1.0 if white (essential), 0.5 if grey (secondary) |
| `adMult` | `twoxAdMultiplier` | 2.0 if 2× ad active, else 1.0 |
| `drillLevelMult` | `drillLevelMultipliers[level]` | VE=1.0, Easy=1.15, Medium=1.3, Hard=1.55, VH=1.7 |

### 2.3 Gain iteration

The engine iterates 1% at a time, subtracting `xpCost` from `budget` until the budget is exhausted. Sub-integer progress carries forward as a fractional remainder:

```
remaining = budget
while remaining > 0:
    cost = xpCost(currentStat, age, talent, greyMult, adMult, drillLevelMult)
    if cost > remaining: gain += remaining / cost; break
    remaining -= cost
    currentStat += 1
    gain += 1
```

### 2.4 XP cost table

| Stat range | XP per 1% |
|---|---|
| 0–59 | 8 |
| 60–79 | 10 |
| 80–99 | 20 |
| 100–119 | 30 |
| 120–139 | 40 |
| 140–159 | 50 |
| 160–179 | 60 |
| 180–199 | 80 |
| 200–219 | 100 |
| 220–239 | 125 |
| 240–259 | 160 |
| 260–279 | 200 |
| 280–339 | 250 |

### 2.5 Age multipliers

| Age | Multiplier |
|---|---|
| 17 | 1.10 |
| 18 | 1.00 |
| 19 | 0.90 |
| 20 | 0.55 |
| 21 | 0.40 |
| 22 | 0.32 |
| 23 | 0.28 |
| 24 | 0.24 |
| 25 | 0.22 |
| 26 | 0.19 |
| 27 | 0.16 |
| 28 | 0.14 |
| 29 | 0.12 |
| 30+ | 0.10 |

### 2.6 Talent multipliers

| Talent | Multiplier |
|---|---|
| Fastest | 1.50 |
| Fast | 1.25 |
| Average | 1.10 |
| Normal | 1.00 |
| Slow | 0.70 |

### 2.7 Drill level multipliers (XP only)

| Level | Multiplier |
|---|---|
| Very Easy | 1.00 |
| Easy | 1.15 |
| Medium | 1.30 |
| Hard | 1.55 |
| Very Hard | 1.70 |

---

## 3. Condition Loss per Drill

```
conditionLoss = baseLossPerDrill × condLevelMultipliers[drillLevel] × ( 1 − fanClubCondReduction[fanLevel] )
```

| Constant | JSON key | Value |
|---|---|---|
| baseLossPerDrill | `baseLossPerDrill` | 0.75 |
| condLevelMultipliers | `condLevelMultipliers` | VE=1, Easy=2, Medium=3, Hard=4, VH=5 |
| fanClubCondReduction | `fanClubCondReduction` | [0.10, 0.15, 0.20, 0.25, 0.50] (L0–L4) |

**Note:** `condLevelMultipliers` and `drillLevelMultipliers` are different tables with different purposes. Condition and XP are independent systems.

### 3.1 Zero-drain threshold

```
isZeroDrain = conditionLoss < zeroDrainThreshold
```

| Constant | JSON key | Value |
|---|---|---|
| zeroDrainThreshold | `zeroDrainThreshold` | 0.38 |

Only Very Easy + L4 qualifies: `0.75 × 1 × (1 − 0.50) = 0.375 < 0.38` → shown as 0% in-game.

### 3.2 Drill condition reference table

| Level | L0 (−10%) | L1 (−15%) | L2 (−20%) | L3 (−25%) | L4 (−50%) |
|---|---|---|---|---|---|
| Very Easy | 0.675% | 0.638% | 0.600% | 0.563% | **0.375%** → 0 |
| Easy | 1.350% | 1.275% | 1.200% | 1.125% | 0.750% |
| Medium | 2.025% | 1.913% | 1.800% | 1.688% | 1.125% |
| Hard | 2.700% | 2.550% | 2.400% | 2.250% | 1.500% |
| Very Hard | 3.375% | 3.188% | 3.000% | 2.813% | 1.875% |

---

## 4. Condition Restore

```
conditionRestored = restorers × conditionPerRestorer
```

| Constant | JSON key | Value |
|---|---|---|
| conditionPerRestorer | `conditionPerRestorer` | 15 (%) |

Restorers restore condition only. Zero OVR change.

---

## 5. Tier Bonus

Applied after all drills. Affects white (essential) stats only.

### 5.1 Per-step attribute increment

```
increment = tierAttrAdditions[targetTier] − tierAttrAdditions[fromTier]
```

Explicit per-step increments (JSON `tierIncrements`):

| Upgrade | Increment per white stat |
|---|---|
| → T1 (Rare) | +10 |
| → T2 (Elite) | +20 |
| → T3 (Stellar) | +20 |
| → T4 (Master) | +30 |
| → T5 (Epic) | +40 |
| → T6 (Legendary) | +40 |

Cumulative from T0 (`tierAttrAdditions`): T1=+10, T2=+30, T3=+50, T4=+80, T5=+120, T6=+160.

### 5.2 OVR impact of a tier upgrade

```
OVR delta = increment × whiteStatCount / totalAttributeCount
```

| Upgrade | White stats | OVR delta |
|---|---|---|
| T1 on ST (9 white) | +10 × 9 | +6.0 |
| T3 on ST (9 white) | +20 × 9 | +12.0 |
| T3 on DC (5 white) | +20 × 5 | +6.7 |
| T3 on MC (10 white) | +20 × 10 | +13.3 |
| T6 on MC (10 white) | +40 × 10 | +26.7 |

### 5.3 Tier point costs

| Tier | Points required |
|---|---|
| T1 (Rare) | 100 |
| T2 (Elite) | 90 |
| T3 (Stellar) | 50 |
| T4 (Master) | 25 |
| T5 (Epic) | 15 |
| T6 (Legendary) | 10 |

Each tier has its own independent point pool. Points for Rare cannot be used for Elite, etc.

---

## 6. Drills-First Rule

```
optimal order: Drills → Tier upgrade → Restorers
```

Tier upgrades raise the base stat value of white stats permanently. Any drills run afterwards train from a higher baseline where XP costs are greater. Running drills first maximises total stat gain per resource unit.

**Example:** ST at stat 120 (white). Running drills first gains ~+26 per stat at xpCost 40/1%. After T3 (+20), the stat is now 166, training costs 60/1% — significantly more expensive. Sequence matters.

---

## 7. Coach / Academy Session Model

Academy coaches use the same XP formula as drills, locked to Very Hard intensity:

```
budget = sessionCount × baseXpPerSession / selectedStats.count
xpCost = xpCostTable[statValue] / ( ageMult × talentMult × greyMult × 1.0 × drillLevelMult[VH] )
```

- `twoxAd = false` always (2× ad applies to teamplay drills only, not academy coaching)
- Intensity locked to `'Very Hard'` (`drillLevelMult = 1.7`)
- `selectedStats.count` = number of stats the coach covers (user-selected; typically 3–10)

---

## 8. Multi-Role White Stat Union

When a player has 2–3 roles, the white stat set is the union of all roles' essential lists:

```
whiteStats = ROLE_CONSTRAINTS[role1].essential
           ∪ ROLE_CONSTRAINTS[role2].essential   (if present)
           ∪ ROLE_CONSTRAINTS[role3].essential   (if present)
```

`ROLE_CROSSOVER_WHITES[R1][R2]` lists the stats that become white when R2 is added to a player with R1 already set.

**White stat counts by role** (affects tier OVR delta via §5.2):

| Role | White count |
|---|---|
| ST | 9 |
| GK | 7 |
| AMC | 8 |
| AML | 8 |
| AMR | 8 |
| ML | 7 |
| MR | 7 |
| MC | 10 |
| DMC | 10 |
| DC | 5 |
| DL | 8 |
| DR | 8 |

---

## 9. End-to-End Projection Chain

```
Step 1: Apply drill sessions → new stats after XP gain
Step 2: Apply tier upgrade → white stats += increment
Step 3: Recalculate OVR = floor( sum(all 15 updated stats) / 15 )
Step 4: Record restorers as condition step (zero OVR change)
```

The Results tab chains multiple coaching blocks before tier and restorers:

```
Coach block 1 → Coach block 2 → ... → Tier upgrade → Restorers
OVR₀ → OVR₁ → OVR₂ → ... → OVRₙ → OVR_final
```

---

## 10. Teamplay Decay (reference only — not modelled in engine)

```
pillar score decreases by teamPlayDecayPerDay per day
pillarCap = pillarLevel × 2 + 10
```

| Constant | JSON key | Value |
|---|---|---|
| teamPlayDecayPerDay | `teamPlayDecayPerDay` | 2 |
| teamPlayFreeDrillsPerDay | `teamPlayFreeDrillsPerDay` | 4 |
| matchAdvisorMultiplier | `matchAdvisorMultiplier` | 1.5 |
