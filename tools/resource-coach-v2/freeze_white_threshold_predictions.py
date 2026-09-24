#!/usr/bin/env python3
"""Freeze predictions under PREREG-20260924-WHITE-THRESHOLD-127.

Two models per stat (all 15 stats, at each coach's registered p), everything else frozen:
  H0    frozen replay profile (WHITE threshold 132.6)
  T127  WHITE threshold 127.0 (the value that fits 23-24 Sep and x59 but degrades the 10-12 Sep archive)

Only WHITE rows discriminate. Scored after the previews exist; never refitted.

Usage:
  python tools/resource-coach-v2/freeze_white_threshold_predictions.py --out calibration/resource-coach-identification/control-predictions-20260924-white-threshold.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CRI = ROOT / "calibration" / "resource-coach-identification"


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fc = _load("freeze_control_predictions", "freeze_control_predictions.py")
sa = fc.sa

PLAYERS = ["midgley", "ljdark-leo", "panic"]
COACHES = [
    dict(key="DS-STD-ATT-X5", label="Standard Attacking", family="DRILL SESSION", N=5, p=3, stats=["PASSING", "DRIBBLING", "FINISHING"], affectedSetKnown=True),
    dict(key="DS-STD-OFF-X10", label="Standard Offensive", family="DRILL SESSION", N=10, p=4, stats=["CROSSING", "SHOOTING", "SPEED", "CREATIVITY"], affectedSetKnown=True),
    dict(key="STD-DEF-X20", label="Standard Defending", family="DRILL SESSION", N=20, p=4, stats=["TACKLING", "MARKING", "POSITIONING", "HEADING", "BRAVERY"], affectedSetKnown=False),
    dict(key="STD-PHY-X15", label="Standard Physical", family="SKILL SEMINAR", N=15, p=4, stats=["FITNESS", "STRENGTH", "AGGRESSION", "SPEED", "CREATIVITY"], affectedSetKnown=False),
]
MODELS = {"H0": {}, "T127": {"hW": 127.0}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    out = dict(schemaVersion="resource-coach-control-predictions-v1", preregistration="PREREG-20260924-WHITE-THRESHOLD-127",
               models={k: dict(sa.BASE, **v)["hW"] for k, v in MODELS.items()}, players=[])
    for who in PLAYERS:
        card = json.loads((CRI / f"control-card-20260924-{who}.json").read_text(encoding="utf-8"))
        entry = dict(player={k: card[k] for k in ("name", "age", "tier", "roles", "stats", "classes")},
                     corpusStatusFromRoster=card.get("corpusStatus"), coaches=[])
        for c in COACHES:
            rows = [dict(stat=s, s=float(card["stats"][s]), cls=card["classes"][s], g=[0.0, 0.0]) for s in fc.OUTFIELD]
            ev = sa._event(event=f"CONTROL-{c['key']}", playerName=card["name"], partition="control", family=c["family"], coach=c["label"],
                           N=float(c["N"]), p=c["p"], age=int(card["age"]), tier=card["tier"], evidence="control-card-only", rows=rows)
            X = sa.Rows([ev])
            preds = {k: sa.predict(dict(sa.BASE, **v), X) for k, v in MODELS.items()}
            stats = []
            for i, r in enumerate(rows):
                e = dict(stat=r["stat"], start=r["s"], displayClass=r["cls"], categoryStat=r["stat"] in c["stats"])
                for k, (lo, hi) in preds.items():
                    e[k] = dict(rawLo=round(float(lo[i]), 4), rawHi=round(float(hi[i]), 4), lo=int(math.floor(lo[i])), hi=int(math.ceil(hi[i])),
                                point=round(float((lo[i] + hi[i]) / 2), 3))
                e["discriminates"] = abs(e["H0"]["point"] - e["T127"]["point"]) >= 0.5
                stats.append(e)
            entry["coaches"].append(dict(key=c["key"], label=c["label"], programme=c["family"], N=c["N"], p=c["p"],
                                         categoryStats=c["stats"], affectedSetKnown=c["affectedSetKnown"], statIntervals=stats))
        out["players"].append(entry)
    pathlib.Path(args.out).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for p in out["players"]:
        print(p["player"]["name"], p["player"]["age"], p["player"]["tier"], p["player"]["roles"])
        for c in p["coaches"]:
            d = [s for s in c["statIntervals"] if s["categoryStat"] and s["discriminates"]]
            print(f"  {c['key']:15s} " + "  ".join(f"{s['stat']} {s['start']:.0f} H0 [{s['H0']['lo']},{s['H0']['hi']}] T127 [{s['T127']['lo']},{s['T127']['hi']}]" for s in d))


if __name__ == "__main__":
    main()
