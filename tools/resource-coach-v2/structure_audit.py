#!/usr/bin/env python3
"""Structural identification audit for the ordinary Resource Coach predictor.

Question: what structural variable, transformation, allocation law, programme law or
response function is missing from the frozen direct model

    u = s - Delta(T) * [WHITE]
    B_lo = C * A(age) * N / p,  B_hi = rho * B_lo
    gain = flat-to-exponential latent movement (class thresholds h_W, h_G; scale K), rectified at 0

This script does not tune the frozen profile. It tests one structural hypothesis at a time
against the frozen baseline using explicitly declared partitions:

  CAL   every complete ordinary preview except the canonical-workbook "Ordinary Coach"
        records (HIST, tested separately for admissibility) and the frozen 24 Sep x59 test;
  X59   the four frozen prospective Skill Seminar x59 previews (never fitted here);
  HIST  canonical-workbook ORDINARY COACH records (scored, never fitted).

Observed intervals are used only as answer keys in the direct tests. Two diagnostic
stages deliberately free per-event budgets (geometry) or per-event dose offsets (dose
table); those are mechanism diagnostics, never predictors.

Requires numpy and scipy. Deterministic: fixed starts, fixed permutation seed.
"""
from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import math
import pathlib
import sys

import numpy as np
from scipy.optimize import linprog, minimize, minimize_scalar
from scipy.sparse import lil_matrix

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CRI = ROOT / "calibration" / "resource-coach-identification"
FROZEN_PROFILE = ROOT / "profiles" / "resource_coach_current_replay_20260923.json"
CANDIDATE_PROFILE = ROOT / "profiles" / "resource_coach_structure_candidate_20260924.json"   # N-1; falsified (Ferguson x5)
YOUNG_GREY_PROFILE = ROOT / "profiles" / "resource_coach_structure_candidate_20260924b.json"  # current research candidate

_spec = importlib.util.spec_from_file_location("direct_replay", HERE / "direct_player_card_validation.py")
dv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dv)

FROZEN = json.loads(FROZEN_PROFILE.read_text(encoding="utf-8"))
DELTA = np.array(FROZEN["tierAdditions"], float)
BANDS = [(b["minAge"], b["maxAge"], float(b["scale"])) for b in FROZEN["ageScaleBands"]]
FAMILY_CODE = {"TRAINING CAMP": "TC", "DRILL SESSION": "DS", "SKILL SEMINAR": "SS", "ORDINARY COACH": "OC"}

# 21 Sep prospective previews carry no tier. Tier is recovered only where a card of the same
# player at the same age exists and the affected starting stats agree within one point.
RECOVERED_TIER = {"Mark Lurinsky": "T0", "Darren Moore": "T3", "S DarkVader": "T6"}


# --------------------------------------------------------------------------------------
# Evidence assembly
# --------------------------------------------------------------------------------------

def _shape(label: str) -> str:
    label = label.upper()
    for s in ("STANDARD", "FOCUSED", "EXTENSIVE"):
        if s in label:
            return s[0]
    return "?"


def _event(**kw):
    kw["fam"] = FAMILY_CODE.get(kw["family"], "UN")
    kw["shape"] = _shape(kw["coach"])
    kw["hist"] = kw["partition"] == "canonical-workbook" and kw["fam"] == "OC"
    kw["coachId"] = (kw["fam"], kw["coach"].upper(), int(kw["N"]), int(kw["p"]),
                     tuple(sorted(r["stat"] for r in kw["rows"])))
    return kw


def load_events() -> list[dict]:
    a, _ = dv.load_archive_rows()
    c, _ = dv.load_chat_rows()
    k, _ = dv.load_canonical_rows()
    g, _ = dv.load_live_gilmartin_rows()
    events = []
    for e in dv.build_events(a + c + k + g):
        events.append(_event(event=e["event"], playerName=e["playerName"], partition=e["partition"],
                             family=e["family"], coach=e["coach"], N=float(e["N"]), p=int(e["p"]),
                             age=int(e["age"]), tier=e["tier"], evidence=e["evidenceGrade"],
                             rows=[dict(stat=r["stat"], s=float(r["s"]), cls=r["cls"], g=list(r["g"])) for r in e["rows"]]))
    x = json.loads((CRI / "prospective-input-20260924-standard-safeguard-x59-skill.json").read_text(encoding="utf-8"))
    for t in x["tests"]:
        p = t["player"]
        rows = [dict(stat=s["stat"], s=float(s["start"]), cls=s["displayClass"],
                     g=[float(v) for v in t["observed"]["statIntervals"][s["stat"]]],
                     frozen=(s["prediction"]["rawLo"], s["prediction"]["rawHi"]),
                     frozenDisplay=(s["prediction"]["lo"], s["prediction"]["hi"]))
                for s in t["frozenPrediction"]["statIntervals"]]
        events.append(_event(event=t["testId"], playerName=p["name"], partition="prospective-x59", family="SKILL SEMINAR",
                             coach=t["coach"]["label"], N=float(t["coach"]["multiplier"]), p=int(t["coach"]["affectedStatCount"]),
                             age=int(p["age"]), tier=p["tier"], evidence="prospective-frozen", rows=rows))
    lerchl = json.loads((CRI / "live-preview-20260923-lerchl-offensive-x10.json").read_text(encoding="utf-8"))
    events.append(_event(event="LERCHL-STD-OFF-X10-DRILL", playerName="Oliver Lerchl", partition="live-lerchl",
                         family="DRILL SESSION", coach="Standard Offensive", N=10.0, p=4, age=25, tier="T0",
                         evidence="live-screenshot-transcription",
                         rows=[dict(stat=k, s=float(v["start"]), cls=v["class"], g=[float(z) for z in v["gain"]])
                               for k, v in lerchl["actual"].items() if k != "OVR"]))
    mark = json.loads((CRI / "live-preview-20260923-lurinsky-offensive-x10.json").read_text(encoding="utf-8"))
    mark_cls = {"CROSSING": "MID_GREY", "SHOOTING": "WHITE", "SPEED": "WHITE", "CREATIVITY": "WHITE"}
    events.append(_event(event="LURINSKY-STD-OFF-X10-DRILL", playerName="Mark Lurinsky", partition="live-lurinsky",
                         family="DRILL SESSION", coach="Standard Offensive", N=10.0, p=4, age=18, tier="T0",
                         evidence="live-screenshot-transcription",
                         rows=[dict(stat=k, s=float(mark["displayedStart"][k]), cls=mark_cls[k], g=[float(z) for z in v])
                               for k, v in mark["actualGains"].items() if k != "OVR"]))
    pros = json.loads((CRI / "prospective-evidence-20260921.json").read_text(encoding="utf-8"))
    fam = {"Skill Seminar": "SKILL SEMINAR", "Drill Session": "DRILL SESSION"}
    for pv in pros["previews"]:
        # Reward is not ordinary; MARK-DRILL-X10 is the same preview as the live Lurinsky x10 record;
        # King Alfie has neither tier nor display class.
        if pv["family"] == "Reward" or pv["name"] not in RECOVERED_TIER or pv["id"] == "MARK-DRILL-X10":
            continue
        events.append(_event(event=pv["id"], playerName=pv["name"], partition="prospective-0921",
                             family=fam.get(pv["family"], "UNSPECIFIED"), coach=pv["coach"], N=float(pv["N"]), p=int(pv["p"]),
                             age=int(pv["age"]), tier=RECOVERED_TIER[pv["name"]], evidence="doc-transcription-tier-recovered",
                             rows=[dict(stat=s["stat"], s=float(s["s"]), cls=s["cls"], g=[float(z) for z in s["actual"]])
                                   for s in pv["stats"] if s["cls"]]))
    return events


# --------------------------------------------------------------------------------------
# Vectorised model
# --------------------------------------------------------------------------------------

