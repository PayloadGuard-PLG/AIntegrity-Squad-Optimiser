#!/usr/bin/env python3
"""Research-only card observation layer, with player-held-out evaluation.

The same shape parameters are fitted to other players for all rendering arms.
No held-out endpoints, preview OVR or player-specific adjustment enter predictions.
"""
import argparse
import json
from pathlib import Path

import numpy as np

import shape_models as sm

sa = sm.sa


def latent_render(P, X, yg, grid=64, renderer="floor"):
    """Integrate an unknown stat remainder f over [0,1); project endpoint values.

    The starting card displays s=floor(x). For the floor arm the endpoint
    displays floor(x+m), so the visible gain is floor(f+m). The mean and finite
    support describe card-only uncertainty, not a fitted correction.
    """
    base = X.s.copy()
    draws = []
    fractions=(np.arange(grid) + .5) / grid
    if renderer == "nearest":
        # Condition on the observed integer card value under nearest rounding.
        fractions=fractions-.5
    for f in fractions:
        X.s = base + f
        lo, hi = sm.predict(P, X, yg)
        if renderer == "floor":
            draws.append(np.stack((np.floor(f + lo), np.floor(f + hi)), axis=1))
        elif renderer == "nearest":
            draws.append(np.stack((np.floor(f + lo + .5),
                                   np.floor(f + hi + .5)), axis=1))
        else:
            raise ValueError(renderer)
    X.s = base
    a = np.stack(draws)
    mean=a.mean(axis=0)
    if renderer == "floor":
        # Include both limiting phases for support, beyond the quadrature nodes.
        limits=[]
        for f in (0.,np.nextafter(1.,0.)):
            X.s=base+f
            lo,hi=sm.predict(P,X,yg)
            limits.append(np.stack((np.floor(f+lo),np.floor(f+hi)),axis=1))
        X.s=base
        a=np.concatenate((a,np.stack(limits)),axis=0)
    return mean, a.min(axis=0), a.max(axis=0)


def metrics(pred, observed):
    m = pred.mean(axis=1)
    y = observed.mean(axis=1)
    return dict(midpointMae=float(np.abs(m-y).mean()),
                endpointMae=float(np.abs(pred-observed).mean()),
                pointInside=float(((m >= observed[:, 0]) & (m <= observed[:, 1])).mean()),
                endpointExact=float(np.isclose(pred, observed).mean()),
                nRows=len(m))


def mark_feasible():
    raw = [(148,2228),(152,2289),(156,2349),(160,2409),(164,2469),
           (168,2529),(172,2589),(176,2649),(180,2695)]
    intervals = [{"target":o,"visibleSum":s,"minFraction":max(0,15*o-s),
                  "maxFractionExclusive":min(15,15*(o+1)-s)} for o,s in raw]
    lower = max(t["minFraction"] for t in intervals)
    upper = min(t["maxFractionExclusive"] for t in intervals)
    return dict(assumptions="OVR=floor(mean of the 15 unrounded stats), each card stat=floor(latent stat)",
                intervals=intervals, commonFractionInterval=[lower, upper],
                commonFractionFeasible=lower < upper,
                nearestRoundingInteriorImpossible=any((s / 15) >= o+.5 for o,s in raw[1:-1]))


def condition_simulation():
    traces=[]
    for phase in (0.03,.17,.41,.69,.93):
        states=np.floor(50+phase-1.35*np.arange(21))
        losses=(-np.diff(states)).astype(int).tolist()
        assert losses.count(2)==7 and losses.count(1)==13
        traces.append(dict(initialFraction=phase,losses=losses,
                           adjacentTwos=any(a==b==2 for a,b in zip(losses,losses[1:]))))
    return dict(nominalDrain=1.35,twosIn20=7,onesIn20=13,
                stochasticBinomialCountVariance=20*.35*.65,
                assumptions="exact 1.35 per drill, carry preserved, no recovery or other modifiers",
                phases=traces)


