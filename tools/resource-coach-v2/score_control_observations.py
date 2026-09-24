#!/usr/bin/env python3
"""Score observed control previews against predictions frozen before the previews existed.

Reads only committed files: the control card, the frozen control predictions (H0 / HYG / A),
the frozen white-threshold predictions (H0 / T127) and the observation. Nothing is refitted;
the implied dose is a diagnostic (the frozen shape with a free budget multiplier).

Usage:
  python tools/resource-coach-v2/score_control_observations.py --players midgley ljdark-leo panic \
      --white-threshold-out calibration/resource-coach-identification/control-score-20260924-white-threshold.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import pathlib

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CRI = ROOT / "calibration" / "resource-coach-identification"

spec = importlib.util.spec_from_file_location("structure_audit", HERE / "structure_audit.py")
sa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sa)

WT_PREDICTIONS = CRI / "control-predictions-20260924-white-threshold.json"
FAMILY = {"DS-STD-ATT-X5": ("DRILL SESSION", "Standard Attacking", 5), "DS-STD-OFF-X10": ("DRILL SESSION", "Standard Offensive", 10),
          "STD-DEF-X20": ("DRILL SESSION", "Standard Defending", 20), "STD-PHY-X15": ("SKILL SEMINAR", "Standard Physical", 15)}


def _score(pred, obs):
    lo = np.array([p[0] for p in pred]); hi = np.array([p[1] for p in pred])
    ol = np.array([o[0] for o in obs], float); oh = np.array([o[1] for o in obs], float)
    return sa.score(lo, hi, ol, oh)


def implied_dose(card, key, observed):
    fam, label, N = FAMILY[key]
    rows = [dict(stat=s, s=float(card["stats"][s]), cls=card["classes"][s], g=[float(v[0]), float(v[1])]) for s, v in observed.items()]
    ev = sa._event(event=f"SCORE-{key}", playerName=card["name"], partition="control", family=fam, coach=label, N=float(N),
                   p=len(observed), age=int(card["age"]), tier=card["tier"], evidence="control-preview", rows=rows)
    return math.exp(sa.budget_offset(dict(sa.BASE), [ev]))


def score_player(slug, wt):
    card = json.loads((CRI / f"control-card-20260924-{slug}.json").read_text(encoding="utf-8"))
    obs = json.loads((CRI / f"control-observation-20260924-{slug}.json").read_text(encoding="utf-8"))
    ctrl = json.loads((CRI / f"control-predictions-20260924-{slug}.json").read_text(encoding="utf-8"))
    wtp = next(p for p in wt["players"] if p["player"]["name"] == card["name"])
    out = dict(schemaVersion="resource-coach-control-score-v1", player=card["name"], age=card["age"], tier=card["tier"], roles=card["roles"],
               predictionsFrozenAtCommit=obs["predictionsFrozenAtCommit"], perCoach={}, whiteRows=[])
    for key, observed in obs["statIntervals"].items():
        c_ctrl = next((c for c in ctrl["coaches"] if c["key"] == key), None)
        c_wt = next(c for c in wtp["coaches"] if c["key"] == key)
        if c_wt["p"] != len(observed):
            out["perCoach"][key] = dict(protocolDeviation=f"registered p={c_wt['p']}, observed p={len(observed)}; not scored")
            continue
        stats = list(observed)
        o = [observed[s] for s in stats]
        entry = dict(p=len(stats), stats=stats)
        byStat_wt = {s["stat"]: s for s in c_wt["statIntervals"]}
        entry["H0"] = _score([(byStat_wt[s]["H0"]["rawLo"], byStat_wt[s]["H0"]["rawHi"]) for s in stats], o)
        entry["T127"] = _score([(byStat_wt[s]["T127"]["rawLo"], byStat_wt[s]["T127"]["rawHi"]) for s in stats], o)
        if c_ctrl:
            byStat_c = {s["stat"]: s for s in c_ctrl["statIntervals"]}
            for m in ("HYG", "A"):
                if all(m in byStat_c[s] for s in stats):
                    entry[m] = _score([(byStat_c[s][m]["rawLo"], byStat_c[s][m]["rawHi"]) for s in stats], o)
            # the two frozen H0 files must agree (same model, same card)
            assert all(abs(byStat_c[s]["H0"]["rawLo"] - byStat_wt[s]["H0"]["rawLo"]) < 1e-3 for s in stats)
        entry["impliedDoseVsH0"] = implied_dose(card, key, observed)
        entry["rows"] = [dict(stat=s, start=card["stats"][s], cls=card["classes"][s], observed=observed[s],
                              H0=[byStat_wt[s]["H0"]["rawLo"], byStat_wt[s]["H0"]["rawHi"]],
                              T127=[byStat_wt[s]["T127"]["rawLo"], byStat_wt[s]["T127"]["rawHi"]]) for s in stats]
        out["perCoach"][key] = entry
        out["whiteRows"] += [dict(player=card["name"], coach=key, **r) for r in entry["rows"] if r["cls"] == "WHITE"]
    allrows = [r for e in out["perCoach"].values() if "rows" in e for r in e["rows"]]
    out["pooled"] = dict(H0=_score([r["H0"] for r in allrows], [r["observed"] for r in allrows]), rows=len(allrows))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--players", nargs="+", required=True)
    ap.add_argument("--white-threshold-out", required=True)
    args = ap.parse_args()
    wt = json.loads(WT_PREDICTIONS.read_text(encoding="utf-8"))
    white = []
    for slug in args.players:
        s = score_player(slug, wt)
        white += s.pop("whiteRows")
        (CRI / f"control-score-20260924-{slug}.json").write_text(json.dumps(s, indent=1) + "\n", encoding="utf-8")
        print(f"{s['player']}  pooled H0 MAE {s['pooled']['H0']['midpointMae']:.2f}  inside {100*s['pooled']['H0']['pointInsideRate']:.0f}%  ({s['pooled']['rows']} rows)")
        for k, e in s["perCoach"].items():
            if "H0" not in e:
                print(f"   {k}: {e}"); continue
            extra = "  ".join(f"{m} {e[m]['midpointMae']:.2f}" for m in ("HYG", "A") if m in e)
            print(f"   {k:15s} H0 {e['H0']['midpointMae']:.2f} ({100*e['H0']['pointInsideRate']:.0f}% in, signed {e['H0']['signedResidual']:+.2f})  "
                  f"T127 {e['T127']['midpointMae']:.2f}  {extra}  dose x{e['impliedDoseVsH0']:.2f}")
    h0 = _score([r["H0"] for r in white], [r["observed"] for r in white])
    t127 = _score([r["T127"] for r in white], [r["observed"] for r in white])
    n = len(white)
    if n < 8:
        verdict = "inconclusive (fewer than 8 scored WHITE rows)"
    elif t127["midpointMae"] <= h0["midpointMae"] - 0.3 and h0["signedResidual"] > 0:
        verdict = "supports T127"
    elif h0["midpointMae"] <= t127["midpointMae"] - 0.3:
        verdict = "supports H0 (132.6)"
    else:
        verdict = "inconclusive (margin below 0.3)"
    res = dict(schemaVersion="resource-coach-control-score-v1", preregistration="PREREG-20260924-WHITE-THRESHOLD-127",
               predictionsFrozenAtCommit="bd43e5ee401c37e876054048933e113035b08ff3", scoredWhiteRows=n, H0=h0, T127=t127, verdict=verdict,
               rows=white)
    pathlib.Path(args.white_threshold_out).write_text(json.dumps(res, indent=1) + "\n", encoding="utf-8")
    print(f"\nWHITE rows {n}: H0 MAE {h0['midpointMae']:.3f} (signed {h0['signedResidual']:+.2f}, inside {100*h0['pointInsideRate']:.0f}%)  "
          f"T127 MAE {t127['midpointMae']:.3f} (signed {t127['signedResidual']:+.2f}, inside {100*t127['pointInsideRate']:.0f}%)  -> {verdict}")


if __name__ == "__main__":
    main()