def band_index(age: int) -> int:
    for i, (lo, hi, _) in enumerate(BANDS):
        if lo <= age <= hi:
            return i
    raise ValueError(age)


BASE = dict(
    logC=math.log(FROZEN["dose"]["globalAmplitude"]), hW=FROZEN["response"]["whiteThreshold"],
    hG=FROZEN["response"]["midGreyThreshold"], K=FROZEN["response"]["K"], logRho=math.log(FROZEN["response"]["upperDoseRatio"]),
    **{f"a{i}": math.log(BANDS[i][2] / BANDS[0][2]) for i in range(1, len(BANDS))},
    N0=0.0, q=1.0, eta=1.0, fDS=0.0, fSS=0.0, sF=0.0, sE=0.0, kappa=0.0, beta=0.0, gAll=1.0, ageElast=1.0,
    smoothAge=0.0, sm0=0.0, sm1=0.0,
)


class Rows:
    def __init__(self, events):
        R = [(e, r) for e in events for r in e["rows"]]
        self.events = events
        self.s = np.array([r["s"] for _, r in R], float)
        self.w = np.array([r["cls"] == "WHITE" for _, r in R])
        self.t = np.array([int(str(e["tier"])[1]) for e, _ in R], int)
        self.delta = DELTA[self.t]
        self.bi = np.array([band_index(e["age"]) for e, _ in R], int)
        self.age = np.array([e["age"] for e, _ in R], float)
        self.N = np.array([e["N"] for e, _ in R], float)
        self.p = np.array([e["p"] for e, _ in R], float)
        self.DS = np.array([e["fam"] == "DS" for e, _ in R])
        self.SS = np.array([e["fam"] == "SS" for e, _ in R])
        self.F = np.array([e["shape"] == "F" for e, _ in R])
        self.E = np.array([e["shape"] == "E" for e, _ in R])
        self.lo = np.array([r["g"][0] for _, r in R], float)
        self.hi = np.array([r["g"][1] for _, r in R], float)


def movement(u, h, K, B):
    """Flat unit cost below h, exp((x-h)/K) above; rectified visible gain."""
    B = np.maximum(B, 0.0)
    flat = np.maximum(h - u, 0.0)
    below = np.where(B <= flat, B, flat + K * np.log1p(np.maximum(B - flat, 0.0) / K))
    above = K * np.log1p(B / (K * np.exp(np.clip((u - h) / K, -50, 50))))
    m = np.where(u < h, below, above)
    return np.maximum(0.0, u + m) - np.maximum(0.0, u)


def log_age(P, X):
    if P["smoothAge"]:
        return math.log(BANDS[0][2]) + P["sm0"] * (X.age - 19.5) + P["sm1"] * np.maximum(X.age - 25.0, 0.0)
    off = np.array([0.0] + [P[f"a{i}"] for i in range(1, len(BANDS))])
    return math.log(BANDS[0][2]) + P["ageElast"] * off[X.bi]


def _parts(P, X):
    la = log_age(P, X)
    dose = np.maximum(X.N - P["N0"], 1e-9) ** P["q"] / X.p ** P["eta"]
    B = np.exp(P["logC"] + la + np.log(dose) + P["fDS"] * X.DS + P["fSS"] * X.SS + P["sF"] * X.F + P["sE"] * X.E)
    u = X.s - np.where(X.w, X.delta, 0.0)
    h = np.where(X.w, P["hW"], P["hG"]) - P["K"] * P["kappa"] * (la - math.log(BANDS[0][2]))
    gw = np.where(X.w, 1.0, P["gAll"] / (1.0 + P["beta"] * X.delta / 100.0))
    return u, h, B * gw, math.exp(P["logRho"])


def predict(P, X):
    u, h, B, rho = _parts(P, X)
    return movement(u, h, P["K"], B), movement(u, h, P["K"], B * rho)


def young_grey_params(path=YOUNG_GREY_PROFILE):
    c = json.loads(path.read_text(encoding="utf-8"))
    q = c["structuralChange"]["parameters"]
    return dict(modelVersion=c["modelVersion"], g=float(q["g"]), knot=float(q["knotDisplayed"]), ageBand=tuple(q["ageBand"]))


def movement_young_grey(u, h, K, B, g, knot, mask):
    """movement() with marginal cost g below `knot` on the masked rows (cost g, then 1 up to h, then exponential)."""
    base = movement(u, h, K, B)
    B = np.maximum(B, 0.0)
    seg = np.maximum(knot - u, 0.0) * g
    alt = np.where(B <= seg, B / g, np.maximum(knot - u, 0.0) + movement(np.maximum(u, knot), h, K, np.maximum(B - seg, 0.0)))
    return np.where(mask, alt, base)


def predict_young_grey(P, X, yg):
    """Frozen model plus the young-grey term: MID_GREY rows of players inside the age band cost g below the knot."""
    u, h, B, rho = _parts(P, X)
    mask = (~X.w) & (X.age >= yg["ageBand"][0]) & (X.age <= yg["ageBand"][1])
    return (movement_young_grey(u, h, P["K"], B, yg["g"], yg["knot"], mask),
            movement_young_grey(u, h, P["K"], B * rho, yg["g"], yg["knot"], mask))


def metrics_young_grey(P, events, yg):
    X = Rows(events)
    lo, hi = predict_young_grey(P, X, yg)
    return score(lo, hi, X.lo, X.hi)


def sse(P, X):
    lo, hi = predict(P, X)
    return float(np.sum((lo - X.lo) ** 2 + (hi - X.hi) ** 2))


def fit(free, X, start=None):
    start = dict(start or BASE)
    if not free:
        return start
    def f(x):
        P = dict(start); P.update(zip(free, x)); return sse(P, X)
    r = minimize(f, [start[k] for k in free], method="Nelder-Mead",
                 options={"maxiter": 20000, "maxfev": 20000, "xatol": 1e-6, "fatol": 1e-7, "adaptive": True})
    r = minimize(f, r.x, method="Nelder-Mead",
                 options={"maxiter": 20000, "maxfev": 20000, "xatol": 1e-7, "fatol": 1e-8, "adaptive": True})
    P = dict(start); P.update(zip(free, r.x)); return P


def score(lo, hi, ol, oh):
    pm, om = (lo + hi) / 2, (ol + oh) / 2
    inter = np.maximum(0.0, np.minimum(hi, oh) - np.maximum(lo, ol))
    union = np.maximum(hi, oh) - np.minimum(lo, ol)
    iou = np.where(union == 0, 1.0, inter / np.where(union == 0, 1.0, union))
    return dict(n=int(len(lo)), midpointMae=float(np.mean(np.abs(pm - om))),
                pointInsideRate=float(np.mean((ol <= pm) & (pm <= oh))),
                overlapRate=float(np.mean(np.maximum(lo, ol) <= np.minimum(hi, oh))),
                endpointMae=float(np.mean((np.abs(lo - ol) + np.abs(hi - oh)) / 2)),
                signedResidual=float(np.mean(pm - om)), meanIoU=float(np.mean(iou)))


def metrics(P, events):
    X = Rows(events)
    lo, hi = predict(P, X)
    return score(lo, hi, X.lo, X.hi)


def grouped_cv(free, events, key, start=None):
    LO, HI, OL, OH = [], [], [], []
    for g in sorted({str(e[key]) for e in events}):
        tr = [e for e in events if str(e[key]) != g]
        te = Rows([e for e in events if str(e[key]) == g])
        P = fit(free, Rows(tr), start)
        lo, hi = predict(P, te)
        LO += list(lo); HI += list(hi); OL += list(te.lo); OH += list(te.hi)
    return score(*(np.array(v) for v in (LO, HI, OL, OH)))


