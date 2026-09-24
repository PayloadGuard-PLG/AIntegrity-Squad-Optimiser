#!/usr/bin/env python3
"""Research-only grouped validation of ordinary coach response/renderer candidates.

Observations enter the fit only through training players. The target preview never
sets its own dose. This script does not edit frozen predictions or production code.
"""
import argparse
import collections
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

import shape_models as sm

sa = sm.sa
GRID = np.arange(-250., 601., .5)
AGE = np.array([b[2] for b in sa.BANDS], float)


def rows(events):
    return sa.Rows(events)


def prediction(X, theta, kind, *, rho=1.5, rounding="raw", tier_scale=1.0,
               grey_weight=1.0, age_shift=False, fraction=0.0):
    """Cumulative-cost inversion; cost can be hard, soft or integer-stepped.

    The soft cost is (1 + exp((x-h)/tau))^(tau/K), with hard limit tau->0.
    The discrete alternative holds cost(floor(x)) constant until next integer.
    Young grey uses cost 0.65 below x=80 as in the pinned YG baseline.
    """
    C, hw, hg, K = theta[:4]
    tau = theta[4] if kind == "soft" else 0.
    u = X.s - tier_scale * X.delta * X.w + fraction
    B = C * AGE[X.bi] * X.N / X.p * np.where(X.w, 1., grey_weight)
    h = np.where(X.w, hw, hg) + (theta[-1] if age_shift else 0.) * ((X.age >= 22) & (X.age <= 25) & X.w)
    group = np.where(X.w, 0, np.where(X.age <= 21, 1, 2))
    # A group has a common h unless the 22-25 threshold shift is active.
    if age_shift:
        group = np.where(X.w & (X.age >= 22) & (X.age <= 25), 3, group)
    result = []
    for scale in (1., rho):
        out = np.zeros(len(X.lo))
        for g in np.unique(group):
            mask = group == g
            threshold = h[mask][0]
            x = np.floor(GRID) if kind == "discrete" else GRID
            if kind == "soft":
                cost = np.exp(np.clip(np.logaddexp(0, (x - threshold) / tau) * tau / K, -50, 50))
            else:
                cost = np.exp(np.maximum(x - threshold, 0.) / K)
            if g == 1:
                cost = np.where(GRID < 80., .65, cost)
            if kind == "discrete":
                # Exact constant unit cost on each half-point; grid includes integer boundaries.
                cumulative = np.r_[0., np.cumsum(cost[:-1]) * .5]
            else:
                cumulative = np.r_[0., np.cumsum((cost[:-1] + cost[1:]) * .25)]
            initial = np.interp(u[mask], GRID, cumulative)
            finish = np.interp(initial + B[mask] * scale, cumulative, GRID)
            out[mask] = np.maximum(0, finish) - np.maximum(0, u[mask])
        if rounding == "nearest":
            out = np.floor(out + .5)
        elif rounding == "floor":
            out = np.floor(out + fraction + 1e-10)
        result.append(out)
    return result


def fit(events, kind, *, rho=1.5, rounding="raw", tier_scale=1., grey_weight=1., age_shift=False, fraction=0.):
    X = rows(events)
    start = [1.38, 120., 106., 36.] + ([10.] if kind == "soft" else []) + ([-5.] if age_shift else [])
    lower = [.1, 60., 40., 5.] + ([1.] if kind == "soft" else []) + ([-30.] if age_shift else [])
    upper = [4., 170., 160., 100.] + ([70.] if kind == "soft" else []) + ([30.] if age_shift else [])
    def residual(v):
        lo, hi = prediction(X, v, kind, rho=rho, rounding=rounding,
                            tier_scale=tier_scale, grey_weight=grey_weight,
                            age_shift=age_shift, fraction=fraction)
        return np.r_[lo - X.lo, hi - X.hi]
    opt = least_squares(residual, start, bounds=(lower, upper), max_nfev=180,
                        xtol=1e-5, ftol=1e-5, gtol=1e-5)
    return opt.x


