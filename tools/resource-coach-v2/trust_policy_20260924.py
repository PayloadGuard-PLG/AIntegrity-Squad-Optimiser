#!/usr/bin/env python3
"""Research-only, player-disjoint evaluation of card-only preview trust.

The user-facing game's gain interval must not be broadened to manufacture
midpoint-inside accuracy.  Keep expected preview and uncertainty separate.
"""
from __future__ import annotations

import collections
import json
import math
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import shape_models as sm


def production_v2(X):
    """Independent replay of src/logic/resourceCoachV2.ts cold-start profile."""
    profile=json.loads((ROOT/'profiles/resource_coach_v2.json').read_text())
    p=profile['parameters']
    K=p['K']
    high=np.log(p['highRateAge28'])+p['highAgeLogSlopePerYear']*(X.age-28)
    low=np.log(p['lowRateAge28'])+p['lowAgeLogSlopePerYear']*(X.age-28)
    u=X.s-np.where(X.w,X.delta,0)
    h=K*(high-low)
    exposure=X.N/X.p*np.where(X.w,1,p['greyExposureMultiplier'])
    remaining=np.maximum(0,p['regularStatCap']-u)
    def endpoint(rho):
        B=np.exp(low)*exposure*rho
        gap=np.maximum(h-u,0)
        g=np.where(B<=gap,B,
                   gap+K*np.log1p(np.maximum(B-gap,0)/K*np.exp(-np.maximum(u-h,0)/K)))
        return np.minimum(remaining,g)
    return endpoint(1),endpoint(p['upperLatentRatio'])


def score(rows):
    if not rows:
        return {"n": 0}
    err = np.array([r["point"] - (r["lo"] + r["hi"])/2 for r in rows])
    inside = np.array([r["lo"] <= r["point"] <= r["hi"] for r in rows])
    overlap = np.array([r["predLo"] <= r["hi"] and r["predHi"] >= r["lo"] for r in rows])
    previews = collections.defaultdict(list)
    players = collections.defaultdict(list)
    for r, v in zip(rows, inside):
        previews[r["event"]].append(bool(v))
        players[r["player"]].append(bool(v))
    min_eight = min((np.mean(v) for v in players.values() if len(v)>=8),default=None)
    return dict(n=len(rows), previews=len(previews), players=len(players),
                mae=float(np.mean(np.abs(err))), inside=float(np.mean(inside)),
                overlap=float(np.mean(overlap)),
                entirePreviewInside=float(np.mean([all(v) for v in previews.values()])),
                playersEightRowsMinInside=float(min_eight) if min_eight is not None else None)


def make_rows():
    ev = sm.pool()
    assert sm.pool_digest(ev) == sm.load_frozen()["pool"]["eventIdSha256"]
    yg = sm.sa.young_grey_params()
    by_player = collections.defaultdict(list)
    for event in ev:
        by_player[event["playerName"]].append(event)
    rows = []
    names = ["M1", "Mstar", "Mstarstar"]
    for target in sorted(by_player):
        train = [e for p, group in by_player.items() if p != target for e in group]
        test = by_player[target]
        fits = {name: sm.params(sm.fit(sm.FREE[name], sm.sa.Rows(train), yg)) for name in names}
        X = sm.sa.Rows(test)
        pred = {name: sm.predict(fits[name], X, yg) for name in names}
        pred['productionCold']=production_v2(X)
        i = 0
        for event in test:
            for r in event["rows"]:
                u = float(X.s[i] - X.delta[i]*X.w[i])
                d = dict(event=event["event"],player=target,partition=event["partition"],
                         coach=list(event["coachId"][:4]),age=int(event["age"]),tier=event["tier"],
                         p=int(event["p"]),N=float(event["N"]),family=event["fam"],
                         stat=r["stat"],cls=r["cls"],start=float(r["s"]),u=u,
                         lo=float(r["g"][0]),hi=float(r["g"][1]))
                d["pred"] = {name:[float(pred[name][0][i]),float(pred[name][1][i])] for name in (*names,'productionCold')}
                rows.append(d)
                i += 1
        assert i == len(X.s)
    return rows


def variants(rows):
    out = {}
    combinations = {"productionCold":{"productionCold":1.0},
                    "M1": {"M1":1.0}, "Mstar":{"Mstar":1.0},
                    "Mstarstar":{"Mstarstar":1.0},
                    "blend_half":{"Mstar":.5,"Mstarstar":.5},
                    "blend_25star":{"Mstar":.25,"Mstarstar":.75},
                    "blend_three":{"M1":.2,"Mstar":.3,"Mstarstar":.5}}
    for label, weights in combinations.items():
        vv=[]
        for r in rows:
            a = sum(w*r["pred"][name][0] for name,w in weights.items())
            b = sum(w*r["pred"][name][1] for name,w in weights.items())
            vv.append(dict(r,predLo=a,predHi=b,point=(a+b)/2))
        out[label]=dict(overall=score(vv),x59=score([r for r in vv if r["partition"]=="prospective-x59"]),
                        controls=score([r for r in vv if r["partition"]=="control"]))
    return out