def budget_offset(P, events):
    """Per-event dose offset d (log scale) minimising endpoint SSE. Diagnostic only."""
    X = Rows(events)
    return float(minimize_scalar(lambda d: sse(dict(P, logC=P["logC"] + d), X), bounds=(-3, 3), method="bounded",
                                 options={"xatol": 1e-7}).x)


# --------------------------------------------------------------------------------------
# Stage A: response geometry with free per-event budgets
# --------------------------------------------------------------------------------------

def event_geometry_sse(fn, e):
    s = np.array([r["s"] for r in e["rows"]]); w = np.array([r["cls"] == "WHITE" for r in e["rows"]])
    lo = np.array([r["g"][0] for r in e["rows"]]); hi = np.array([r["g"][1] for r in e["rows"]])
    t = int(str(e["tier"])[1]); A = dict((i, b[2]) for i, b in enumerate(BANDS))[band_index(e["age"])]
    total = 0.0; budgets = []
    for obs in (lo, hi):
        r = minimize_scalar(lambda lb: float(np.sum((fn(s, w, t, A, math.exp(lb)) - obs) ** 2)),
                            bounds=(-3, 9), method="bounded", options={"xatol": 1e-6})
        total += r.fun; budgets.append(math.exp(r.x))
    return total, budgets


def geometry_model(kind, th):
    hW, hG, K = th[:3]
    def base(u, w, B, hw=hW, hg=hG, k=K):
        return movement(u, np.where(w, hw, hg), k, B)
    if kind == "frozen-shape":
        return lambda s, w, t, A, B: base(s - np.where(w, DELTA[t], 0), w, B)
    if kind == "no-tier-subtraction":
        return lambda s, w, t, A, B: base(s, w, B)
    if kind == "pure-exponential":
        return lambda s, w, t, A, B: np.maximum(0, (s - np.where(w, DELTA[t], 0))) * 0 + K * np.log1p(
            B / (K * np.exp((s - np.where(w, DELTA[t], 0) - np.where(w, hW, hG)) / K)))
    if kind == "class-specific-K":
        KG = th[3]
        return lambda s, w, t, A, B: np.where(w, movement(s - DELTA[t], hW, K, B), movement(s, hG, KG, B))
    if kind == "universal-grey-weight":
        return lambda s, w, t, A, B: base(s - np.where(w, DELTA[t], 0), w, B * np.where(w, 1.0, th[3]))
    if kind == "tiered-grey-weight":
        return lambda s, w, t, A, B: base(s - np.where(w, DELTA[t], 0), w, B * np.where(w, 1.0, th[3] if t > 0 else 1.0))
    if kind == "tier-graded-grey-weight":
        return lambda s, w, t, A, B: base(s - np.where(w, DELTA[t], 0), w, B * np.where(w, 1.0, 1.0 / (1 + th[3] * DELTA[t] / 100)))
    if kind == "tier-offset-scale":
        return lambda s, w, t, A, B: base(s - np.where(w, th[3] * DELTA[t], 0), w, B)
    if kind == "age-threshold-coupling":
        return lambda s, w, t, A, B: movement(s - np.where(w, DELTA[t], 0), np.where(w, hW, hG) - K * th[3] * math.log(A / BANDS[0][2]), K, B)
    raise ValueError(kind)


GEOMETRY_SPECS = {
    "frozen-shape": [132.6, 120.1, 26.05],
    "no-tier-subtraction": [132.6, 120.1, 26.05],
    "pure-exponential": [132.6, 120.1, 26.05],
    "class-specific-K": [132.6, 120.1, 26.05, 26.05],
    "universal-grey-weight": [132.6, 120.1, 26.05, 0.9],
    "tiered-grey-weight": [132.6, 120.1, 26.05, 0.8],
    "tier-graded-grey-weight": [132.6, 120.1, 26.05, 0.5],
    "tier-offset-scale": [132.6, 120.1, 26.05, 1.0],
    "age-threshold-coupling": [132.6, 120.1, 26.05, 0.5],
}


def geometry_ladder(cal, x59):
    cal = [e for e in cal if len(e["rows"]) >= 2]
    x59 = [e for e in x59 if len(e["rows"]) >= 2]
    n_cal = 2 * sum(len(e["rows"]) for e in cal); n_x = 2 * sum(len(e["rows"]) for e in x59)
    out = {}
    for kind, x0 in GEOMETRY_SPECS.items():
        loss = lambda th, evs: sum(event_geometry_sse(geometry_model(kind, th), e)[0] for e in evs)
        start = loss(x0, cal)
        r = minimize(lambda th: loss(th, cal), x0, method="Nelder-Mead", options={"maxiter": 600, "xatol": 1e-3, "fatol": 1e-3})
        out[kind] = dict(startRmse=math.sqrt(start / n_cal), fittedRmse=math.sqrt(r.fun / n_cal),
                         x59Rmse=math.sqrt(loss(r.x, x59) / n_x), params=[float(v) for v in r.x])
    return out


# --------------------------------------------------------------------------------------
# Nonparametric monotone-cost admissibility LP
# --------------------------------------------------------------------------------------

LP_LO, LP_HI = -200, 460


def _integral_row(a, b):
    nb = LP_HI - LP_LO
    v = np.zeros(nb)
    a = max(a, LP_LO); b = min(b, LP_HI)
    if b <= a:
        return v
    for k in range(int(math.floor(a)) - LP_LO, min(int(math.floor(b)) - LP_LO, nb - 1) + 1):
        left = max(a, k + LP_LO); right = min(b, k + LP_LO + 1)
        if right > left:
            v[k] += right - left
    return v


def monotone_cost_lp(events, tol):
    """Min total L1 budget slack s.t. non-decreasing c_W, c_G >= 1 and equal per-stat budget per event."""
    nb = LP_HI - LP_LO; nc = 2 * nb; ne = len(events)
    cons = []
    for ei, e in enumerate(events):
        t = int(str(e["tier"])[1])
        for r in e["rows"]:
            white = r["cls"] == "WHITE"
            x = r["s"] - (DELTA[t] if white else 0.0)
            off = 0 if white else nb
            base = max(x, 0.0)
            for which, g in enumerate(r["g"]):
                if g - tol > 0 or x >= 0:
                    v = np.zeros(nc); v[off:off + nb] = _integral_row(x, base + max(g - tol, 0.0))
                    cons.append((v, 2 * ei + which, +1, ei))
                v = np.zeros(nc); v[off:off + nb] = _integral_row(x, base + g + tol)
                cons.append((v, 2 * ei + which, -1, ei))
    nr = len(cons); nv = nc + 2 * ne + nr
    A = lil_matrix((nr + 2 * (nb - 1), nv))
    for i, (v, bidx, sense, _) in enumerate(cons):
        for k in np.nonzero(v)[0]:
            A[i, k] = sense * v[k]
        A[i, nc + bidx] = -sense
        A[i, nc + 2 * ne + i] = -1.0
    i = nr
    for o in (0, nb):
        for k in range(nb - 1):
            A[i, o + k] = 1.0; A[i, o + k + 1] = -1.0; i += 1
    cost = np.zeros(nv); cost[nc + 2 * ne:] = 1.0
    bounds = [(1.0, None)] * nc + [(0, None)] * (2 * ne + nr)
    res = linprog(cost, A_ub=A.tocsr(), b_ub=np.zeros(A.shape[0]), bounds=bounds, method="highs")
    per = np.zeros(ne)
    for s, (_, _, _, ei) in zip(res.x[nc + 2 * ne:], cons):
        per[ei] += s
    return float(res.fun), per


# --------------------------------------------------------------------------------------
# Budget inversion helpers for matched controls
# --------------------------------------------------------------------------------------

def invert_budget(u, g, h, K):
    """Budget needed to move from u by visible gain g (u >= 0) under the frozen response shape."""
    if u + g <= h:
        return g
    if u < h:
        return (h - u) + K * (math.exp((u + g - h) / K) - 1.0)
    return K * math.exp((u - h) / K) * (math.exp(g / K) - 1.0)


