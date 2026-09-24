#!/usr/bin/env python3
"""Supplementary, reproducible dose, tier, period and allocation diagnostics."""
import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

import mechanism_search_20260924 as ms

sm, sa = ms.sm, ms.sa


def dose_fit(events, extra):
    X = sa.Rows(events)
    keys = ["logC", "hW", "hG", "K"] + ([extra] if extra else [])
    start = [.325, 120., 106., 36.] + ([1.] if extra else [])
    lower = [-2., 60., 40., 5.] + ([.2] if extra else [])
    upper = [2., 180., 160., 100.] + ([1.8] if extra else [])
    yg = sa.young_grey_params()

    def residual(v):
        P = dict(sa.BASE, **dict(zip(keys, v)))
        lo, hi = sa.predict_young_grey(P, X, yg)
        return np.r_[lo-X.lo, hi-X.hi]

    fit = least_squares(residual, start, bounds=(lower, upper), max_nfev=120,
                        xtol=1e-5, ftol=1e-5, gtol=1e-5)
    return dict(sa.BASE, **dict(zip(keys, fit.x)))


def dose_cv(events, extra):
    fit_all = dose_fit(events, extra)
    PRED, OBS = [], []
    for player in sorted({e["playerName"] for e in events}):
        tr = [e for e in events if e["playerName"] != player]
        X = sa.Rows([e for e in events if e["playerName"] == player])
        P = dose_fit(tr, extra)
        lo, hi = sa.predict_young_grey(P, X, sa.young_grey_params())
        PRED.extend(zip(lo, hi)); OBS.extend(zip(X.lo, X.hi))
    pred, obs = np.array(PRED), np.array(OBS)
    mid = pred.mean(axis=1)
    return dict(exponent=fit_all.get(extra, 1.) if extra else None,
                midpointMae=float(np.mean(abs(mid-obs.mean(axis=1)))),
                inside=float(np.mean((mid >= obs[:,0]) & (mid <= obs[:,1]))))


def period(events):
    old = [e for e in events if e["partition"] != "control"]
    new = [e for e in events if e["partition"] == "control"]
    result = {}
    for train, test, label in ((old, new, "older_to_controls"), (new, old, "controls_to_older")):
        result[label] = {}
        for name in ("M1", "Mstar", "Mstarstar"):
            P = sm.params(sm.fit(sm.FREE[name], sa.Rows(train), sa.young_grey_params()))
            X = sa.Rows(test)
            pred = sm.predict(P, X, sa.young_grey_params())
            result[label][name] = dict(mae=sa.score(*pred, X.lo, X.hi)["midpointMae"],
                                       inside=sa.score(*pred, X.lo, X.hi)["pointInsideRate"],
                                       ageShift=P["hWflag"])
    return result


def allocation(events):
    fitted = sm.load_frozen()["models"]["M1"]["fitted"]
    hw, hg, K, rho = fitted["hW"], fitted["hG"], fitted["K"], 1.5

    def exposure(x, h):
        return x if x <= h else h + K*math.expm1((x-h)/K)

    ratios = []
    for e in events:
        by_class = {"WHITE": [], "MID_GREY": []}
        for r in e["rows"]:
            if e["age"] <= 21 and r["cls"] != "WHITE":
                continue  # Young-grey knot needs a separate inverse.
            u = r["s"] - (sa.DELTA[int(e["tier"][1:])] if r["cls"] == "WHITE" else 0)
            if u < 0 or r["g"][0] < 2:
                continue
            h = hw if r["cls"] == "WHITE" else hg
            low, high = r["g"]
            implied = ((exposure(u+low,h)-exposure(u,h)) +
                       (exposure(u+high,h)-exposure(u,h))/rho)/2
            by_class[r["cls"]].append(implied)
        if by_class["WHITE"] and by_class["MID_GREY"]:
            ratios.append(dict(event=e["event"],tier=e["tier"],
                               greyWhite=float(np.median(by_class["MID_GREY"])/
                                               np.median(by_class["WHITE"]))))
    return ratios


def main():
    events = sm.pool()
    if sm.pool_digest(events) != sm.load_frozen()["pool"]["eventIdSha256"]:
        raise RuntimeError("Pinned pool changed")
    result = dict(poolSha256=sm.pool_digest(events), dose={str(x):dose_cv(events,x) for x in (None,"q","eta")},
                  tier={str(lam):ms.evaluate(events,"hard",dict(rho=1.5,tier_scale=lam))["summary"]
                        for lam in (0.,.8,1.,1.2)},
                  period=period(events), impliedAllocation=allocation(events))
    Path(sys.argv[1]).write_text(json.dumps(result,indent=2)+"\n")
    print("Supplementary checks complete")


if __name__ == "__main__":
    main()
