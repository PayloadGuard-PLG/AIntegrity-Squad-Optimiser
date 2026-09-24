#!/usr/bin/env python3
"""Research-only drill/coach cross-system test. Never writes production files.

Uses ordered Drive sheet snapshot (including gaps), the pinned ordinary-coach
loader, and player-disjoint fits. The target preview is an answer key only.
"""
from __future__ import annotations
import argparse
import collections
import itertools
import json
import math
from pathlib import Path
import sys

import numpy as np
from scipy.optimize import minimize_scalar

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import shape_models as sm

sa = sm.sa
EVIDENCE = ROOT / "calibration/fractional-settlement"
RAW = EVIDENCE / "haggag-ordered-raw-20260924.json"
HAG = EVIDENCE / "haggag-20260924-summary.json"
CRI = ROOT / "calibration/resource-coach-identification"

def read():
    raw = json.loads(RAW.read_text())
    h = raw["sequence"]["header"]
    rows = [dict(zip(h, r)) for r in raw["sequence"]["rows"]]
    return raw, rows, json.loads(HAG.read_text())

def condition_check(rows):
    clean, pair_counts, adjacent = [], collections.Counter(), []
    prev = None
    for r in rows:
        typ = r.get("event_type")
        try:
            loss = -float(r.get("delta_from_prev_capture", ""))
            cond = float(r.get("condition_pct", ""))
            order = float(r["event_order"])
        except (ValueError, TypeError):
            loss = cond = order = None
        if typ == "training_report" and loss in (1,2) and cond is not None:
            # A report following a recovery cannot establish a one-run delta.
            if prev is not None and prev["type"] == "training_report" and prev["loss"] in (1,2) and prev["order"] + 1 == order and abs(prev["cond"]-cond-loss)<1e-8:
                pair_counts[(int(prev["loss"]),int(loss))] += 1
                if prev["loss"] == loss == 2:
                    adjacent.append([prev["id"],r["record_id"]])
            clean.append([r["record_id"], int(loss)])
        prev = dict(id=r["record_id"],type=typ,loss=loss,cond=cond,order=order)
    # The first captured report following a recovery is not an independently
    # witnessed single run; keep it in raw but exclude from frequency analysis.
    ambiguous = {"HAG-R051","HAG-R098"}
    frequency = [x for x in clean if x[0] not in ambiguous]
    c = collections.Counter(x[1] for x in frequency)
    return dict(rawCleanCandidates=len(clean),frequencyAdmissible=len(frequency),
                losses=dict(one=c[1],two=c[2]),adjacentPairs={str(k):v for k,v in sorted(pair_counts.items())},
                adjacentTwos=adjacent,carryFalsified=bool(adjacent),
                caveat="Clean frequency excludes first post-recovery captures; paired evidence is verified by adjacent report order and integer state differences.")

def choose(n,k):
    return math.comb(n,k)