def ratio_bounds(num, den, tol=0.5, flat=False, h=None, K=None):
    """Admissible budget ratio num/den from displayed endpoints (u, g) with +/-tol display tolerance."""
    def rng(u, g):
        lo_g, hi_g = max(g - tol, 0.0), g + tol
        if flat:
            return lo_g, hi_g
        return invert_budget(u, lo_g, h, K), invert_budget(u, hi_g, h, K)
    a, b = rng(*num); c, d = rng(*den)
    return a / d, b / c


# --------------------------------------------------------------------------------------
# Audit
# --------------------------------------------------------------------------------------

DIRECT_SPECS = {
    "frozen": None,
    "refit-same-structure": ["logC", "hW", "hG", "K", "logRho"],
    "+affine-multiplier-N0": ["logC", "hW", "hG", "K", "logRho", "N0"],
    "+multiplier-power-q": ["logC", "hW", "hG", "K", "logRho", "q"],
    "+count-power-eta": ["logC", "hW", "hG", "K", "logRho", "eta"],
    "+programme-family": ["logC", "hW", "hG", "K", "logRho", "fDS", "fSS"],
    "+coach-shape": ["logC", "hW", "hG", "K", "logRho", "sF", "sE"],
    "+age-elasticity": ["logC", "hW", "hG", "K", "logRho", "ageElast"],
    "+smooth-age-law": ["logC", "hW", "hG", "K", "logRho", "smoothAge", "sm0", "sm1"],
    "+age-threshold-coupling": ["logC", "hW", "hG", "K", "logRho", "kappa"],
    "+tier-graded-grey-weight": ["logC", "hW", "hG", "K", "logRho", "beta"],
    "+universal-grey-weight": ["logC", "hW", "hG", "K", "logRho", "gAll"],
    "frozen-response,C-only": ["logC"],
    "frozen-response,C,N0=1(a priori)": ["logC"],
}
SPEC_START = {
    "+smooth-age-law": dict(BASE, smoothAge=1.0, sm0=-0.05, sm1=-0.1),
    "frozen-response,C,N0=1(a priori)": dict(BASE, N0=1.0),
}


