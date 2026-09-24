#!/usr/bin/env python3
"""Shape-refit candidates for PREREG-20260924-SHAPE-FIVE-MODEL (research only, never production).

The young-grey model (YG) with its response-shape constants re-estimated on the admissible pool. Only the named
parameters differ from YG; age bands 8/6/4/2/1, dose N/p, tier offsets, rho and the young-grey term are unchanged.

  M1         refit logC, hW, hG, K
  Mstar      M1 + hWflag: WHITE threshold shift for ages 22-25
  Mstarstar  Mstar + hShiftOld (both thresholds, ages 22+) and KOld (K x exp(KOld), ages 22+)

The fitted constants are frozen in calibration/resource-coach-identification/shape-models-20260924.json.
`--refit` re-derives them from the pool, which must equal the frozen pool (event ids pinned there).

Usage:
  python tools/resource-coach-v2/shape_models.py --refit calibration/resource-coach-identification/shape-models-20260924.json
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pathlib

import numpy as np
from scipy.optimize import minimize

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CRI = ROOT / "calibration" / "resource-coach-identification"
FROZEN_MODELS = CRI / "shape-models-20260924.json"

spec = importlib.util.spec_from_file_location("freeze_young_grey_anchor", HERE / "freeze_young_grey_anchor.py")
fya = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fya)
sa = fya.sa

CONTROL_SLUGS = ["ferguson", "kawa", "rodger", "midgley", "ljdark-leo", "panic", "king-alfie", "andonov", "cieran-morgan", "blakie"]
FREE = {"M1": ["logC", "hW", "hG", "K"],
        "Mstar": ["logC", "hW", "hG", "K", "hWflag"],
        "Mstarstar": ["logC", "hW", "hG", "K", "hWflag", "hShiftOld", "KOld"]}
START = dict(logC=0.33, hW=120.0, hG=105.0, K=35.0, hWflag=0.0, hShiftOld=0.0, KOld=0.0)
EXTRA_ZERO = dict(hWflag=0.0, hShiftOld=0.0, KOld=0.0)


def control_events():
    """The ten 24 Sep control arms, as scored (class corrections applied)."""
    out = []
    for slug in CONTROL_SLUGS:
        card = json.loads((CRI / f"control-card-20260924-{slug}.json").read_text(encoding="utf-8"))
        obs = json.loads((CRI / f"control-observation-20260924-{slug}.json").read_text(encoding="utf-8"))
        for key, iv in obs["statIntervals"].items():
            c = fya.COACHES[key]
            rows = [dict(stat=s, s=float(card["stats"][s]), cls=fya.CLASS_CORRECTIONS.get((card["name"], s), card["classes"][s]),
                         g=[float(v[0]), float(v[1])]) for s, v in iv.items()]
            out.append(sa._event(event=f"CONTROL-{slug}-{key}", playerName=card["name"], partition="control", family=c["family"],
                                 coach=c["label"], N=float(c["N"]), p=len(rows), age=int(card["age"]), tier=card["tier"],
                                 evidence="control-preview", rows=rows))
    return out


def pool():
    """Admissible pool: corpus CAL + x59 (HIST excluded) + the ten control arms."""
    return [e for e in sa.load_events() if not e["hist"]] + control_events()


def pool_digest(events):
    return hashlib.sha256("\n".join(sorted(e["event"] for e in events)).encode()).hexdigest()


def params(extra):
    P = dict(sa.BASE)
    P.update(EXTRA_ZERO)
    P.update(extra)
    return P


def predict(P, X, yg):
    """YG machinery with per-row thresholds and slope. With the extras at zero this is sa.predict_young_grey."""
    u, h, B, rho = sa._parts(P, X)
    old = X.age >= 22
    h = h + P["hShiftOld"] * old + P["hWflag"] * ((X.age >= 22) & (X.age <= 25) & X.w)
    K = P["K"] * np.exp(P["KOld"] * old)
    mask = (~X.w) & (X.age >= yg["ageBand"][0]) & (X.age <= yg["ageBand"][1])
    return (sa.movement_young_grey(u, h, K, B, yg["g"], yg["knot"], mask),
            sa.movement_young_grey(u, h, K, B * rho, yg["g"], yg["knot"], mask))


def fit(free, X, yg):
    def f(v):
        P = params(dict(zip(free, v)))
        if P["K"] <= 1:
            return 1e12
        lo, hi = predict(P, X, yg)
        return float(np.sum((lo - X.lo) ** 2 + (hi - X.hi) ** 2))
    r = minimize(f, [START[k] for k in free], method="Nelder-Mead",
                 options={"maxiter": 8000, "maxfev": 8000, "xatol": 1e-5, "fatol": 1e-6, "adaptive": True})
    r = minimize(f, r.x, method="Nelder-Mead", options={"maxiter": 8000, "maxfev": 8000, "xatol": 1e-6, "fatol": 1e-7, "adaptive": True})
    return {k: float(v) for k, v in zip(free, r.x)}


def load_frozen():
    return json.loads(FROZEN_MODELS.read_text(encoding="utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refit", required=True, help="write the fitted constants here")
    args = ap.parse_args()
    yg = sa.young_grey_params()
    ev = pool()
    X = sa.Rows(ev)
    models = {}
    for name, free in FREE.items():
        fitted = fit(free, X, yg)
        lo, hi = predict(params(fitted), X, yg)
        s = sa.score(lo, hi, X.lo, X.hi)
        models[name] = dict(free=free, fitted=fitted, inSample=dict(midpointMae=s["midpointMae"], pointInsideRate=s["pointInsideRate"]))
        print(name, {k: round(v, 6) for k, v in fitted.items()}, f"in-sample MAE {s['midpointMae']:.4f} inside {s['pointInsideRate']:.4f}")
    out = dict(schemaVersion="resource-coach-shape-models-v1", preregistration="PREREG-20260924-SHAPE-FIVE-MODEL",
               status="research-candidate-not-production",
               base="structure_audit.BASE + young-grey (profiles/resource_coach_structure_candidate_20260924b.json); every "
                    "parameter not listed under `fitted` keeps its YG value",
               fitProcedure="Nelder-Mead on endpoint SSE over both observed bounds of every admissible row (no midpoint), "
                            f"start {START}, two passes as in shape_models.fit",
               pool=dict(events=len(ev), rows=int(len(X.lo)), players=len({e['playerName'] for e in ev}), eventIdSha256=pool_digest(ev),
                         definition="structure_audit.load_events() minus HIST, plus the ten 24 Sep control arms"),
               outOfSample="leave-one-player-out, research note card_only_structural_search / report 'Cross player coach prediction "
                           "model': YG 2.312 / 74.5% inside; M1 1.730 / 82.7%; Mstar 1.475 / 85.0%; Mstarstar 1.437 / 87.4%",
               models=models)
    pathlib.Path(args.refit).write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