def period_transfer(events, yg):
    """Chronological diagnostic; model choices were made after these observations existed."""
    later=[e for e in events if e["partition"] in ("control","prospective-x59")]
    later_players={e["playerName"] for e in later}
    early=[e for e in events if e not in later and e["playerName"] not in later_players]
    A=sa.Rows(early); X=sa.Rows(later)
    observed=np.stack((X.lo,X.hi),axis=1)
    output=dict(trainEvents=len(early),trainRows=len(A.lo),testEvents=len(later),
                testRows=len(X.lo),testPlayers=len(later_players),
                playerDisjoint=True, status="retrospective time split, families already selected post hoc",models={})
    for name in ("M1","Mstar","Mstarstar"):
        P=sm.params(sm.fit(sm.FREE[name],A,yg))
        raw=np.stack(sm.predict(P,X,yg),axis=1)
        floor_mean,_,_=latent_render(P,X,yg,renderer="floor")
        output["models"][name]={"raw":metrics(raw,observed),
                                    "nearestZero":metrics(np.floor(raw+.5),observed),
                                    "floorUniform":metrics(floor_mean,observed)}
    return output


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args=parser.parse_args()
    events=sm.pool()
    frozen=sm.load_frozen()
    assert sm.pool_digest(events) == frozen["pool"]["eventIdSha256"]
    players=sorted({e["playerName"] for e in events})
    yg=sa.young_grey_params()
    arms={name:{"raw":[],"floorUniform":[],"nearestUniform":[],"floorZero":[],"nearestZero":[],
                "floorSupportLow":[],"floorSupportHigh":[],"observed":[],"byPlayer":{}}
          for name in ("M1","Mstar","Mstarstar")}
    for i, player in enumerate(players):
        train=sm.sa.Rows([e for e in events if e["playerName"] != player])
        test=sm.sa.Rows([e for e in events if e["playerName"] == player])
        observed=np.stack((test.lo,test.hi),axis=1)
        for name in arms:
            P=sm.params(sm.fit(sm.FREE[name],train,yg))
            lo,hi=sm.predict(P,test,yg)
            raw=np.stack((lo,hi),axis=1)
            fmean,fl,fh=latent_render(P,test,yg,renderer="floor")
            nmean,_,_=latent_render(P,test,yg,renderer="nearest")
            outcome={"raw":raw,"floorUniform":fmean,"nearestUniform":nmean,
                     "floorZero":np.floor(raw),"nearestZero":np.floor(raw+.5),
                     "floorSupportLow":fl,"floorSupportHigh":fh,"observed":observed}
            for key, matrix in outcome.items():
                arms[name][key].extend(matrix.tolist())
            arms[name]["byPlayer"][player]={key:metrics(outcome[key],observed)["midpointMae"]
                                               for key in ("raw","floorUniform","nearestUniform")}
        print(f"player {i+1}/{len(players)} {player}",flush=True)
    result=dict(schema="fractional-observation-recheck-v1", status="research-only",
                poolDigest=sm.pool_digest(events), groups=len(players),
                mark=mark_feasible(), periodTransfer=period_transfer(events,yg),
                conditionCarry20=condition_simulation(),
                models={})
    for name, data in arms.items():
        obs=np.asarray(data["observed"])
        supportLo=np.asarray(data["floorSupportLow"])
        supportHi=np.asarray(data["floorSupportHigh"])
        result["models"][name]=dict(
            scores={key:metrics(np.asarray(data[key]),obs) for key in
                    ("raw","floorUniform","nearestUniform","floorZero","nearestZero")},
            floorSupportCoverage=float(((supportLo <= obs) & (obs <= supportHi)).mean()),
            floorMeanSupportWidth=float((supportHi-supportLo).mean()),
            byPlayer=data["byPlayer"])
    Path(args.output).write_text(json.dumps(result,indent=2)+"\n")
    for name,v in result["models"].items():
        print(name, v["scores"], "support",v["floorSupportCoverage"],flush=True)


if __name__ == "__main__":
    main()