def score(pred, X):
    lo, hi = pred
    mid = (lo + hi) / 2
    omid = (X.lo + X.hi) / 2
    return dict(mae=float(np.mean(abs(mid - omid))),
                inside=float(np.mean((mid >= X.lo) & (mid <= X.hi))),
                overlap=float(np.mean((lo <= X.hi) & (hi >= X.lo))),
                endpoint_mae=float(np.mean((abs(lo-X.lo)+abs(hi-X.hi))/2)),
                sse=float(np.sum((lo-X.lo)**2+(hi-X.hi)**2)))


def evaluate(events, kind, options, split="player"):
    groups = sorted(set(e["playerName"] if split == "player" else
                        (e["fam"], e["coach"], e["N"]) for e in events), key=str)
    predictions, observations, event_errors = [], [], []
    for i, group in enumerate(groups):
        predicate = lambda e: e["playerName"] if split == "player" else (e["fam"], e["coach"], e["N"])
        train = [e for e in events if predicate(e) != group]
        test = [e for e in events if predicate(e) == group]
        theta = fit(train, kind, **options)
        for ev in test:
            X = rows([ev])
            out = prediction(X, theta, kind, **options)
            predictions.extend(zip(*out))
            observations.extend(zip(X.lo, X.hi))
            event_errors.append(dict(event=ev["event"], player=ev["playerName"],
                                     score=score(out, X), n=len(X.lo)))
        if i % 10 == 9:
            print(f"{kind} {split} {i+1}/{len(groups)}", flush=True)
    P, O = np.array(predictions), np.array(observations)
    mid = P.mean(axis=1)
    result = dict(mae=float(np.mean(abs(mid - O.mean(axis=1)))),
                  inside=float(np.mean((mid >= O[:,0]) & (mid <= O[:,1]))),
                  overlap=float(np.mean((P[:,0] <= O[:,1]) & (P[:,1] >= O[:,0]))),
                  endpoint_mae=float(np.mean(abs(P-O))),
                  all_in=float(np.mean([x["score"]["inside"] == 1 for x in event_errors])),
                  rows=len(O), events=len(event_errors))
    return dict(summary=result, events=event_errors)


def evaluate_shape(events, name, split="player"):
    """Independent grouped replay of the committed shape-model fitting procedure."""
    groups = sorted(set(e["playerName"] if split == "player" else
                        (e["fam"], e["coach"], e["N"]) for e in events), key=str)
    yg = sa.young_grey_params()
    predictions, observations, all_in = [], [], []
    for group in groups:
        predicate = lambda e: e["playerName"] if split == "player" else (e["fam"], e["coach"], e["N"])
        tr = [e for e in events if predicate(e) != group]
        te = [e for e in events if predicate(e) == group]
        P = sm.params(sm.fit(sm.FREE[name], rows(tr), yg))
        for e in te:
            X = rows([e]); lo, hi = sm.predict(P, X, yg)
            predictions.extend(zip(lo, hi)); observations.extend(zip(X.lo, X.hi))
            mid = (lo + hi) / 2
            all_in.append(bool(np.all((mid >= X.lo) & (mid <= X.hi))))
    P = np.array(predictions); O = np.array(observations); mid = P.mean(axis=1)
    summary = dict(mae=float(np.mean(abs(mid-O.mean(axis=1)))),
                   inside=float(np.mean((mid >= O[:,0]) & (mid <= O[:,1]))),
                   overlap=float(np.mean((P[:,0] <= O[:,1]) & (P[:,1] >= O[:,0]))),
                   endpoint_mae=float(np.mean(abs(P-O))), all_in=float(np.mean(all_in)),
                   rows=len(O), events=len(all_in))
    renders = {}
    for mode, Q in (("round_nearest", np.floor(P+.5)), ("floor_zero_fraction", np.floor(P))):
        rmid = Q.mean(axis=1)
        renders[mode] = dict(endpoint_mae=float(np.mean(abs(Q-O))),
                             exact_endpoint_rate=float(np.mean(Q==O)),
                             inside=float(np.mean((rmid >= O[:,0]) & (rmid <= O[:,1]))))
    return dict(summary=summary, renderDiagnostics=renders)