def run(args):
    events = load_events()
    cal = [e for e in events if not e["hist"] and e["partition"] != "prospective-x59"]
    x59 = [e for e in events if e["partition"] == "prospective-x59"]
    hist = [e for e in events if e["hist"]]
    out = {"schemaVersion": "resource-coach-structure-audit-v1", "frozenProfile": str(FROZEN_PROFILE.relative_to(ROOT)),
           "partitions": {name: dict(events=len(ev), rows=sum(len(e["rows"]) for e in ev), players=len({e["playerName"] for e in ev}))
                          for name, ev in (("CAL", cal), ("X59", x59), ("HIST", hist))}}
    frozen = dict(BASE)

    # 1. Baseline decomposition of the direct replay error
    out["baseline"] = {"CAL": metrics(frozen, cal), "X59": metrics(frozen, x59), "HIST": metrics(frozen, hist),
                       "allDirectReplay": metrics(frozen, cal + hist + x59)}
    X = Rows(cal + hist); lo, hi = predict(frozen, X)
    abs_err = np.abs((lo + hi) / 2 - (X.lo + X.hi) / 2); is_hist = np.array([e["hist"] for e in cal + hist for _ in e["rows"]])
    out["baseline"]["histShareOfAbsoluteMidpointError"] = float(abs_err[is_hist].sum() / abs_err.sum())

    # frozen x59 reproduction (guards the frozen predictions against reinterpretation)
    X = Rows(x59); lo, hi = predict(frozen, X)
    rec = np.array([r["frozen"] for e in x59 for r in e["rows"]])
    out["baseline"]["x59FrozenReproductionMaxAbs"] = float(np.max(np.abs(np.c_[lo, hi] - rec)))
    disp = np.array([r["frozenDisplay"] for e in x59 for r in e["rows"]], float)
    out["baseline"]["X59display"] = score(disp[:, 0], disp[:, 1], X.lo, X.hi)

    # 2. HIST admissibility: dose-free geometry, tier-offset scan, degenerate intervals, implied dose
    fz = geometry_model("frozen-shape", GEOMETRY_SPECS["frozen-shape"])
    nonhist_geo = []
    for e in cal + x59:
        if len(e["rows"]) >= 2:
            s, _ = event_geometry_sse(fz, e); nonhist_geo.append(math.sqrt(s / (2 * len(e["rows"]))))
    hist_rows = []
    for e in hist:
        s, _ = event_geometry_sse(fz, e)
        scan = {}
        for d in (0, 10, 30, 50, 80):
            fn = lambda ss, w, t, A, B, d=d: movement(ss - np.where(w, d, 0), np.where(w, 132.6, 120.1), 26.05, B)
            scan[str(d)] = math.sqrt(event_geometry_sse(fn, e)[0] / (2 * len(e["rows"])))
        hist_rows.append(dict(event=e["event"], player=e["playerName"], age=e["age"], tier=e["tier"], coach=e["coach"], N=e["N"], p=e["p"],
                              geometryRmse=math.sqrt(s / (2 * len(e["rows"]))), tierOffsetScan=scan,
                              degenerateIntervals=sum(1 for r in e["rows"] if r["g"][0] == r["g"][1] and r["g"][0] > 0),
                              impliedDoseRatio=math.exp(budget_offset(frozen, [e]))))
    cal_ratios = [math.exp(budget_offset(frozen, [e])) for e in cal]
    out["histAdmissibility"] = dict(
        nonHistGeometryRmse=dict(max=max(nonhist_geo), median=float(np.median(nonhist_geo)), p90=float(np.percentile(nonhist_geo, 90))),
        events=hist_rows,
        doseLogSd=dict(CAL=float(np.std(np.log(cal_ratios))), HIST=float(np.std(np.log([r["impliedDoseRatio"] for r in hist_rows])))),
        crossRecordAgeConflicts=[
            "Ryan Rodger: canonical HIST state age 18 (OVR 114) vs canonical current state age 23 (OVR 89) and archive age 23.",
            "Scott Ritchie: canonical HIST state age 18 T2 vs archive 11 Sep preview age 24 T2 with the identical Aggression 95.",
        ])

    # 3. Nonparametric monotone-cost LP
    nonhist = cal + x59
    lp = {}
    for tol in (0.5, 1.0):
        tot, per = monotone_cost_lp(nonhist, tol)
        tot_h, per_h = monotone_cost_lp(nonhist + hist, tol)
        worst = sorted(zip(nonhist + hist, per_h), key=lambda t: -t[1])[:8]
        lp[str(tol)] = dict(nonHistTotalSlack=tot, withHistTotalSlack=tot_h,
                            worstWithHist=[dict(event=e["event"], player=e["playerName"], hist=e["hist"], slack=float(s)) for e, s in worst])
    out["monotoneCostLP"] = lp

    # 4. Response geometry ladder (per-event budgets free)
    out["geometryLadder"] = geometry_ladder(cal, x59)

    # 5. Within-event allocation: per-stat residual and grey/white budget ratio by tier
    per_stat = collections.defaultdict(list); gw_ratio = collections.defaultdict(list)
    for e in cal + x59:
        if len(e["rows"]) < 2:
            continue
        s = np.array([r["s"] for r in e["rows"]]); w = np.array([r["cls"] == "WHITE" for r in e["rows"]])
        lo_o = np.array([r["g"][0] for r in e["rows"]]); hi_o = np.array([r["g"][1] for r in e["rows"]])
        t = int(str(e["tier"])[1])
        _, (Bl, Bh) = event_geometry_sse(fz, e)
        fl = fz(s, w, t, None, Bl); fh = fz(s, w, t, None, Bh)
        for r, a, b, c, d in zip(e["rows"], fl, fh, lo_o, hi_o):
            per_stat[r["stat"]].append(float(((c + d) - (a + b)) / 2))
        if w.any() and (~w).any():
            sub = lambda m: event_geometry_sse(fz, dict(e, rows=[r for r, k in zip(e["rows"], m) if k]))[1]
            bw, bg = sub(w), sub(~w)
            gw_ratio["T0" if t == 0 else "tiered"].append(math.sqrt((bg[0] / bw[0]) * (bg[1] / bw[1])))
    out["allocation"] = dict(
        perStatWithinEventResidual={k: dict(n=len(v), mean=float(np.mean(v)), se=float(np.std(v, ddof=1) / math.sqrt(len(v))) if len(v) > 1 else None)
                                    for k, v in sorted(per_stat.items())},
        greyOverWhiteBudgetRatio={k: dict(n=len(v), geoMean=float(np.exp(np.mean(np.log(v)))), values=[float(x) for x in v]) for k, v in gw_ratio.items()})

    # 6. Dose table per coach definition and player-versus-coach variance decomposition
    offs = {e["event"] + e["playerName"]: budget_offset(frozen, [e]) for e in cal + x59}
    table = collections.defaultdict(list)
    for e in cal + x59:
        table[(e["fam"], e["shape"], int(e["N"]), e["p"])].append((e["playerName"], e["age"], math.exp(offs[e["event"] + e["playerName"]])))
    out["doseTable"] = [dict(family=k[0], shape=k[1], N=k[2], p=k[3], NoverP=k[2] / k[3],
                             geoMeanDoseRatio=float(np.exp(np.mean(np.log([v[2] for v in vs])))),
                             members=[dict(player=a, age=b, doseRatio=c) for a, b, c in vs])
                        for k, vs in sorted(table.items(), key=lambda t: (t[0][0], t[0][2] / t[0][3]))]
    out["varianceDecomposition"] = variance_decomposition(cal + x59, offs, seed=args.seed, permutations=args.permutations)
    out["withinCoachContrasts"] = within_coach_effects(cal + x59, offs)
    # Sensitivity: Russell Diamond's implied dose is internally inconsistent (WHITE-only coaches 1.37-1.56,
    # coaches anchored by a MID_GREY row 0.79-1.05) and no single tier offset reconciles his five previews.
    out["withinCoachContrastsExcludingDiamond"] = within_coach_effects([e for e in cal + x59 if e["playerName"] != "Russell Diamond"], offs)
    lopo_bands = collections.defaultdict(list)
    base_ev = [e for e in cal + x59 if e["playerName"] != "Russell Diamond"]
    for pl in sorted({e["playerName"] for e in base_ev}):
        r = within_coach_effects([e for e in base_ev if e["playerName"] != pl], offs)
        for k, v in r["ageBands+tiered"]["effects"].items():
            lopo_bands[k].append(v["logCorrection"])
    out["withinCoachContrastsExcludingDiamond"]["leaveOnePlayerOutRange"] = {k: [min(v), max(v)] for k, v in lopo_bands.items()}
    diamond = [e for e in cal if e["playerName"] == "Russell Diamond"]
    out["diamondTierScan"] = {T: [dict(coach=e["coach"], N=e["N"], classes="".join(r["cls"][0] for r in e["rows"]),
                                       impliedDoseRatio=math.exp(budget_offset(frozen, [dict(e, tier=T)])))
                                  for e in diamond] for T in ("T0", "T1", "T2", "T3")}

    # 7. Matched controls
    out["matchedControls"] = matched_controls(events, frozen)

    # 8. Direct structural ladder
    ladder = {}
    Xc = Rows(cal)
    for name, free in DIRECT_SPECS.items():
        start = SPEC_START.get(name)
        P = fit(free or [], Xc, start)
        res = dict(params={k: float(P[k]) for k in (free or [])},
                   inSampleCAL=metrics(P, cal), X59=metrics(P, x59), HIST=metrics(P, hist))
        if free and not args.quick:
            res["leaveOnePlayerOut"] = grouped_cv(free, cal, "playerName", start)
            res["leaveOneFamilyOut"] = grouped_cv(free, cal, "fam", start)
            res["leaveOneCoachOut"] = grouped_cv(free, cal, "coachId", start)
        elif not free:
            res["leaveOnePlayerOut"] = res["leaveOneFamilyOut"] = res["leaveOneCoachOut"] = res["inSampleCAL"]
        ladder[name] = res
        print(f"[ladder] {name}: X59 MAE {res['X59']['midpointMae']:.3f}", file=sys.stderr, flush=True)
    out["directLadder"] = ladder

    # 9. Affine multiplier: regime holdout and profile on N >= 13 only
    hi_n = [e for e in cal if e["N"] >= 13]; lo_n = [e for e in cal if e["N"] <= 10]
    regime = {}
    for N0 in (0.0, 0.5, 1.0, 1.5, 2.0):
        P = fit(["logC"], Rows(hi_n), dict(BASE, N0=N0))
        regime[str(N0)] = dict(C=math.exp(P["logC"]), trainNge13=metrics(P, hi_n), holdoutNle10=metrics(P, lo_n), X59=metrics(P, x59))
    profile_n0 = {}
    for N0 in np.arange(-1.0, 4.01, 0.25):
        P = fit(["logC"], Rows(hi_n), dict(BASE, N0=float(N0)))
        profile_n0[f"{N0:.2f}"] = sse(P, Rows(hi_n))
    out["affineMultiplier"] = dict(trainEvents=len(hi_n), holdoutEvents=len(lo_n),
                                   holdoutCoaches=sorted({f"{e['fam']} x{int(e['N'])} p{e['p']}" for e in lo_n}),
                                   regimeHoldout=regime, sseProfileOnNge13=profile_n0,
                                   argminN0OnNge13=float(min(profile_n0, key=profile_n0.get)))

    # 10. Candidate (card + metadata only) and optional other-player coach anchor
    cand = json.loads(CANDIDATE_PROFILE.read_text(encoding="utf-8"))
    Pc = dict(BASE, N0=float(cand["dose"]["multiplierOffset"]), logC=math.log(cand["dose"]["globalAmplitude"]))
    refit = fit(["logC"], Xc, dict(BASE, N0=float(cand["dose"]["multiplierOffset"])))
    Xx = Rows(x59); lo, hi = predict(Pc, Xx)
    out["candidate"] = dict(
        modelVersion=cand["modelVersion"], globalAmplitude=cand["dose"]["globalAmplitude"],
        calibrationRefitAmplitude=math.exp(refit["logC"]),
        CAL=metrics(Pc, cal), X59=metrics(Pc, x59), HIST=metrics(Pc, hist),
        X59display=score(np.floor(lo), np.ceil(hi), Xx.lo, Xx.hi),
        leaveOnePlayerOut=grouped_cv(["logC"], cal, "playerName", dict(BASE, N0=1.0)),
        leaveOneCoachOut=grouped_cv(["logC"], cal, "coachId", dict(BASE, N0=1.0)),
        leaveOneFamilyOut=grouped_cv(["logC"], cal, "fam", dict(BASE, N0=1.0)),
        x59ByPlayer={e["playerName"]: dict(frozen=metrics(frozen, [e]), candidate=metrics(Pc, [e])) for e in x59})
    out["coachAnchor"] = coach_anchor(cal + x59, {"frozen": frozen, "candidate": Pc})
    per_player = collections.defaultdict(list)
    for e in cal + x59 + hist:
        per_player[e["playerName"]].append(e)
    # 11. Current research candidate: frozen model plus young-grey cheapness (supported prospectively on Kawa)
    yg = young_grey_params()
    no_diamond = [e for e in cal if e["playerName"] != "Russell Diamond"]
    out["youngGrey"] = dict(modelVersion=yg["modelVersion"], profile=str(YOUNG_GREY_PROFILE.relative_to(ROOT)),
                            parameters=dict(g=yg["g"], knot=yg["knot"], ageBand=list(yg["ageBand"])),
                            frozen=dict(CAL=metrics(frozen, cal), CALexclDiamond=metrics(frozen, no_diamond), X59=metrics(frozen, x59), HIST=metrics(frozen, hist)),
                            youngGrey=dict(CAL=metrics_young_grey(frozen, cal, yg), CALexclDiamond=metrics_young_grey(frozen, no_diamond, yg),
                                           X59=metrics_young_grey(frozen, x59, yg), HIST=metrics_young_grey(frozen, hist, yg)),
                            rowsAffected=int(sum(1 for e in cal + x59 + hist for r in e["rows"]
                                                 if r["cls"] != "WHITE" and yg["ageBand"][0] <= e["age"] <= yg["ageBand"][1] and r["s"] < yg["knot"])))
    out["byPlayer"] = {name: dict(events=len(ev), partitions=sorted({e["partition"] for e in ev}), hist=any(e["hist"] for e in ev),
                                  frozen=metrics(frozen, ev), candidate=metrics(Pc, ev), youngGrey=metrics_young_grey(frozen, ev, yg))
                       for name, ev in sorted(per_player.items())}
    rows = []
    for e in cal + x59 + hist:
        Xe = Rows([e]); flo, fhi = predict(frozen, Xe); clo, chi = predict(Pc, Xe); ylo, yhi = predict_young_grey(frozen, Xe, yg)
        for i, r in enumerate(e["rows"]):
            rows.append(dict(partition="HIST" if e["hist"] else ("X59" if e["partition"] == "prospective-x59" else "CAL"),
                             source=e["partition"], player=e["playerName"], event=e["event"], family=e["fam"], coach=e["coach"],
                             N=e["N"], p=e["p"], age=e["age"], tier=e["tier"], stat=r["stat"], start=r["s"], cls=r["cls"],
                             obs_lo=r["g"][0], obs_hi=r["g"][1], frozen_lo=float(flo[i]), frozen_hi=float(fhi[i]),
                             candidate_lo=float(clo[i]), candidate_hi=float(chi[i]),
                             young_grey_lo=float(ylo[i]), young_grey_hi=float(yhi[i])))
    out["_rows"] = rows
    return out


