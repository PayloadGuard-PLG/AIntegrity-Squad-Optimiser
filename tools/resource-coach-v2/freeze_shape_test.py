#!/usr/bin/env python3
"""PREREG-20260924-SHAPE-FIVE-MODEL: card-only predictions from the five frozen models for one player card.

  YG         frozen model + young-grey (profile 20260924b)
  SD22       YG x exp(DOSE_LOG) for ages 22+ (PREREG-20260924-SINGLE-DOSE-22PLUS); equals YG below 22
  M1         shape refit (logC, hW, hG, K)                        } constants frozen in
  Mstar      M1 + WHITE threshold shift for ages 22-25            } shape-models-20260924.json
  Mstarstar  Mstar + ages-22+ threshold shift and slope (exploratory)

No anchor, no training-rate input, and nothing from any preview enters a prediction. Arms:
  primary    outfield players aged 18-32 who are not in the 30-player fitting pool
  secondary  Ryan Blakie, Willie Ferguson, Michal Kawa once aged 22 (their age-21 rows trained the shape models)
Every other pool player is refused.

Usage:
  python tools/resource-coach-v2/freeze_shape_test.py --card card.json --out predictions.json [--coaches extra.json]
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sm = _load("shape_models", "shape_models.py")
fsd = _load("freeze_single_dose", "freeze_single_dose.py")
sa, fya = sm.sa, sm.fya

PREREG = "PREREG-20260924-SHAPE-FIVE-MODEL"
SHAPE_MODELS_SHA256 = "5d35ff4050054181f68401050214c607899ab437094135687c02fc971a7b83ef"
MODELS = ("YG", "SD22", "M1", "Mstar", "Mstarstar")
SECONDARY = {"Ryan Blakie", "Willie Ferguson", "Michal Kawa"}
POOL_PLAYERS = {
    "Bryan Baxter", "Cieran Morgan", "Cptn Dallas", "Darren Moore", "David Midgley", "G Neri", "Garry McCluskey", "Kevin Mehlem",
    "King Alfie", "LJ Galileo", "LJDark leo", "Lt Ripley", "Mark Lurinsky", "Michal Kawa", "Mirsad Panic", "Oliver Lerchl",
    "Paul Watson", "Plamen Andonov", "Robert Gavilán", "Ross Ritchie", "Russell Diamond", "Ryan Blakie", "Ryan Gilmartin",
    "Ryan Rodger", "S DarkVader", "SD Faye", "Scott Ritchie", "Vince Németh", "Willie Ferguson", "Willie Howden",
}


def arm_for(card):
    age = int(card["age"])
    if not 18 <= age <= 32:
        raise SystemExit(f"{card['name']} is {age}: the models cover ages 18-32")
    if card["name"] in SECONDARY:
        if age < 22:
            raise SystemExit(f"{card['name']} is {age}: the secondary arm starts at 22 (after the S215 rollover)")
        return "secondary"
    if card["name"] in POOL_PLAYERS:
        raise SystemExit(f"{card['name']} is in the fitting pool and is not eligible")
    return "primary"


def frozen_params():
    raw = sm.FROZEN_MODELS.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == SHAPE_MODELS_SHA256, "shape-models file changed since the freeze"
    fz = json.loads(raw)
    return {name: sm.params(m["fitted"]) for name, m in fz["models"].items()}


def predict_card(card, coaches):
    arm = arm_for(card)
    yg = sa.young_grey_params()
    shape = frozen_params()
    base = sm.params({})
    sd22 = dict(base, logC=base["logC"] + (fsd.DOSE_LOG if int(card["age"]) >= fsd.DOSE_MIN_AGE else 0.0))
    P = dict(YG=base, SD22=sd22, **shape)
    out = []
    for key, c in coaches.items():
        rows = [dict(stat=s, s=float(card["stats"][s]), cls=card["classes"][s], g=[0.0, 0.0]) for s in fya.OUTFIELD]
        ev = sa._event(event=f"PRED-{key}", playerName=card["name"], partition="control", family=c["family"], coach=c["label"],
                       N=float(c["N"]), p=c["registeredP"], age=int(card["age"]), tier=card["tier"], evidence="card-only", rows=rows)
        X = sa.Rows([ev])
        preds = {m: sm.predict(P[m], X, yg) for m in MODELS}
        stats = []
        for i, r in enumerate(rows):
            e = dict(stat=r["stat"], start=r["s"], displayClass=r["cls"],
                     registeredAffected=(r["stat"] in c["affected"]) if c.get("affected") else None,
                     categoryStat=r["stat"] in (c.get("affected") or c.get("category") or []))
            for m, (lo, hi) in preds.items():
                e[m] = dict(rawLo=round(float(lo[i]), 4), rawHi=round(float(hi[i]), 4), lo=int(math.floor(lo[i])),
                            hi=int(math.ceil(hi[i])), point=round(float((lo[i] + hi[i]) / 2), 3))
            stats.append(e)
        out.append(dict(key=key, label=c["label"], programme=c["family"], N=c["N"], p=c["registeredP"],
                        affectedSetKnown=bool(c.get("affected")), statIntervals=stats))
    return arm, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--card", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--coaches")
    args = ap.parse_args()
    coaches = dict(fya.COACHES)
    if args.coaches:
        coaches.update(json.loads(pathlib.Path(args.coaches).read_text(encoding="utf-8")))
    card = json.loads(pathlib.Path(args.card).read_text(encoding="utf-8"))
    arm, preds = predict_card(card, coaches)
    res = dict(schemaVersion="resource-coach-control-predictions-v1", preregistration=PREREG, arm=arm,
               shapeModels=str(sm.FROZEN_MODELS.relative_to(ROOT)), sd22DoseLog=fsd.DOSE_LOG,
               player={k: card[k] for k in ("name", "age", "tier", "roles", "stats", "classes") if k in card}, coaches=preds)
    pathlib.Path(args.out).write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(card["name"], card["age"], card["tier"], arm)
    for c in res["coaches"]:
        shown = [s for s in c["statIntervals"] if s["categoryStat"]]
        print(f"  {c['key']:16s} " + "  ".join(
            f"{s['stat'][:4]} {s['start']:.0f}{s['displayClass'][0]} YG[{s['YG']['lo']},{s['YG']['hi']}] M*[{s['Mstar']['lo']},{s['Mstar']['hi']}]"
            for s in shown))


if __name__ == "__main__":
    main()