def direct_constraints(events):
    """Tests that require no fitted dose or selected response-curve constants."""
    flat, collisions = [], []
    for event in events:
        by_coordinate = collections.defaultdict(list)
        for row in event["rows"]:
            u = row["s"] - (sa.DELTA[int(event["tier"][1:])] if row["cls"] == "WHITE" else 0)
            l, hi = row["g"]
            by_coordinate[(float(u), row["cls"])].append(dict(stat=row["stat"], interval=[l, hi]))
            # Conservative flat-region subset under M1: no rectification or young-grey knot.
            if (u >= 0 and l >= 10 and u + hi < (106 if row["cls"] == "MID_GREY" else 120)
                    and not (event["age"] <= 21 and row["cls"] == "MID_GREY")):
                flat.append(dict(event=event["event"], stat=row["stat"],
                                 rhoMin=(hi-.5)/(l+.5), rhoMax=(hi+.5)/(l-.5)))
        for (u, cls), pair in by_coordinate.items():
            if len(pair) >= 2 and len({tuple(x["interval"]) for x in pair}) > 1:
                collisions.append(dict(event=event["event"], coordinate=u, displayClass=cls, rows=pair))
    ovr = []
    for slug in sm.CONTROL_SLUGS:
        card = json.loads((sm.CRI / f"control-card-20260924-{slug}.json").read_text())
        observation = json.loads((sm.CRI / f"control-observation-20260924-{slug}.json").read_text())
        if isinstance(observation.get("displayedOvr"), (int, float)):
            ovr.append(dict(player=card["name"], ovrMinusIntegerMean=round(
                observation["displayedOvr"]-sum(card["stats"].values())/15, 4)))
    return dict(flatRows=len(flat), rhoIntersection=[max(x["rhoMin"] for x in flat),
                                                       min(x["rhoMax"] for x in flat)],
                rho1_5Violations=sum(not x["rhoMin"] <= 1.5 <= x["rhoMax"] for x in flat),
                rho1_529Violations=sum(not x["rhoMin"] <= 1.529 <= x["rhoMax"] for x in flat),
                collisions=collisions, decimalOvrChecks=ovr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", required=True)
    ap.add_argument("--split", choices=["player", "coach"], default="player")
    args = ap.parse_args()
    events = sm.pool()
    frozen = sm.load_frozen()
    if sm.pool_digest(events) != frozen["pool"]["eventIdSha256"]:
        raise RuntimeError("Pinned pool changed; stop before scoring")
    X = rows(events)
    yg = sa.young_grey_params()
    base = score(sa.predict_young_grey(sa.BASE, X, yg), X)
    print("pool", len(events), len(X.lo), "frozen YG in sample", base, flush=True)
    candidates = [
        ("hard-rho1.529", "hard", dict(rho=math.exp(sa.BASE["logRho"]))),
        ("hard-rho1.5", "hard", dict(rho=1.5)),
        ("soft-rho1.5", "soft", dict(rho=1.5)),
        ("discrete-rho1.5", "discrete", dict(rho=1.5)),
        ("soft-rho1.5-shift22", "soft", dict(rho=1.5, age_shift=True)),
    ]
    output = dict(poolSha256=sm.pool_digest(events), split=args.split,
                  directConstraints=direct_constraints(events),
                  baselineInSample=base, models={})
    for name in ("M1", "Mstar", "Mstarstar"):
        output["models"][name] = dict(cv=evaluate_shape(events, name, args.split))
        print(name, "held-out", output["models"][name]["cv"]["summary"], flush=True)
    Path(args.output).write_text(json.dumps(output, indent=2) + "\n")
    for label, kind, kw in candidates:
        theta = fit(events, kind, **kw)
        insample = score(prediction(X, theta, kind, **kw), X)
        print(label, "params", theta, "fit", insample, flush=True)
        cv = evaluate(events, kind, kw, args.split)
        print(label, "held-out", cv["summary"], flush=True)
        output["models"][label] = dict(params=list(theta), inSample=insample, cv=cv)
        Path(args.output).write_text(json.dumps(output, indent=2) + "\n")


if __name__ == "__main__":
    main()