def selective(rows):
    """Selection uses only pre-preview predictions and card/coach fields."""
    vv=[]
    for r in rows:
        lo,hi=r["pred"]["Mstarstar"]
        point=(lo+hi)/2
        options=[sum(r["pred"][name])/2 for name in ("M1","Mstar","Mstarstar")]
        vv.append(dict(r,predLo=lo,predHi=hi,point=point,
                       width=hi-lo,spread=max(options)-min(options),
                       exposure=r["N"]/r["p"]))
    metrics={}
    for key,ascending in (("width",False),("spread",True),("exposure",False)):
        sorted_rows=sorted(vv,key=lambda r:r[key],reverse=not ascending)
        snapshots={}
        for pct in (0.5,.6,.7,.8,.9,1.0):
            retained=sorted_rows[:math.ceil(pct*len(vv))]
            snapshots[str(pct)] = dict(cutoff=float(retained[-1][key]),**score(retained))
        metrics[key]=snapshots
    # Preview gating: all rows are shown or the entire coach preview is declined.
    by_event=collections.defaultdict(list)
    for r in vv: by_event[r["event"]].append(r)
    ranked=sorted(by_event.values(),key=lambda group: max(r["spread"] for r in group))
    gate={}
    for pct in (.5,.6,.7,.8,.9,1.0):
        chosen=ranked[:math.ceil(pct*len(ranked))]
        gate[str(pct)]=dict(maxSpread=max(r["spread"] for g in chosen for r in g),**score([r for g in chosen for r in g]))
    metrics["entirePreviewByDisagreement"]=gate
    ranked=sorted(by_event.values(),key=lambda group: min(r["width"] for r in group),reverse=True)
    gate={}
    for pct in (.5,.6,.7,.8,.9,1.0):
        chosen=ranked[:math.ceil(pct*len(ranked))]
        gate[str(pct)]=dict(minWidth=min(r["width"] for g in chosen for r in g),**score([r for g in chosen for r in g]))
    metrics["entirePreviewByMinWidth"]=gate
    return metrics


def rank_diagnostic(rows):
    """Compare actually displayed OVR midpoint, with no cost assumptions."""
    per_event=collections.defaultdict(list)
    for r in rows: per_event[r["event"]].append(r)
    slates=collections.defaultdict(list)
    slugs=sm.CONTROL_SLUGS
    for event, group in per_event.items():
        if not all(r["partition"]=="control" for r in group): continue
        x=group[0]
        slug=next(s for s in slugs if event.startswith('CONTROL-'+s+'-'))
        key=event[len('CONTROL-'+slug+'-'):]
        obs=json.loads((sm.CRI/f'control-observation-20260924-{slug}.json').read_text())
        game_ovr=obs.get('ovrBoost',{}).get(key)
        if game_ovr is None: continue
        slates[x["player"]].append(dict(event=event,coach=x["coach"],
                         N=x["N"],exposure=x["N"]/x["p"],
                         pred=sum(sum(r["pred"]["Mstarstar"])/2 for r in group)/15,
                         observed=sum(game_ovr)/2, observedInterval=game_ovr))
    scores={}
    for name in ('pred','N','exposure'):
        out=[]
        dominance=[]
        for player, slate in sorted(slates.items()):
            if len(slate)<2: continue
            selected=max(slate,key=lambda x:x[name])
            best=max(x["observed"] for x in slate)
            pairs=[(a,b) for ia,a in enumerate(slate) for b in slate[ia+1:]]
            comparable=[(a,b) for a,b in pairs if a[name]!=b[name] and a["observed"]!=b["observed"]]
            for a,b in pairs:
                a_lo,a_hi=a['observedInterval'];b_lo,b_hi=b['observedInterval']
                observed_sign=int(a_lo>b_hi)-int(b_lo>a_hi)
                if observed_sign:
                    dominance.append(dict(player=player,correct=(a[name]-b[name])*observed_sign>0,
                                          margin=abs(a[name]-b[name])))
            out.append(dict(player=player,options=len(slate),selected=selected["event"],
                            observedRegret=best-selected["observed"],
                            pairCorrect=sum((a[name]-b[name])*(a["observed"]-b["observed"])>0 for a,b in comparable),
                            pairComparable=len(comparable)))
        scores[name]=dict(players=len(out),meanRegret=float(np.mean([x["observedRegret"] for x in out])),
                   maxRegret=max(x["observedRegret"] for x in out),
                   pairOrderingAccuracy=sum(x["pairCorrect"] for x in out)/sum(x["pairComparable"] for x in out),
                   correctPairs=sum(x['pairCorrect'] for x in out),comparedPairs=sum(x['pairComparable'] for x in out),
                   clearIntervalDominance=dict(correct=sum(x['correct'] for x in dominance),
                                                  n=len(dominance)),
                   gapAtLeastOne=dict(correct=sum(x['correct'] for x in dominance if x['margin']>=1),
                                      n=sum(x['margin']>=1 for x in dominance)),
                   details=out)
    return dict(metric="displayed OVR interval midpoint",comparators=scores,
                caveat="Game preview labels, not actual training outcomes, currency-adjusted utility, or independent players per pair.")


