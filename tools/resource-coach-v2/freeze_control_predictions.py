#!/usr/bin/env python3
"""Freeze F / N1 / A predictions for a control player under PREREG-20260924-COACH-ANCHOR-CONTROL.

Reads the preregistration and a player card only. The player's own previews are never read.
Predictions are produced for every one of the 15 stats per coach (conditional on the coach's
registered affected-stat count p), so a preview that shows a different stat set is still
covered; the registered affected set is flagged.

Usage:
  python tools/resource-coach-v2/freeze_control_predictions.py --card card.json --out predictions.json
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
PREREG = ROOT / "calibration" / "resource-coach-identification" / "preregistration-20260924-coach-anchor-control.json"

_spec = importlib.util.spec_from_file_location("structure_audit", HERE / "structure_audit.py")
sa = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sa)

OUTFIELD = ["TACKLING", "MARKING", "POSITIONING", "HEADING", "BRAVERY", "PASSING", "DRIBBLING", "CROSSING",
            "SHOOTING", "FINISHING", "FITNESS", "STRENGTH", "AGGRESSION", "SPEED", "CREATIVITY"]
ANCHOR_EVENTS = {
    "DS-STD-ATT-X5": ["GILMARTIN-STANDARD-ATTACKING-X5-20260923", "MARK-ORDINARY-X5"],
    "DS-STD-OFF-X10": ["LURINSKY-STD-OFF-X10-DRILL", "LERCHL-STD-OFF-X10-DRILL"],
    "SS-STD-SAFE-X59": ["CHAT-20260924-VINCE-NEMETH-STD-SAFE-X59-SKILL", "CHAT-20260924-OLIVER-LERCHL-STD-SAFE-X59-SKILL",
                        "CHAT-20260924-DAVID-MIDGLEY-STD-SAFE-X59-SKILL", "CHAT-20260924-BRYAN-BAXTER-STD-SAFE-X59-SKILL"],
}
FAMILY = {"DS": "DRILL SESSION", "SS": "SKILL SEMINAR"}


def models():
    cand = json.loads(sa.CANDIDATE_PROFILE.read_text(encoding="utf-8"))
    F = dict(sa.BASE)
    N1 = dict(sa.BASE, N0=float(cand["dose"]["multiplierOffset"]), logC=math.log(cand["dose"]["globalAmplitude"]))
    return F, N1


def anchor_offsets(F, card_name):
    events = {e["event"]: e for e in sa.load_events()}
    out = {}
    for key, ids in ANCHOR_EVENTS.items():
        anchors = [events[i] for i in ids]
        if any(a["playerName"] == card_name for a in anchors):
            anchors = [a for a in anchors if a["playerName"] != card_name]   # never anchor a player on itself
        out[key] = dict(logOffset=float(np.mean([sa.budget_offset(F, [a]) for a in anchors])),
                        anchors=[a["event"] for a in anchors])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--card", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    prereg = json.loads(PREREG.read_text(encoding="utf-8"))
    card = json.loads(pathlib.Path(args.card).read_text(encoding="utf-8"))
    F, N1 = models()
    anchors = anchor_offsets(F, card["name"])
    result = dict(schemaVersion="resource-coach-control-predictions-v1", preregistration=prereg["id"],
                  player={k: card[k] for k in ("name", "age", "tier", "roles", "ovr", "stats", "classes", "source")},
                  corpusStatus=card.get("corpusStatus"), coaches=[])
    for c in prereg["coaches"]:
        fam = c["key"].split("-")[0]
        rows = [dict(stat=s, s=float(card["stats"][s]), cls=card["classes"][s], g=[0.0, 0.0]) for s in OUTFIELD]
        ev = sa._event(event=f"CONTROL-{c['key']}", playerName=card["name"], partition="control", family=FAMILY[fam],
                       coach=c["label"], N=float(c["N"]), p=int(c["p"]), age=int(card["age"]), tier=card["tier"],
                       evidence="control-card-only", rows=rows)
        X = sa.Rows([ev])
        A = dict(F, logC=F["logC"] + anchors[c["key"]]["logOffset"])
        preds = {name: sa.predict(P, X) for name, P in (("F", F), ("N1", N1), ("A", A))}
        stats = []
        for i, r in enumerate(rows):
            entry = dict(stat=r["stat"], start=r["s"], displayClass=r["cls"], registeredAffected=r["stat"] in c["stats"])
            for name, (lo, hi) in preds.items():
                entry[name] = dict(rawLo=round(float(lo[i]), 4), rawHi=round(float(hi[i]), 4),
                                   lo=int(math.floor(lo[i])), hi=int(math.ceil(hi[i])),
                                   point=round(float((lo[i] + hi[i]) / 2), 3))
            stats.append(entry)
        result["coaches"].append(dict(key=c["key"], programme=c["programme"], label=c["label"], N=c["N"], p=c["p"],
                                      registeredStats=c["stats"], anchor=anchors[c["key"]],
                                      doseRelativeToFrozen=dict(F=1.0, N1=float(math.exp(N1["logC"] - F["logC"]) * (c["N"] - 1) / c["N"]),
                                                                A=float(math.exp(anchors[c["key"]]["logOffset"]))),
                                      statIntervals=stats))
    pathlib.Path(args.out).write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for c in result["coaches"]:
        print(f"\n{c['key']}  N={c['N']} p={c['p']}  dose vs F: N1={c['doseRelativeToFrozen']['N1']:.3f} A={c['doseRelativeToFrozen']['A']:.3f}")
        for s in c["statIntervals"]:
            if s["registeredAffected"]:
                print(f"  {s['stat']:11s} {s['start']:5.0f} {s['displayClass']:8s}  F [{s['F']['lo']},{s['F']['hi']}]  "
                      f"N1 [{s['N1']['lo']},{s['N1']['hi']}]  A [{s['A']['lo']},{s['A']['hi']}]")


if __name__ == "__main__":
    main()
