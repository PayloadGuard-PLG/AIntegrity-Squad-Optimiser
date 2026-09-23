# Drill calibration evidence

This folder stores IP-clean drill evidence only. Source-application drill names and the source-to-clean crosswalk are deliberately kept out of the repository.

## Confirmed current UI quantities

- Condition drain is determined by intensity:
  - Very Easy: 0.75%
  - Easy: 1.50%
  - Medium: 2.25%
  - Hard: 3.00%
  - Very Hard: 3.75%
- Training experience points per player follow the same five-step intensity ladder: +1 / +2 / +3 / +4 / +5.
- Perfect Conditions reductions are 10% / 15% / 20% / 25% / 50% for levels 0-4.
- A Very Easy drill under active level 0 therefore has exact drain 0.675%; the UI displays 0.68%.
- Drill quality is a separate variable from intensity. Current World-class popups show +30% Training effect.
- Lower drill-quality effect values remain intentionally unresolved until directly captured on a lower-level account.

## Modelling boundary

Do not infer permanent stat-gain magnitude from intensity alone. Intensity controls condition drain; drill quality / Training effect is a distinct input. The existing drill gain path still treats their relationship as provisional until controlled before/after stat runs identify the transfer law.
