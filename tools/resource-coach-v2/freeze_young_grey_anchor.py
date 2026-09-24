#!/usr/bin/env python3
"""PREREG-20260924-YOUNG-GREY-ANCHOR: young-grey alone vs young-grey plus other-player coach anchor.

Models (card + coach metadata; the target's own previews never enter its prediction):
  YG           frozen model + young-grey term (profile 20260924b)
  YGA          AGE-GATED: for players aged 22+, YG with the coach's anchor (mean per-event log budget offset of
               OTHER players' observed previews of the same coach definition, each fitted under YG); for 18-21, = YG.
               The gate was chosen from a leave-one-player-out look at the six control arms (22+: 2.12 -> 1.90;
               18-21: every anchor variant worse), which is why this is a prospective test.
  YGA_ungated  exploratory: the anchor at every age
  YGA127       exploratory: YGA with WHITE threshold 127

Two modes:
  --build-anchors OUT   compute the per-event anchor table from committed observations (done once, then pinned)
  --card CARD --out OUT predictions for a card from the PINNED table (no data is re-read)

Usage:
  python tools/resource-coach-v2/freeze_young_grey_anchor.py --build-anchors calibration/resource-coach-identification/anchor-table-20260924-young-grey.json
  python tools/resource-coach-v2/freeze_young_grey_anchor.py --card card.json --out predictions.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import pathlib

import numpy as np
from scipy.optimize import minimize_scalar

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CRI = ROOT / "calibration" / "resource-coach-identification"
ANCHOR_TABLE = CRI / "anchor-table-20260924-young-grey.json"
ANCHOR_MIN_AGE = 22

spec = importlib.util.spec_from_file_location("structure_audit", HERE / "structure_audit.py")
sa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sa)

OUTFIELD = ["TACKLING", "MARKING", "POSITIONING", "HEADING", "BRAVERY", "PASSING", "DRIBBLING", "CROSSING", "SHOOTING", "FINISHING",
            "FITNESS", "STRENGTH", "AGGRESSION", "SPEED", "CREATIVITY"]
# The five coach definitions in the 24 Sep inventory. `registeredP` is the p seen on every preview so far.
COACHES = {
    "DS-STD-ATT-X5": dict(family="DRILL SESSION", label="Standard Attacking", N=5, registeredP=3,
                          affected=["PASSING", "DRIBBLING", "FINISHING"]),
    "DS-STD-OFF-X10": dict(family="DRILL SESSION", label="Standard Offensive", N=10, registeredP=4,
                           affected=["CROSSING", "SHOOTING", "SPEED", "CREATIVITY"]),
    "STD-DEF-X20": dict(family="DRILL SESSION", label="Standard Defending", N=20, registeredP=4,
                        affected=None, category=["TACKLING", "MARKING", "POSITIONING", "HEADING", "BRAVERY"]),
    "STD-PHY-X15": dict(family="SKILL SEMINAR", label="Standard Physical", N=15, registeredP=4,
                        affected=None, category=["FITNESS", "STRENGTH", "AGGRESSION", "SPEED", "CREATIVITY"]),
    "SS-STD-SAFE-X59": dict(family="SKILL SEMINAR", label="Standard Safeguard", N=59, registeredP=5,
                            affected=["HEADING", "BRAVERY", "FITNESS", "STRENGTH", "CREATIVITY"]),
}
CORPUS_ANCHORS = {
    "DS-STD-ATT-X5": ["GILMARTIN-STANDARD-ATTACKING-X5-20260923", "MARK-ORDINARY-X5"],
    "DS-STD-OFF-X10": ["LURINSKY-STD-OFF-X10-DRILL", "LERCHL-STD-OFF-X10-DRILL"],
    "SS-STD-SAFE-X59": ["CHAT-20260924-VINCE-NEMETH-STD-SAFE-X59-SKILL", "CHAT-20260924-OLIVER-LERCHL-STD-SAFE-X59-SKILL",
                        "CHAT-20260924-DAVID-MIDGLEY-STD-SAFE-X59-SKILL", "CHAT-20260924-BRYAN-BAXTER-STD-SAFE-X59-SKILL"],
}
CONTROL_PLAYERS = ["ferguson", "kawa", "rodger", "midgley", "ljdark-leo", "panic"]
# Class corrections recorded in the score files (never applied to the frozen prediction files themselves).
CLASS_CORRECTIONS = {("Ryan Rodger", "HEADING"): "WHITE"}


def yg_params():
    return sa.young_grey_params()


def yg_offset(event, yg, P=None):
    """Log budget offset that best fits one observed event under the young-grey model."""
    P = dict(P or sa.BASE)
    X = sa.Rows([event])
    def sse(d):
        lo, hi = sa.predict_young_grey(dict(P, logC=P["logC"] + d), X, yg)
        return float(np.sum((lo - X.lo) ** 2 + (hi - X.hi) ** 2))
    return float(minimize_scalar(sse, bounds=(-3, 3), method="bounded", options={"xatol": 1e-7}).x)


def control_events():
    out = []
    for slug in CONTROL_PLAYERS:
        card = json.loads((CRI / f"control-card-20260924-{slug}.json").read_text(encoding="utf-8"))
        obs = json.loads((CRI / f"control-observation-20260924-{slug}.json").read_text(encoding="utf-8"))
        for key, iv in obs["statIntervals"].items():
            c = COACHES[key]
            rows = [dict(stat=s, s=float(card["stats"][s]), cls=CLASS_CORRECTIONS.get((card["name"], s), card["classes"][s]),
                         g=[float(v[0]), float(v[1])]) for s, v in iv.items()]
            out.append((key, sa._event(event=f"CONTROL-{slug}-{key}", playerName=card["name"], partition="control-observation",
                                       family=c["family"], coach=c["label"], N=float(c["N"]), p=len(rows), age=int(card["age"]),
                                       tier=card["tier"], evidence="control-preview", rows=rows)))
    return out


def build_anchor_table(out_path):
    yg = yg_params()
    events = {e["event"]: e for e in sa.load_events()}
    table = dict(schemaVersion="resource-coach-anchor-table-v1", preregistration="PREREG-20260924-YOUNG-GREY-ANCHOR",
                 model="young-grey (profile 20260924b), frozen amplitude; offset = log budget multiplier fitted per event under YG",
                 youngGrey=dict(g=yg["g"], knot=yg["knot"], ageBand=list(yg["ageBand"])), coaches={})
    pool = {k: [(events[i], "corpus") for i in ids] for k, ids in CORPUS_ANCHORS.items()}
    for key, ev in control_events():
        pool.setdefault(key, []).append((ev, "control-observation"))
    for key, evs in pool.items():
        table["coaches"][key] = dict(COACHES[key], events=[
            dict(event=e["event"], player=e["playerName"], age=e["age"], tier=e["tier"], p=e["p"], source=src,
                 logOffset=round(yg_offset(e, yg), 6)) for e, src in evs])
    pathlib.Path(out_path).write_text(json.dumps(table, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for key, c in table["coaches"].items():
        offs = [e["logOffset"] for e in c["events"]]
        print(f"{key:16s} n={len(offs)}  mean exp(offset) = {math.exp(np.mean(offs)):.3f}  "
              + ", ".join(f"{e['player'].split()[-1]} {math.exp(e['logOffset']):.2f}" for e in c["events"]))


def anchor_for(table, key, player_name):
    ev = [e for e in table["coaches"].get(key, {}).get("events", []) if e["player"] != player_name]
    if not ev:
        return None
    return dict(logOffset=float(np.mean([e["logOffset"] for e in ev])), events=[e["event"] for e in ev])


def predict_card(card, table):
    yg = dict(g=table["youngGrey"]["g"], knot=table["youngGrey"]["knot"], ageBand=tuple(table["youngGrey"]["ageBand"]))
    out = []
    for key, c in COACHES.items():
        rows = [dict(stat=s, s=float(card["stats"][s]), cls=card["classes"][s], g=[0.0, 0.0]) for s in OUTFIELD]
        ev = sa._event(event=f"PRED-{key}", playerName=card["name"], partition="control", family=c["family"], coach=c["label"],
                       N=float(c["N"]), p=c["registeredP"], age=int(card["age"]), tier=card["tier"], evidence="card-only", rows=rows)
        X = sa.Rows([ev])
        anchor = anchor_for(table, key, card["name"])
        models = {"YG": sa.predict_young_grey(dict(sa.BASE), X, yg)}
        if anchor:
            PA = dict(sa.BASE, logC=sa.BASE["logC"] + anchor["logOffset"])
            gated = PA if int(card["age"]) >= ANCHOR_MIN_AGE else dict(sa.BASE)
            models["YGA"] = sa.predict_young_grey(gated, X, yg)
            models["YGA_ungated"] = sa.predict_young_grey(PA, X, yg)
            models["YGA127"] = sa.predict_young_grey(dict(gated, hW=127.0), X, yg)
        stats = []
        for i, r in enumerate(rows):
            e = dict(stat=r["stat"], start=r["s"], displayClass=r["cls"],
                     registeredAffected=(r["stat"] in c["affected"]) if c["affected"] else None,
                     categoryStat=r["stat"] in (c["affected"] or c["category"]))
            for m, (lo, hi) in models.items():
                e[m] = dict(rawLo=round(float(lo[i]), 4), rawHi=round(float(hi[i]), 4), lo=int(math.floor(lo[i])), hi=int(math.ceil(hi[i])),
                            point=round(float((lo[i] + hi[i]) / 2), 3))
            stats.append(e)
        out.append(dict(key=key, label=c["label"], programme=c["family"], N=c["N"], p=c["registeredP"],
                        affectedSetKnown=c["affected"] is not None, anchor=anchor,
                        anchorApplied=bool(anchor) and int(card["age"]) >= ANCHOR_MIN_AGE, statIntervals=stats))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--build-anchors")
    ap.add_argument("--card")
    ap.add_argument("--out")
    args = ap.parse_args()
    if args.build_anchors:
        build_anchor_table(args.build_anchors)
        return
    table = json.loads(ANCHOR_TABLE.read_text(encoding="utf-8"))
    card = json.loads(pathlib.Path(args.card).read_text(encoding="utf-8"))
    res = dict(schemaVersion="resource-coach-control-predictions-v1", preregistration="PREREG-20260924-YOUNG-GREY-ANCHOR",
               anchorTable=str(ANCHOR_TABLE.relative_to(ROOT)),
               player={k: card[k] for k in ("name", "age", "tier", "roles", "stats", "classes") if k in card},
               coaches=predict_card(card, table))
    pathlib.Path(args.out).write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(card["name"], card["age"], card["tier"])
    for c in res["coaches"]:
        shown = [s for s in c["statIntervals"] if s["categoryStat"]]
        print(f"  {c['key']:16s} " + "  ".join(
            f"{s['stat'][:4]} {s['start']:.0f}{s['displayClass'][0]} YG[{s['YG']['lo']},{s['YG']['hi']}]"
            + (f" YGA[{s['YGA']['lo']},{s['YGA']['hi']}]" if "YGA" in s else "") for s in shown))


if __name__ == "__main__":
    main()