def variance_decomposition(events, offs, seed, permutations):
    y = np.array([offs[e["event"] + e["playerName"]] for e in events])
    players = sorted({e["playerName"] for e in events})
    coaches = sorted({str(e["coachId"]) for e in events})
    def rss(names, use_p, use_c):
        cols = [np.ones(len(events))]
        if use_p:
            cols += [np.array([n == p for n in names], float) for p in players]
        if use_c:
            cols += [np.array([str(e["coachId"]) == c for e in events], float) for c in coaches]
        Xm = np.vstack(cols).T
        b = np.linalg.lstsq(Xm, y, rcond=None)[0]; r = y - Xm @ b
        return float(r @ r)
    names = [e["playerName"] for e in events]
    tot = float(np.sum((y - y.mean()) ** 2)); rc = rss(names, False, True); rb = rss(names, True, True)
    rng = np.random.default_rng(seed); hits = 0
    for _ in range(permutations):
        perm = [names[i] for i in rng.permutation(len(names))]
        if rss(perm, False, True) - rss(perm, True, True) >= rc - rb:
            hits += 1
    return dict(events=len(events), players=len(players), coachDefinitions=len(coaches), totalSS=tot,
                residualCoachOnly=rc, residualPlayerOnly=rss(names, True, False), residualBoth=rb,
                playerBeyondCoachPermutationP=hits / permutations, permutations=permutations, seed=seed)


def within_coach_effects(events, offs):
    """Coach-definition fixed effects cancel coach efficiency, family, shape, N and p exactly.
    Remaining contrasts identify age-band and tier corrections relative to the frozen profile."""
    groups = collections.defaultdict(list)
    for e in events:
        groups[e["coachId"]].append(e)
    use = [e for v in groups.values() if len({x["playerName"] for x in v}) >= 2 for e in v]
    y = np.array([offs[e["event"] + e["playerName"]] for e in use])
    coaches = sorted({str(e["coachId"]) for e in use})
    res = {"events": len(use), "coachDefinitions": len(coaches)}
    for label, cov in (("ageBands", lambda e: [float(band_index(e["age"]) == i) for i in range(1, len(BANDS))]),
                       ("ageBands+tiered", lambda e: [float(band_index(e["age"]) == i) for i in range(1, len(BANDS))] + [float(str(e["tier"]) != "T0")])):
        Xm = np.array([[float(str(e["coachId"]) == c) for c in coaches] + cov(e) for e in use])
        keep = np.where(Xm.any(axis=0))[0]
        Xm = Xm[:, keep]
        b, *_ = np.linalg.lstsq(Xm, y, rcond=None)
        r = y - Xm @ b; dof = max(len(y) - np.linalg.matrix_rank(Xm), 1); s2 = float(r @ r) / dof
        cov_b = s2 * np.linalg.pinv(Xm.T @ Xm)
        names = [f"coach:{c}" for c in coaches] + ([f"band{i}" for i in range(1, len(BANDS))] + (["tiered"] if label.endswith("tiered") else []))
        names = [names[k] for k in keep]
        eff = {}
        for k, nm in enumerate(names):
            if not nm.startswith("coach:"):
                eff[nm] = dict(logCorrection=float(b[k]), se=float(math.sqrt(max(cov_b[k, k], 0.0))),
                               impliedScale=(BANDS[int(nm[4:])][2] * math.exp(float(b[k]))) if nm.startswith("band") else None)
        res[label] = dict(effects=eff, residualSd=math.sqrt(s2), dof=dof)
    return res


def anchor_offset(P, target, pool):
    """Coach-level log dose offset for `target` from previews of the identical coach definition made by
    OTHER players. The target player's own previews are excluded by construction. Returns None if no anchor."""
    others = [o for o in pool if o["coachId"] == target["coachId"] and o["playerName"] != target["playerName"]]
    if not others:
        return None
    return float(np.mean([budget_offset(P, [o]) for o in others]))


def coach_anchor(events, models):
    """Leave-one-player-out within exact coach definitions: the anchor never contains the target player."""
    groups = collections.defaultdict(list)
    for e in events:
        groups[e["coachId"]].append(e)
    shared = {k: v for k, v in groups.items() if len({e["playerName"] for e in v}) >= 2}
    res = {"sharedCoachDefinitions": len(shared), "events": sum(len(v) for v in shared.values())}
    for label, P in models.items():
        acc = {k: {"all": [], "x59": []} for k in ("noAnchor", "otherPlayerAnchor")}
        for v in shared.values():
            for e in v:
                d = anchor_offset(P, e, v)
                X = Rows([e])
                for tag, Q in (("noAnchor", P), ("otherPlayerAnchor", dict(P, logC=P["logC"] + d))):
                    lo, hi = predict(Q, X)
                    acc[tag]["all"].append((lo, hi, X.lo, X.hi))
                    if e["partition"] == "prospective-x59":
                        acc[tag]["x59"].append((lo, hi, X.lo, X.hi))
        cat = lambda R: [np.concatenate([r[i] for r in R]) for i in range(4)]
        res[label] = {tag: {scope: score(*cat(v)) for scope, v in d.items()} for tag, d in acc.items()}
    return res


