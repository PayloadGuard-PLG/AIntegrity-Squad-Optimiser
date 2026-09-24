#!/usr/bin/env python3
"""Freeze predictions under PREREG-20260924-YOUNG-GREY-CONTROL.

Models per stat (all 15 stats, conditional on the coach's registered p):
  H0   frozen replay profile (flat cost below the class threshold)
  HYG  H0 except: age 18-21 and MID_GREY -> marginal cost g below latent coordinate `knot`
       (g and knot read from the preregistration, never fitted here)
  A    frozen response plus the other-player coach anchor (anchor_offset), never the target's own previews

Usage:
  python tools/resource-coach-v2/freeze_young_grey_predictions.py --card card.json --out predictions.json
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
PREREG = ROOT / "calibration" / "resource-coach-identification" / "preregistration-20260924-young-grey-control.json"


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fc = _load("freeze_control_predictions", "freeze_control_predictions.py")
cr = _load("corpus_roster", "corpus_roster.py")
sa = fc.sa

COACHES = [
    dict(key="DS-STD-ATT-X5", family="DRILL SESSION", label="Standard Attacking", N=5, p=3, stats=["PASSING", "DRIBBLING", "FINISHING"]),
    dict(key="DS-STD-OFF-X10", family="DRILL SESSION", label="Standard Offensive", N=10, p=4, stats=["CROSSING", "SHOOTING", "SPEED", "CREATIVITY"]),
]
# Multi-day coaches in the 24 Sep inventory whose four affected stats are not shown on the tile:
# predictions are frozen for all five category stats at the registered p = 4; no anchor exists.
EXTRA_COACHES = {
    "STD-DEF-X20": dict(key="STD-DEF-X20", family="UNSPECIFIED", label="Standard Defending", N=20, p=4,
                        stats=["TACKLING", "MARKING", "POSITIONING", "HEADING", "BRAVERY"], affectedSetKnown=False),
    "STD-PHY-X15": dict(key="STD-PHY-X15", family="UNSPECIFIED", label="Standard Physical", N=15, p=4,
                        stats=["FITNESS", "STRENGTH", "AGGRESSION", "SPEED", "CREATIVITY"], affectedSetKnown=False),
}


def piecewise_movement(u, h, K, B, g, knot):
    """Cost g below knot, 1 from knot to h, exp((x-h)/K) above h. Visible gain for u >= 0."""
    x, rem = u, B
    if g != 1.0 and x < knot:
        seg = (knot - x) * g
        if rem <= seg:
            return rem / g
        rem -= seg; x = knot
    if x < h:
        seg = h - x
        if rem <= seg:
            return x + rem - u
        rem -= seg; x = h
    return x + K * math.log1p(rem / (K * math.exp((x - h) / K))) - u


def hyg_interval(P, age, tier, N, p, s, cls, g, knot, band):
    A = sa.BANDS[sa.band_index(age)][2]
    B = math.exp(P["logC"]) * A * N / p
    white = cls == "WHITE"
    u = s - (sa.DELTA[int(str(tier)[1])] if white else 0.0)
    h = P["hW"] if white else P["hG"]
    gg = g if (not white and band[0] <= age <= band[1]) else 1.0
    rho = math.exp(P["logRho"])
    return piecewise_movement(u, h, P["K"], B, gg, knot), piecewise_movement(u, h, P["K"], B * rho, gg, knot)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--card", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--extra-coaches", nargs="*", default=[], choices=sorted(EXTRA_COACHES))
    args = ap.parse_args()
    prereg = json.loads(PREREG.read_text(encoding="utf-8"))
    fp = prereg["fixedParameters"]
    card = json.loads(pathlib.Path(args.card).read_text(encoding="utf-8"))
    F = dict(sa.BASE)
    anchors = fc.anchor_offsets(F, card["name"])
    out = dict(schemaVersion="resource-coach-control-predictions-v1", preregistration=prereg["id"],
               player={k: card[k] for k in ("name", "age", "tier", "roles", "ovr", "stats", "classes", "source")},
               arm=card.get("arm"), corpusStatus=card.get("corpusStatus"),
               corpusStatusFromRoster=cr.lookup(card["name"], *cr.sources()), fixedParameters=fp, coaches=[])
    for c in COACHES + [EXTRA_COACHES[k] for k in args.extra_coaches]:
        rows = [dict(stat=s, s=float(card["stats"][s]), cls=card["classes"][s], g=[0.0, 0.0]) for s in fc.OUTFIELD]
        ev = sa._event(event=f"CONTROL-{c['key']}", playerName=card["name"], partition="control", family=c["family"],
                       coach=c["label"], N=float(c["N"]), p=c["p"], age=int(card["age"]), tier=card["tier"],
                       evidence="control-card-only", rows=rows)
        X = sa.Rows([ev])
        h0 = sa.predict(F, X)
        anchor = anchors.get(c["key"])
        a = sa.predict(dict(F, logC=F["logC"] + anchor["logOffset"]), X) if anchor else None
        stats = []
        for i, r in enumerate(rows):
            yl, yh = hyg_interval(F, int(card["age"]), card["tier"], c["N"], c["p"], r["s"], r["cls"], fp["g"], fp["knot"], fp["ageBand"])
            entry = dict(stat=r["stat"], start=r["s"], displayClass=r["cls"], registeredAffected=r["stat"] in c["stats"])
            models = [("H0", (h0[0][i], h0[1][i])), ("HYG", (yl, yh))] + ([("A", (a[0][i], a[1][i]))] if a else [])
            for name, (lo, hi) in models:
                entry[name] = dict(rawLo=round(float(lo), 4), rawHi=round(float(hi), 4), lo=int(math.floor(lo)), hi=int(math.ceil(hi)),
                                   point=round(float((lo + hi) / 2), 3))
            stats.append(entry)
        out["coaches"].append(dict(key=c["key"], programme=c["family"], label=c["label"], N=c["N"], p=c["p"], registeredStats=c["stats"],
                                   anchor=anchor, affectedSetKnown=c.get("affectedSetKnown", True), statIntervals=stats))
    pathlib.Path(args.out).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(card["name"], "|", card.get("arm"), "|", out["corpusStatusFromRoster"]["status"])
    for c in out["coaches"]:
        print(f"  {c['key']}")
        for s in c["statIntervals"]:
            if s["registeredAffected"]:
                a_txt = f"  A [{s['A']['lo']},{s['A']['hi']}]" if "A" in s else "  A n/a"
                print(f"    {s['stat']:11s} {s['start']:5.0f} {s['displayClass']:8s} H0 [{s['H0']['lo']},{s['H0']['hi']}]  "
                      f"HYG [{s['HYG']['lo']},{s['HYG']['hi']}]{a_txt}")


if __name__ == "__main__":
    main()
