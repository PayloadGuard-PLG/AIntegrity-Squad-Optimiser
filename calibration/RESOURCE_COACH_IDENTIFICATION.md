# Resource Coach Identification — Clean Probe

## Scope

This branch is analysis-only. It does not modify the production coach model,
engine constants, age table, grey multiplier, K, session decay, or Reward Coach
routing.

The first correction is semantic:

> A displayed coach `xN` value is an observed **multiplier**. It is not evidence
> of `N` ordinary Academy sessions.

The existing calibration adapter remains untouched so its behaviour is preserved
as a baseline. This probe does not call `projectCoachAction`.

## Evidence copied forward

Only raw preview evidence needed for matched tests is represented in
`calibration/resource_coach_evidence.v1.json`.

### Willie Howden

- Extensive Safeguard x106 — Training Camp
- Extensive Safeguard x106 — Drill Session
- Extensive Safeguard x114 — Drill Session

All three are preview-only observations on the same recorded player state.

### Garry McCluskey

- Focused Safeguard x65 — Drill Session, 2 affected stats
- Extensive Safeguard x106 — Drill Session, 8 affected stats

The shared MARKING and AGGRESSION starting values are identical across the pair.

## Probe A — programme family

The exact Howden x106 Training Camp and x106 Drill Session previews are identical
for all eight stat intervals and the OVR interval.

**Current disposition:** programme family is not an identified transfer variable
for this matched pair.

This is a negative result, not a claim that programme family can never matter.

## Probe B — displayed multiplier

Howden x106 and x114 hold player state, programme family, title and affected-stat
set constant. The displayed intervals change, so a deterministic no-multiplier-
effect hypothesis is rejected for this pair.

Two unfitted transforms are reported:

1. direct output scaling by `114/106`;
2. conditional latent-budget scaling with `K=47`, `q=1`.

`K=47` is explicitly conditional. This probe does not establish that the resource
coach uses the ordinary-coach cost curve.

On the current evidence the latent-budget transform is substantially closer to
the observed x114 endpoints than direct output scaling. The test asserts only the
relative result and broad error bounds; it does not optimise q.

## Probe C — affected-stat allocation

McCluskey x65 affects 2 stats and x106 affects 8. The pair is not fully
identified because coach title/shape, multiplier and affected-stat count all
change.

However, for MARKING and AGGRESSION the player and starting stat are identical.
Under a conditional `K=47` cost-integral proxy, a shared total budget divided by
affected-stat count implies

`B_total ∝ p * B_perStat`.

The admitted total-budget ratio intervals for both shared stats include the raw
displayed multiplier ratio `65/106`.

**Current disposition:** `1/p` allocation is compatible with both shared stats.
It is not yet uniquely identified because coach shape and multiplier remain
confounded.

## What is not justified

Do not infer or tune:

- age 28/29 multipliers;
- coach stat-cost caps/floors;
- a new grey multiplier;
- absolute quality dependence;
- ordinary Academy session count from displayed xN;
- Reward Coach transfer.

Those belong to later tests only if residual structure requires them.

## Highest-value next observation

The cleanest next observation is:

> Same player state, same displayed multiplier, same programme family, but two
> non-Reward resource coaches with different affected-stat counts.

Prefer overlapping affected stats so at least one stat has the same starting
value in both previews.

That single pair would separate the `1/p` allocation hypothesis from the current
coach-shape/multiplier confound.

If the roster cannot supply that pair, the next-best test is the same player and
same resource coach shape at two multipliers, which adds a second independent
multiplier-response pair.

## Commands

```bash
npm run test:calibration:resource
npm run calibration:resource
```

The existing calibration and production verification commands should remain
unchanged and continue to pass.


## Mandatory run summary

`npm run calibration:resource` must always finish by printing:

1. the evidence actually loaded;
2. the current result of each matched identification test;
3. remaining confounds;
4. **DATA REQUIRED NEXT**, ordered by priority;
5. exact variables to hold constant;
6. exact variable(s) to change;
7. exact fields/screenshots to capture;
8. a collection decision stating whether additional game evidence is required
   before production calibration.

This is a harness requirement, not optional narration. If the analysis later
concludes no additional observation is required, the summary must say that
explicitly rather than inventing another collection task.


## Replication update

The clean probe now includes two existing same-state multiplier replications that
were already present in the historical calibration branch:

- Garry McCluskey: Extensive Safeguard x106 -> x114 Drill Session.
- Lt Ripley: Extensive Safeguard x106 -> x114 Drill Session.

Together with Willie Howden this gives three independent same-state multiplier
pairs. Therefore the previously listed request for a second x106/x114 player is
retired: the evidence already exists.

The remaining production-blocking observation is the affected-stat allocation
discriminator: same player state, same programme family, same displayed
multiplier, different affected-stat count, with at least one overlapping stat.