def matched_controls(events, frozen):
    by = {(e["playerName"], e["event"]): e for e in events}
    def find(player, pred):
        return [e for e in events if e["playerName"] == player and pred(e)]
    def row(e, stat):
        return next(r for r in e["rows"] if r["stat"] == stat)
    hW, hG, K = BASE["hW"], BASE["hG"], BASE["K"]
    out = {}
    # (a) Flat-zone multiplier contrast: same player, same stat, same start, same family/shape/p
    neri7 = find("G Neri", lambda e: e["N"] == 7)[0]; neri26 = find("G Neri", lambda e: e["N"] == 26)[0]
    r7, r26 = row(neri7, "PASSING"), row(neri26, "PASSING")
    u = r7["s"] - DELTA[6]
    lo_b = ratio_bounds((u, r26["g"][0]), (u, r7["g"][0]), flat=True)
    hi_b = ratio_bounds((u, r26["g"][1]), (u, r7["g"][1]), flat=True)
    out["neriPassingX26overX7"] = dict(latentStart=u, flatZoneEndsAt=hW, gainsX7=r7["g"], gainsX26=r26["g"],
                                       admissibleBudgetRatio=[max(lo_b[0], hi_b[0]), min(lo_b[1], hi_b[1])],
                                       ratioIfN=26 / 7, ratioIfNminus1=25 / 6)
    # (b) Same-state x106/x114 flat-zone rows
    pairs = []
    for player, fam106, fam114 in (("Lt Ripley", "DS", "DS"), ("LJ Galileo", "TC", "DS")):
        a = find(player, lambda e: e["N"] == 106)[0]; b = find(player, lambda e: e["N"] == 114)[0]
        t = int(str(a["tier"])[1])
        for r in a["rows"]:
            rb = row(b, r["stat"]); uu = r["s"] - (DELTA[t] if r["cls"] == "WHITE" else 0)
            h = hW if r["cls"] == "WHITE" else hG
            for i in (0, 1):
                if uu + rb["g"][i] + 0.5 <= h:
                    bnd = ratio_bounds((uu, rb["g"][i]), (uu, r["g"][i]), flat=True)
                    pairs.append(dict(player=player, families=f"{fam114}/{fam106}", stat=r["stat"], endpoint="lo" if i == 0 else "hi",
                                      bounds=list(bnd)))
    inter = {pl: [max(p["bounds"][0] for p in pairs if p["player"] == pl), min(p["bounds"][1] for p in pairs if p["player"] == pl)]
             for pl in sorted({p["player"] for p in pairs})}
    out["sameStateX114overX106FlatZone"] = dict(rows=pairs, intersectionByPlayer=inter, ratioIfN=114 / 106, ratioIfNminus1=113 / 105,
                                                note="±0.5 display tolerance; an empty intersection means the rows are not jointly consistent at that tolerance")
    # (c) Age control: Howden (19) vs Ferguson (21), same Skill x33 p4 coach, MID_GREY start 35
    how = find("Willie Howden", lambda e: e["fam"] == "SS")[0]; fer = find("Willie Ferguson", lambda e: e["fam"] == "SS" and e["N"] == 33)[0]
    rh, rf = row(how, "FINISHING"), row(fer, "SHOOTING")
    bl = ratio_bounds((rf["s"], rf["g"][0]), (rh["s"], rh["g"][0]), h=hG, K=K)
    bh = ratio_bounds((rf["s"], rf["g"][1]), (rh["s"], rh["g"][1]), h=hG, K=K)
    out["ageControlFerguson21overHowden19"] = dict(start=rh["s"], howden=rh["g"], ferguson=rf["g"],
                                                    admissibleDoseRatioFrozenShape=[max(bl[0], bh[0]), min(bl[1], bh[1])],
                                                    smoothLawExamples={"exp(-0.03/yr)": math.exp(-0.06), "exp(-0.06/yr)": math.exp(-0.12)})
    # (d) Age cross-section: TC Focused x26 p2, same coach, implied A_eff = dose offset * 8
    xs = []
    for e in events:
        if e["fam"] == "TC" and int(e["N"]) == 26 and e["p"] == 2 and not e["hist"]:
            xs.append(dict(player=e["playerName"], age=e["age"], tier=e["tier"], impliedAgeScale=BANDS[band_index(e["age"])][2] * math.exp(budget_offset(frozen, [e]))))
    out["tcX26AgeCrossSection"] = sorted(xs, key=lambda d: d["age"])
    # (e) Skill Seminar x33 vs x59 at identical displayed duration (8 days)
    ss = collections.defaultdict(list)
    for e in events:
        if e["fam"] == "SS" and not e["hist"]:
            ss[(int(e["N"]), e["p"], e["shape"])].append(math.exp(budget_offset(frozen, [e])))
    out["skillSeminarDoseByCoach"] = [dict(N=k[0], p=k[1], shape=k[2], geoMeanDoseRatio=float(np.exp(np.mean(np.log(v)))), n=len(v))
                                      for k, v in sorted(ss.items())]
    return out