def gap_probability(first,last,k,width):
    # Condition on first/last gain positions. Remaining k-2 positions uniform.
    # Count positive gap compositions with observed range <= width.
    span=last-first
    gaps=k-1
    count=0
    for minimum in range(1,span//gaps+1):
        def walk(i,total,found_min):
            nonlocal count
            if i==gaps:
                count += int(total==span and found_min)
                return
            for d in range(minimum,minimum+width+1):
                if total+d+(gaps-i-1)*minimum>span: continue
                if total+d+(gaps-i-1)*(minimum+width)<span: continue
                walk(i+1,total+d,found_min or d==minimum)
        walk(0,0,False)
    return count/choose(span-1,k-2)

def ordered_stat_checks(hag, rows):
    g=hag["statSettlement"]["directGainRuns"]
    D=g["DRIBBLING"]; F=g["FINISHING"]
    gaps=[b-a for a,b in zip(D,D[1:])]
    windows={d+lag for d in D for lag in (1,2)}
    shift_hits=[]
    for shift in range(123):
        shifted=[(f+shift-1)%123+1 for f in F]
        shift_hits.append(sum(f in windows for f in shifted))
    # No Bernoulli independence claim when gains share drill/session state.
    return dict(directEvents=g,dribblingGaps=gaps,
                independentFixedEndpointP=gap_probability(D[0],D[-1],len(D),max(gaps)-min(gaps)),
                followingOneOrTwo=sum(f in windows for f in F),
                totalFinishingReports=len(F),
                circularShiftP=sum(v>=len(F) for v in shift_hits)/len(shift_hits),
                independentPlacementP=choose(len(windows),len(F))/choose(123,len(F)),
                candidateMissingFinishingWindow="After HAG-R095 (+1 DRIBBLING), the HAG-R096 -3 condition capture gap spans >1 run; it could contain the unrendered FINISHING +1, but no such event is directly observed.",
                endpointGains=hag["player"]["endpointGains"],
                directlyRenderedPoints=hag["statSettlement"]["directRenderedPoints"])

def H(x,h,K):
    if x<=h: return x
    return h+K*math.expm1((x-h)/K)

def drill_constraints(h,K,alpha=1.0,step=0.025):
    """Necessary chronology + final-card interval constraints.

    A fixed per-stat starting fraction f in [0,1) and an arbitrary monotone,
    shared cumulative session dose Q are allowed. alpha is the ratio of
    Finishing to Dribbling drill allocation, not a coach coefficient.
    One missed Finishing report may occupy any of its eight ordinal positions.
    This cannot identify time-dependent dose or stochastic settlement.
    """
    seq=[(t,"D",i+1) for i,t in enumerate([9,22,35,50,66,80,97,112])]
    seq += [(t,"F",i+1) for i,t in enumerate([11,23,36,51,67,82,114])]
    seq.sort()
    hits=[]
    phases=np.arange(step/2,1,step)
    for fd in phases:
        bD=H(102+fd,h,K)
        d=[H(102+k,h,K)-bD for k in range(1,10)]
        for ff in phases:
            bF=H(121+ff,h,K)
            f=[(H(121+k,h,K)-bF)/alpha for k in range(1,10)]
            lower=max(d[7],f[7])
            upper=min(d[8],f[8])
            if lower >= upper: continue
            for skip in range(1,9):
                last=-1.0; valid=True
                for _,stat,k in seq:
                    effective=k+(k>=skip) if stat=="F" else k
                    q=f[effective-1] if stat=="F" else d[effective-1]
                    if q<=last+1e-10: valid=False; break
                    last=q
                if valid and skip==7 and not (d[6]<f[6]<d[7]):
                    valid=False
                if valid: hits.append([round(fd,3),round(ff,3),skip,round(lower,3),round(upper,3)])
    return dict(feasible=bool(hits),phaseCombinations=len(hits),
                skipPositions=sorted(set(z[2] for z in hits)),example=hits[0] if hits else None)

def groups(errors, key):
    bins=collections.defaultdict(list)
    for x in errors: bins[key(x)].append(x["error"])
    return {str(k):dict(n=len(v),signedMean=float(np.mean(v)),mae=float(np.mean(np.abs(v))))
            for k,v in sorted(bins.items(),key=lambda p:str(p[0]))}

def role_map():
    out={}
    slugs=["ferguson","kawa","rodger","midgley","ljdark-leo","panic","king-alfie","andonov","cieran-morgan","blakie"]
    for slug in slugs:
        j=json.loads((CRI / ("control-card-20260924-"+slug+".json")).read_text())
        out[j["name"]]=j.get("roles",[])
    x=json.loads((CRI/"prospective-input-20260924-standard-safeguard-x59-skill.json").read_text())
    for t in x["tests"]: out[t["player"]["name"]]=t["player"].get("roles",[])
    return out

def score_events(events,P,yg,white_shape=None):
    X=sa.Rows(events)
    lo,hi=sm.predict(P,X,yg)
    if white_shape is not None:
        h,K=white_shape
        u,_,B,rho=sa._parts(P,X)
        wl=sa.movement(u,h,K,B)
        wh=sa.movement(u,h,K,B*rho)
        lo=np.where(X.w,wl,lo)
        hi=np.where(X.w,wh,hi)
    return X,lo,hi

def metrics(X,lo,hi):
    midpoint=(lo+hi)/2
    true=(X.lo+X.hi)/2
    return dict(n=len(midpoint),mae=float(np.mean(abs(midpoint-true))),
                endpointMae=float(np.mean((abs(lo-X.lo)+abs(hi-X.hi))/2)),
                inside=float(np.mean((midpoint>=X.lo)&(midpoint<=X.hi))),
                signed=float(np.mean(midpoint-true)))

def fit_scale(training,P,yg,white_shape):
    X=sa.Rows(training)
    def loss(z):
        Q=dict(P,logC=P["logC"]+z)
        _,lo,hi=score_events(training,Q,yg,white_shape)
        return float(np.sum((lo-X.lo)**2+(hi-X.hi)**2))
    r=minimize_scalar(loss,bounds=(-0.8,0.8),method="bounded",
                      options={"xatol":1e-4})
    return float(r.x)

def residual_detail(events,P,yg):
    roles=role_map()
    rows=[]
    for e in events:
        X,lo,hi=score_events([e],P,yg)
        for j,r in enumerate(e["rows"]):
            u=float(X.s[j]-X.delta[j]*X.w[j])
            err=float((lo[j]+hi[j]-X.lo[j]-X.hi[j])/2)
            role=roles.get(e["playerName"])
            rows.append(dict(event=e["event"],player=e["playerName"],partition=e["partition"],
                             stat=r["stat"],s=float(X.s[j]),u=u,age=e["age"],tier=e["tier"],
                             cls=r["cls"],p=e["p"],family=e["fam"],
                             role=("multi" if len(role)>1 else role[0]) if role else "unknown",
                             error=err))
    return rows

def residual_summary(rows):
    return dict(n=len(rows),
        statValue=groups(rows,lambda x: "<100" if x["s"]<100 else "100-139" if x["s"]<140 else "140-199" if x["s"]<200 else "200+"),
        coordinate=groups(rows,lambda x: "<80" if x["u"]<80 else "80-119" if x["u"]<120 else "120-159" if x["u"]<160 else "160+"),
        age=groups(rows,lambda x: "18-21" if x["age"]<=21 else "22-25" if x["age"]<=25 else "26-29" if x["age"]<=29 else "30+"),
        tier=groups(rows,lambda x:x["tier"]),cls=groups(rows,lambda x:x["cls"]),
        affectedCount=groups(rows,lambda x:x["p"]),
        family=groups(rows,lambda x:x["family"]),
        role=groups(rows,lambda x:x["role"]),
        roleCoverage=sum(x["role"]!="unknown" for x in rows),
        largest=[{k:v for k,v in row.items() if k in ("event","player","stat","s","u","age","tier","cls","error")}
                 for row in sorted(rows,key=lambda x:abs(x["error"]),reverse=True)[:20]])

def evaluate(events,yg,candidates):
    labels=["M1","Mstar","Mstarstar"]+list(candidates)
    allpred={k:[] for k in labels}
    for player in sorted({e["playerName"] for e in events}):
        train=[e for e in events if e["playerName"]!=player]
        test=[e for e in events if e["playerName"]==player]
        Xtr=sa.Rows(train)
        fits={name:sm.params(sm.fit(sm.FREE[name],Xtr,yg)) for name in ("M1","Mstar","Mstarstar")}
        for label in labels:
            if label in fits:
                X,lo,hi=score_events(test,fits[label],yg)
            else:
                shape=candidates[label]
                z=fit_scale(train,fits["M1"],yg,shape)
                X,lo,hi=score_events(test,dict(fits["M1"],logC=fits["M1"]["logC"]+z),yg,shape)
            allpred[label].append((player,test,X,lo,hi))
    output={}
    for label,folds in allpred.items():
        bypart=collections.defaultdict(list); allrows=[]
        for player,test,X,lo,hi in folds:
            index=0
            for e in test:
                for r in e["rows"]:
                    d=dict(player=player,partition=e["partition"],lo=float(lo[index]),hi=float(hi[index]),
                           ol=float(X.lo[index]),oh=float(X.hi[index]))
                    bypart[e["partition"]].append(d);allrows.append(d);index+=1
        def summarize(rr):
            a=np.asarray([[x["lo"],x["hi"],x["ol"],x["oh"]] for x in rr])
            pred=a[:,:2].mean(axis=1);obs=a[:,2:].mean(axis=1)
            return dict(n=len(rr),mae=float(np.mean(abs(pred-obs))),
                endpointMae=float(np.mean((abs(a[:,0]-a[:,2])+abs(a[:,1]-a[:,3]))/2)),
                inside=float(np.mean((pred>=a[:,2])&(pred<=a[:,3]))),
                signed=float(np.mean(pred-obs)))
        output[label]=dict(all=summarize(allrows),
            prospectiveX59=summarize(bypart["prospective-x59"]),
            controls=summarize(bypart["control"]))
    return output

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",required=True)
    args=ap.parse_args()
    raw,rows,hag=read()
    ev=sm.pool()
    if sm.pool_digest(ev)!=sm.load_frozen()["pool"]["eventIdSha256"]:
        raise RuntimeError("Coach pool changed; stop before scoring")
    yg=sa.young_grey_params()
    M1=sm.params(sm.load_frozen()["models"]["M1"]["fitted"])
    MS=sm.params(sm.load_frozen()["models"]["Mstar"]["fitted"])
    candidates={"drill_flat_white":(1e6,35.),
                "drill_early_white":(100.,70.),
                "drill_transition_white":(120.,35.),
                "drill_late_white":(130.,35.)}
    drill={name:dict(equalAllocation=drill_constraints(*v),
                     allocationIntervals={str(alpha):drill_constraints(*v,alpha=alpha,step=.05)
                                          for alpha in (.8,1.,1.2,1.4)})
           for name,v in candidates.items()}
    detail=residual_detail(ev,MS,yg)
    output=dict(schema="drill-coach-cross-transfer-v1",
                source=raw["source"],poolDigest=sm.pool_digest(ev),
                drill=dict(condition=condition_check(rows),stats=ordered_stat_checks(hag,rows),
                           mechanisms=drill),
                coach=dict(frozenM1=metrics(*score_events(ev,M1,yg)),
                           frozenMstar=metrics(*score_events(ev,MS,yg)),
                           residuals=residual_summary(detail),
                           playerHeldOut=evaluate(ev,yg,candidates)),
                caveats=["123 runs is a minimum reconstruction, not an observed run counter.",
                         "One player, one drill, three affected stats: response and drill allocation are not separately identified.",
                         "The newer control/earlier prospective partitions existed before candidate selection; the score is retrospective transfer, not a fresh blind test.",
                         "White geometry only is transferred; grey response retains coach baseline due to lack of drill identification.",
                         "All coach fits and the extra amplitude scale exclude the entire target player."])
    Path(args.output).write_text(json.dumps(output,indent=2)+"\n")
    print(json.dumps(dict(drill=output["drill"]["stats"],
         condition=output["drill"]["condition"],
         drillFeasibility={k:v["equalAllocation"] for k,v in drill.items()},
         coachScores=output["coach"]["playerHeldOut"],
         residuals=output["coach"]["residuals"]),indent=2))

if __name__=="__main__":
    main()