def display_rounding(rows):
    out={}
    for name in ('productionCold','Mstar','Mstarstar'):
        for mode in ('continuous','nearest'):
            rr=[]
            for r in rows:
                a,b=r['pred'][name]
                if mode=='nearest':a,b=math.floor(a+.5),math.floor(b+.5)
                rr.append(dict(r,predLo=a,predHi=b,point=(a+b)/2))
            out[name+'_'+mode]=dict(**score(rr),
                nonZero=score([r for r in rr if r['hi']>0]),
                endpointMae=float(np.mean([(abs(r['predLo']-r['lo'])+abs(r['predHi']-r['hi']))/2 for r in rr])),
                bothEndpointsWithinOne=float(np.mean([abs(r['predLo']-r['lo'])<=1 and abs(r['predHi']-r['hi'])<=1 for r in rr])),
                bothEndpointsExact=float(np.mean([r['predLo']==r['lo'] and r['predHi']==r['hi'] for r in rr])))
    return out


def rounding_sensitivity(rows):
    """Falsify a rounding story with competing, fixed rendering rules."""
    transforms = {
        'continuous':lambda a,b:(a,b),
        'floorBoth':lambda a,b:(math.floor(a),math.floor(b)),
        'ceilBoth':lambda a,b:(math.ceil(a),math.ceil(b)),
        'nearestBoth':lambda a,b:(math.floor(a+.5),math.floor(b+.5)),
        'outerBounds':lambda a,b:(math.floor(a),math.ceil(b)),
        'nearestMidpointCollapsed':lambda a,b:(math.floor((a+b)/2+.5),)*2,
    }
    out={}
    for name,convert in transforms.items():
        rr=[]
        for row in rows:
            a,b=convert(*row['pred']['Mstarstar'])
            rr.append(dict(row,predLo=a,predHi=b,point=(a+b)/2))
        out[name]=dict(**score(rr),
            midpointBias=float(np.mean([r['point']-(r['lo']+r['hi'])/2 for r in rr])),
            endpointMae=float(np.mean([(abs(r['predLo']-r['lo'])+abs(r['predHi']-r['hi']))/2 for r in rr])),
            bothEndpointsExact=float(np.mean([r['predLo']==r['lo'] and r['predHi']==r['hi'] for r in rr])))
    return out


def bootstrap_by_player(rows,n=5000):
    """Descriptive grouped bootstrap, not an independent prospective guarantee."""
    groups=collections.defaultdict(list)
    for r in rows:groups[r['player']].append(r)
    people=list(sorted(groups))
    data=[]
    for person in people:
        rr=groups[person]
        raw=rounded=0
        for r in rr:
            a,b=r['pred']['Mstarstar']
            raw += r['lo']<=(a+b)/2<=r['hi']
            rounded += r['lo']<=(math.floor(a+.5)+math.floor(b+.5))/2<=r['hi']
        data.append((len(rr),raw,rounded))
    samples=np.asarray(data,int)
    rng=np.random.default_rng(20260924)
    draws=rng.integers(0,len(people),size=(n,len(people)))
    z=samples[draws].sum(axis=1)
    raw=z[:,1]/z[:,0];rnd=z[:,2]/z[:,0]
    return dict(players=len(people),resamples=n,unit='player',
                raw95=[float(v) for v in np.quantile(raw,[.025,.975])],
                rounded95=[float(v) for v in np.quantile(rnd,[.025,.975])],
                roundedMinusRaw95=[float(v) for v in np.quantile(rnd-raw,[.025,.975])],
                caveat='Retrospective model-family selection is not captured by this bootstrap.')


def main():
    import argparse
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",required=True)
    ap.add_argument("--include-rows",action="store_true",
                    help="Add all observed/predicted rows for a local audit; omitted from the checked-in summary")
    args=ap.parse_args()
    rows=make_rows()
    result=dict(schema="card-only-trust-diagnostic-20260924-v1",pool=dict(events=len({r["event"] for r in rows}),
              rows=len(rows),players=len({r["player"] for r in rows}),digest=sm.pool_digest(sm.pool())),
              variantScores=variants(rows),selection=selective(rows),rounding=display_rounding(rows),
              roundingSensitivity=rounding_sensitivity(rows),
              rankDiagnostic=rank_diagnostic(rows),clusterBootstrap=bootstrap_by_player(rows),
              cautions=["Families and gates considered after inspecting the corpus: retrospective diagnostics.",
                        "Mstarstar shape and young-grey inherit earlier candidate selection; LOPO refits free constants only.",
                        "Selection never widens a game's physical [lo,hi] prediction and never reads the target outcome."])
    if args.include_rows: result['rows']=rows
    pathlib.Path(args.output).write_text(json.dumps(result,indent=2,allow_nan=False)+"\n")
    print(json.dumps({k:v for k,v in result.items() if k!='rows'},indent=2,allow_nan=False))


if __name__ == '__main__':main()