def markdown(o):
    L = ["# Ordinary Resource Coach — structure audit (generated)", "",
         "Generated by `tools/resource-coach-v2/structure_audit.py`. Narrative and conclusions: "
         "`calibration/resource-coach-identification/STRUCTURE_AUDIT_20260924.md`.", ""]
    def m(x):
        return (f"{x['n']} | {x['midpointMae']:.3f} | {100*x['pointInsideRate']:.1f}% | {100*x['overlapRate']:.1f}% | "
                f"{x['endpointMae']:.3f} | {x['signedResidual']:+.3f} | {x['meanIoU']:.3f}")
    hdr = "| Set | n | midpoint MAE | inside | overlap | endpoint MAE | signed | IoU |\n|---|---:|---:|---:|---:|---:|---:|---:|"
    b = o["baseline"]
    L += ["## Frozen baseline decomposition", "", hdr]
    for k in ("allDirectReplay", "CAL", "HIST", "X59", "X59display"):
        L.append(f"| {k} | {m(b[k])} |")
    L += ["", f"HIST share of total absolute midpoint error (CAL+HIST): **{100*b['histShareOfAbsoluteMidpointError']:.1f}%**. "
          f"Frozen x59 reproduction max |Δ| = {b['x59FrozenReproductionMaxAbs']:.2e}.", ""]
    y = o["youngGrey"]
    L += ["## Current research candidate: young-grey (card + coach metadata only)", "",
          f"`{y['profile']}` — MID_GREY marginal cost {y['parameters']['g']} below displayed {y['parameters']['knot']:.0f} "
          f"for ages {y['parameters']['ageBand'][0]}–{y['parameters']['ageBand'][1]}; everything else frozen. "
          f"Supported prospectively out of corpus (Kawa), age-specific (Rodger). {y['rowsAffected']} corpus rows are affected.", "", hdr]
    for k in ("CAL", "CALexclDiamond", "X59", "HIST"):
        L.append(f"| frozen {k} | {m(y['frozen'][k])} |")
        L.append(f"| young-grey {k} | {m(y['youngGrey'][k])} |")
    L += ["", "## Falsified candidate: N − 1 multiplier (retained for the record; Ferguson x5 implied 1.42x)", "", hdr]
    L.append(f"| frozen CAL | {m(b['CAL'])} |")
    for k in ("CAL", "leaveOnePlayerOut", "leaveOneCoachOut", "leaveOneFamilyOut", "X59", "X59display", "HIST"):
        L.append(f"| candidate {k} | {m(o['candidate'][k])} |")
    L += ["", "## Direct structural ladder (fit on CAL only)", "",
          "| Hypothesis | LOPO MAE | LOCO MAE | LOFO MAE | x59 MAE | x59 signed | params |", "|---|---:|---:|---:|---:|---:|---|"]
    for name, r in o["directLadder"].items():
        g = lambda k: f"{r[k]['midpointMae']:.3f}" if k in r else "—"
        L.append(f"| {name} | {g('leaveOnePlayerOut')} | {g('leaveOneCoachOut')} | {g('leaveOneFamilyOut')} | "
                 f"{r['X59']['midpointMae']:.3f} | {r['X59']['signedResidual']:+.3f} | "
                 + ", ".join(f"{k}={v:.4g}" for k, v in r["params"].items()) + " |")
    L += ["", "## Geometry ladder (per-event budgets free; dose law factored out)", "",
          "| Response hypothesis | start RMSE | fitted RMSE | x59 RMSE |", "|---|---:|---:|---:|"]
    for k, r in o["geometryLadder"].items():
        L.append(f"| {k} | {r['startRmse']:.3f} | {r['fittedRmse']:.3f} | {r['x59Rmse']:.3f} |")
    a = o["affineMultiplier"]
    L += ["", "## Affine multiplier regime holdout (C fitted on N≥13 only)", "",
          "| N0 | C | train MAE | low-N holdout MAE | holdout inside | x59 MAE |", "|---:|---:|---:|---:|---:|---:|"]
    for k, r in a["regimeHoldout"].items():
        L.append(f"| {k} | {r['C']:.4f} | {r['trainNge13']['midpointMae']:.3f} | {r['holdoutNle10']['midpointMae']:.3f} | "
                 f"{100*r['holdoutNle10']['pointInsideRate']:.1f}% | {r['X59']['midpointMae']:.3f} |")
    L += ["", f"SSE-minimising N0 using N≥13 events only: **{a['argminN0OnNge13']}**.", ""]
    ca = o["coachAnchor"]
    L += ["## Other-player coach anchor (secondary mode)", "", hdr]
    for model in ("frozen", "candidate"):
        for tag in ("noAnchor", "otherPlayerAnchor"):
            for scope in ("all", "x59"):
                L.append(f"| {model} {tag} {scope} | {m(ca[model][tag][scope])} |")
    v = o["varianceDecomposition"]
    L += ["", "## Player versus coach-definition effects on implied dose", "",
          f"Total SS {v['totalSS']:.4f}; coach-only residual {v['residualCoachOnly']:.4f}; player-only residual {v['residualPlayerOnly']:.4f}; "
          f"both {v['residualBoth']:.4f}. Player effect beyond coach: permutation p = {v['playerBeyondCoachPermutationP']:.3f} ({v['permutations']} permutations).", ""]
    wc = o["withinCoachContrasts"]
    L += ["## Within-coach contrasts (coach efficiency cancelled by fixed effects)", "",
          f"{wc['events']} events on {wc['coachDefinitions']} coach definitions shared by ≥2 players.", "",
          "| Model | term | log correction to frozen | SE | implied scale |", "|---|---|---:|---:|---:|"]
    for tag, src in (("all", wc), ("excl. Diamond", o["withinCoachContrastsExcludingDiamond"])):
        for label in ("ageBands", "ageBands+tiered"):
            for k, v in src[label]["effects"].items():
                sc = f"{v['impliedScale']:.2f}" if v["impliedScale"] is not None else "—"
                L.append(f"| {tag}: {label} | {k} | {v['logCorrection']:+.3f} | {v['se']:.3f} | {sc} |")
    rng = o["withinCoachContrastsExcludingDiamond"]["leaveOnePlayerOutRange"]
    L += ["", "Leave-one-player-out range (excl. Diamond): " + "; ".join(f"{k} [{a:+.3f}, {b:+.3f}]" for k, (a, b) in rng.items()), ""]
    L += ["", "## Every player across the corpus (midpoint MAE: frozen / young-grey / falsified N−1)", "",
          "| Player | events | HIST | frozen MAE | young-grey MAE | N−1 MAE | frozen inside | young-grey inside | frozen signed | young-grey signed |",
          "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|"]
    for name, r in o["byPlayer"].items():
        f, yv, c = r["frozen"], r["youngGrey"], r["candidate"]
        L.append(f"| {name} | {r['events']} | {'yes' if r['hist'] else ''} | {f['midpointMae']:.2f} | {yv['midpointMae']:.2f} | {c['midpointMae']:.2f} | "
                 f"{100*f['pointInsideRate']:.0f}% | {100*yv['pointInsideRate']:.0f}% | {f['signedResidual']:+.2f} | {yv['signedResidual']:+.2f} |")
    L.append("")
    h = o["histAdmissibility"]
    L += ["## HIST admissibility", "", f"Non-HIST per-event geometry RMSE: median {h['nonHistGeometryRmse']['median']:.2f}, "
          f"p90 {h['nonHistGeometryRmse']['p90']:.2f}, max {h['nonHistGeometryRmse']['max']:.2f}. Implied log-dose SD: CAL {h['doseLogSd']['CAL']:.3f}, HIST {h['doseLogSd']['HIST']:.3f}.", "",
          "| Event | Player | age | tier | geometry RMSE | RMSE at Δ=0/10/30/50/80 | degenerate | implied dose |", "|---|---|---:|---|---:|---|---:|---:|"]
    for r in h["events"]:
        L.append(f"| {r['event']} | {r['player']} | {r['age']} | {r['tier']} | {r['geometryRmse']:.2f} | "
                 + "/".join(f"{r['tierOffsetScan'][d]:.1f}" for d in ('0', '10', '30', '50', '80'))
                 + f" | {r['degenerateIntervals']} | {r['impliedDoseRatio']:.3f} |")
    L += ["", "## Monotone-cost LP", ""]
    for tol, r in o["monotoneCostLP"].items():
        L.append(f"- tolerance ±{tol}: non-HIST total slack {r['nonHistTotalSlack']:.1f}; with HIST {r['withHistTotalSlack']:.1f}; worst: "
                 + ", ".join(f"{w['player']} {w['event']} ({w['slack']:.0f}{', HIST' if w['hist'] else ''})" for w in r["worstWithHist"][:5]))
    mc = o["matchedControls"]
    L += ["", "## Matched controls", "",
          f"- Neri Passing x26/x7 (flat zone, same start): admissible budget ratio {mc['neriPassingX26overX7']['admissibleBudgetRatio'][0]:.3f}–"
          f"{mc['neriPassingX26overX7']['admissibleBudgetRatio'][1]:.3f}; N ratio {26/7:.3f}; (N−1) ratio {25/6:.3f}.",
          "- Same-state x114/x106 flat-zone rows (±0.5): " + "; ".join(f"{k} {v[0]:.4f}–{v[1]:.4f}" for k, v in mc["sameStateX114overX106FlatZone"]["intersectionByPlayer"].items())
          + f"; N {114/106:.4f}; N−1 {113/105:.4f} (non-discriminating).",
          f"- Ferguson(21)/Howden(19), Skill x33 p4, MID_GREY start 35: admissible dose ratio "
          f"{mc['ageControlFerguson21overHowden19']['admissibleDoseRatioFrozenShape'][0]:.3f}–{mc['ageControlFerguson21overHowden19']['admissibleDoseRatioFrozenShape'][1]:.3f}.",
          "", "| TC x26 player | age | tier | implied age scale |", "|---|---:|---|---:|"]
    for r in mc["tcX26AgeCrossSection"]:
        L.append(f"| {r['player']} | {r['age']} | {r['tier']} | {r['impliedAgeScale']:.2f} |")
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--seed", type=int, default=20260924)
    ap.add_argument("--permutations", type=int, default=500)
    ap.add_argument("--quick", action="store_true", help="skip cross-validation in the direct ladder")
    args = ap.parse_args()
    out = run(args)
    d = pathlib.Path(args.out_dir); d.mkdir(parents=True, exist_ok=True)
    rows = out.pop("_rows")
    import csv
    with (d / "candidate-direct-predictions.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    (d / "structure-audit.json").write_text(json.dumps(out, indent=1, allow_nan=False, default=float) + "\n", encoding="utf-8")
    (d / "STRUCTURE_AUDIT.md").write_text(markdown(out), encoding="utf-8")
    print(json.dumps({"baseline": out["baseline"]["CAL"], "youngGrey": out["youngGrey"]["youngGrey"], "falsifiedNminus1X59": out["candidate"]["X59"]}, indent=1))


if __name__ == "__main__":
    main()
