#!/usr/bin/env python3
"""Research-only low-dose overlay for M**.

This deliberately implements only the observed cell:
  age >= 22, Focused Defending x2, Drill Session, p=2 -> x0.719 dose.

Everything else is exactly M**. This is post-hoc and not a production constant.
"""
from __future__ import annotations

import importlib.util
import json
import math
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CRI = ROOT / "calibration" / "resource-coach-identification"
MODEL_PATH = CRI / "low-dose-interaction-20260925.json"
SHAPE_PATH = CRI / "shape-models-20260924.json"

_spec = importlib.util.spec_from_file_location("shape_models", HERE / "shape_models.py")
sm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sm)

MODEL = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
FACTOR = float(MODEL["overlay"]["factor"])


def dose_scale(age: int, family: str, label: str, N: float, p: int) -> float:
    if (
        int(age) >= 22
        and str(family).upper() == "DRILL SESSION"
        and str(label).upper() == "FOCUSED DEFENDING"
        and abs(float(N) - 2.0) < 1e-9
        and int(p) == 2
    ):
        return FACTOR
    return 1.0


def predict_event(card: dict, coach: dict) -> dict:
    rows = [
        dict(stat=s, s=float(card["stats"][s]), cls=card["classes"][s], g=[0.0, 0.0])
        for s in coach["affectedStats"]
    ]
    ev = sm.sa._event(
        event="LD1-PRED",
        playerName=card["name"],
        partition="research-prediction",
        family=coach["family"],
        coach=coach["label"],
        N=float(coach["N"]),
        p=int(coach["p"]),
        age=int(card["age"]),
        tier=card["tier"],
        evidence="card-only",
        rows=rows,
    )
    X = sm.sa.Rows([ev])
    frozen = sm.load_frozen()["models"]["Mstarstar"]["fitted"]
    P = sm.params(frozen)
    scale = dose_scale(card["age"], coach["family"], coach["label"], coach["N"], coach["p"])
    P["logC"] += math.log(scale)
    yg = sm.sa.young_grey_params()
    lo, hi = sm.predict(P, X, yg)
    out = {}
    for i, r in enumerate(rows):
        out[r["stat"]] = {
            "rawLo": float(lo[i]),
            "rawHi": float(hi[i]),
            "lo": math.floor(float(lo[i])),
            "hi": math.ceil(float(hi[i])),
            "point": float((lo[i] + hi[i]) / 2),
        }
    return {"modelVersion": MODEL["modelVersion"], "doseScale": scale, "stats": out}


if __name__ == "__main__":
    print(json.dumps({"modelVersion": MODEL["modelVersion"], "factor": FACTOR}, indent=2))
