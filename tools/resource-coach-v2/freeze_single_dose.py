#!/usr/bin/env python3
"""PREREG-20260924-SINGLE-DOSE-22PLUS: young-grey alone vs young-grey times one coach-agnostic dose at 22+.

The dose is fixed here and never refitted: the mean per-event log offset of every event aged 22+ in the PINNED
anchor table (anchor-table-20260924-young-grey.json). It was found post hoc in addendum 7 (score 1.427 vs YG
2.463 on King Alfie, Andonov, Morgan); this module freezes exactly that object for a prospective test.

Models (card + coach metadata only):
  YG      frozen model + young-grey term (profile 20260924b)
  SD22    YG with logC + DOSE_LOG, for players aged 22+ (the test arm; eligibility requires 22+)
  YGA     the per-coach anchor from the same table where one exists (comparison only)
  SD22_127 exploratory: SD22 with WHITE threshold 127

Usage:
  python tools/resource-coach-v2/freeze_single_dose.py --card card.json --out predictions.json [--coaches extra.json]

`--coaches` adds coach definitions not in the 24 Sep inventory, as {KEY: {family, label, N, registeredP, affected}}.
Every coach previewed on an eligible player after its prediction file is committed is scored.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import pathlib

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]

spec = importlib.util.spec_from_file_location("freeze_young_grey_anchor", HERE / "freeze_young_grey_anchor.py")
fya = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fya)
sa = fya.sa

PREREG = "PREREG-20260924-SINGLE-DOSE-22PLUS"
ANCHOR_TABLE_SHA256 = "fa9ac4c8f762fd71295f95a0e6c4553f2afb2e2f502764fc74edcfcf35db4f08"
DOSE_MIN_AGE = 22
# exp(DOSE_LOG) = 0.9031. Written as a literal so a rebuilt table cannot move it; the test suite checks that it
# still equals the mean over the pinned table.
DOSE_LOG = -0.1019518947368421
DOSE_EVENTS = 19
# Players whose previews entered the dose, or whose data suggested the model; never eligible for the primary arm.
DOSE_PLAYERS = ["Ryan Rodger", "David Midgley", "LJDark leo", "Mirsad Panic", "Oliver Lerchl", "Vince Németh"]
SUGGESTING_PLAYERS = ["King Alfie", "Plamen Andonov", "Cieran Morgan"]


def dose_from_table(table):
    offs = [e["logOffset"] for c in table["coaches"].values() for e in c["events"] if e["age"] >= DOSE_MIN_AGE]
    return float(np.mean(offs)), len(offs)


def predict_card(card, table, coaches):
    if int(card["age"]) < DOSE_MIN_AGE:
        raise SystemExit(f"{card['name']} is {card['age']}: the single-dose test is for players aged {DOSE_MIN_AGE}+")
    if card["name"] in DOSE_PLAYERS + SUGGESTING_PLAYERS:
        raise SystemExit(f"{card['name']} is not eligible: their previews entered or suggested the dose")
    yg = dict(g=table["youngGrey"]["g"], knot=table["youngGrey"]["knot"], ageBand=tuple(table["youngGrey"]["ageBand"]))
    PD = dict(sa.BASE, logC=sa.BASE["logC"] + DOSE_LOG)
    out = []
    for key, c in coaches.items():
        rows = [dict(stat=s, s=float(card["stats"][s]), cls=card["classes"][s], g=[0.0, 0.0]) for s in fya.OUTFIELD]
        ev = sa._event(event=f"PRED-{key}", playerName=card["name"], partition="control", family=c["family"], coach=c["label"],
                       N=float(c["N"]), p=c["registeredP"], age=int(card["age"]), tier=card["tier"], evidence="card-only", rows=rows)
        X = sa.Rows([ev])
        models = {"YG": sa.predict_young_grey(dict(sa.BASE), X, yg), "SD22": sa.predict_young_grey(PD, X, yg),
                  "SD22_127": sa.predict_young_grey(dict(PD, hW=127.0), X, yg)}
        anchor = fya.anchor_for(table, key, card["name"])
        if anchor:
            models["YGA"] = sa.predict_young_grey(dict(sa.BASE, logC=sa.BASE["logC"] + anchor["logOffset"]), X, yg)
        stats = []
        for i, r in enumerate(rows):
            e = dict(stat=r["stat"], start=r["s"], displayClass=r["cls"],
                     registeredAffected=(r["stat"] in c["affected"]) if c.get("affected") else None,
                     categoryStat=r["stat"] in (c.get("affected") or c.get("category") or []))
            for m, (lo, hi) in models.items():
                e[m] = dict(rawLo=round(float(lo[i]), 4), rawHi=round(float(hi[i]), 4), lo=int(math.floor(lo[i])),
                            hi=int(math.ceil(hi[i])), point=round(float((lo[i] + hi[i]) / 2), 3))
            stats.append(e)
        out.append(dict(key=key, label=c["label"], programme=c["family"], N=c["N"], p=c["registeredP"],
                        affectedSetKnown=bool(c.get("affected")), anchor=anchor, statIntervals=stats))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--card", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--coaches")
    args = ap.parse_args()
    raw = fya.ANCHOR_TABLE.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == ANCHOR_TABLE_SHA256, "anchor table changed since the freeze"
    table = json.loads(raw)
    coaches = dict(fya.COACHES)
    if args.coaches:
        coaches.update(json.loads(pathlib.Path(args.coaches).read_text(encoding="utf-8")))
    card = json.loads(pathlib.Path(args.card).read_text(encoding="utf-8"))
    res = dict(schemaVersion="resource-coach-control-predictions-v1", preregistration=PREREG,
               anchorTable=str(fya.ANCHOR_TABLE.relative_to(ROOT)), doseLog=DOSE_LOG, dose=round(math.exp(DOSE_LOG), 6),
               player={k: card[k] for k in ("name", "age", "tier", "roles", "stats", "classes") if k in card},
               coaches=predict_card(card, table, coaches))
    pathlib.Path(args.out).write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(card["name"], card["age"], card["tier"], f"dose x{math.exp(DOSE_LOG):.4f}")
    for c in res["coaches"]:
        shown = [s for s in c["statIntervals"] if s["categoryStat"]]
        print(f"  {c['key']:16s} " + "  ".join(
            f"{s['stat'][:4]} {s['start']:.0f}{s['displayClass'][0]} YG[{s['YG']['lo']},{s['YG']['hi']}] SD[{s['SD22']['lo']},{s['SD22']['hi']}]"
            for s in shown))


if __name__ == "__main__":
    main()
