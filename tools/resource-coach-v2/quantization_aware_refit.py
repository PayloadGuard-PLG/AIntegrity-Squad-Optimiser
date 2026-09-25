#!/usr/bin/env python3
"""Quantization-aware Resource Coach shape refit (research only).

Hypothesis: integer displayed endpoints are interval-censored observations of a
continuous latent endpoint. For nearest-integer rendering, displayed y implies
latent endpoint in [y-0.5, y+0.5). Fit the existing Mstar/Mstarstar equations
to those bands without adding any physical parameters.

Selected after the first fractional-settlement replay; therefore LOPO is
diagnostic and future frozen previews are required for validation.
"""
from __future__ import annotations
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
OUT_DEFAULT=ROOT/"calibration/fractional-settlement/quantization-aware-refit-20260924.json"

def load_sm():
    spec=importlib.util.spec_from_file_location("shape_models_quantized",HERE/"shape_models.py")
    sm=importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(sm)
    return sm

def censored_residual(pred, obs, tol=0.5):
    return np.sign(pred-obs)*np.maximum(np.abs(pred-obs)-tol,0.0)

def score(lo,hi,ol,oh,tol=0.5):
    pm=(lo+hi)/2; om=(ol+oh)/2
    nearest_lo=np.floor(lo+0.5); nearest_hi=np.floor(hi+0.5)
    npm=(nearest_lo+nearest_hi)/2
    endpoint_ok=(np.abs(lo-ol)<=tol) & (np.abs(hi-oh)<=tol)
    per_endpoint=np.r_[np.abs(lo-ol)<=tol,np.abs(hi-oh)<=tol]
    return {
      "n":int(len(lo)),
      "midpointMae":float(np.mean(np.abs(pm-om))),
      "endpointMae":float(np.mean((np.abs(lo-ol)+np.abs(hi-oh))/2)),
      "insideRate":float(np.mean((ol<=pm)&(pm<=oh))),
      "overlapRate":float(np.mean(np.maximum(lo,ol)<=np.minimum(hi,oh))),
      "nearestMidpointMae":float(np.mean(np.abs(npm-om))),
      "nearestInsideRate":float(np.mean((ol<=npm)&(npm<=oh))),
      "latentBandEndpointSatisfaction":float(np.mean(per_endpoint)),
      "latentBandRowSatisfaction":float(np.mean(endpoint_ok)),
      "meanCensoredEndpointViolation":float(np.mean(np.r_[
          np.maximum(np.abs(lo-ol)-tol,0.0),
          np.maximum(np.abs(hi-oh)-tol,0.0)
      ])),
    }

def fit_censored(sm,free,X,yg,tol=0.5):
    x0=[sm.START[k] for k in free]
    def objective(v):
        P=sm.params(dict(zip(free,v)))
        if P["K"]<=1:
            return 1e12
        lo,hi=sm.predict(P,X,yg)
        elo=censored_residual(lo,X.lo,tol)
        ehi=censored_residual(hi,X.hi,tol)
        return float(np.sum(elo*elo+ehi*ehi))
    opts={"maxiter":8000,"maxfev":8000,"xatol":1e-5,"fatol":1e-6,"adaptive":True}
    r=minimize(objective,x0,method="Nelder-Mead",options=opts)
    opts2={"maxiter":8000,"maxfev":8000,"xatol":1e-6,"fatol":1e-7,"adaptive":True}
    r=minimize(objective,r.x,method="Nelder-Mead",options=opts2)
    return {k:float(v) for k,v in zip(free,r.x)},float(r.fun)

def exact_fit(sm,name,X,yg):
    fitted=sm.fit(sm.FREE[name],X,yg)
    P=sm.params(fitted)
    lo,hi=sm.predict(P,X,yg)
    return fitted,lo,hi

def censored_fit(sm,name,X,yg,tol):
    fitted,loss=fit_censored(sm,sm.FREE[name],X,yg,tol)
    P=sm.params(fitted)
    lo,hi=sm.predict(P,X,yg)
    return fitted,loss,lo,hi

def concat(parts):
    return tuple(np.concatenate([x[i] for x in parts]) for i in range(4))

def run(tol=0.5):
    sm=load_sm()
    events=sm.pool()
    yg=sm.sa.young_grey_params()
    players=sorted({e["playerName"] for e in events})
    models={}
    for name in ("Mstar","Mstarstar"):
        # Full pool is descriptive only.
        X=sm.sa.Rows(events)
        exact_params,exact_lo,exact_hi=exact_fit(sm,name,X,yg)
        cens_params,cens_loss,cens_lo,cens_hi=censored_fit(sm,name,X,yg,tol)

        held_exact=[]; held_censored=[]
        fold_cens_params={k:[] for k in sm.FREE[name]}
        fold_exact_params={k:[] for k in sm.FREE[name]}
        for player in players:
            tr=[e for e in events if e["playerName"]!=player]
            te=[e for e in events if e["playerName"]==player]
            Xtr=sm.sa.Rows(tr); Xte=sm.sa.Rows(te)

            ep,elo,ehi=exact_fit(sm,name,Xtr,yg)
            cp,_,clo,chi=censored_fit(sm,name,Xtr,yg,tol)
            # Above predictions are on Xtr; apply fitted params to held-out Xte.
            elo,ehi=sm.predict(sm.params(ep),Xte,yg)
            clo,chi=sm.predict(sm.params(cp),Xte,yg)
            held_exact.append((elo,ehi,Xte.lo,Xte.hi))
            held_censored.append((clo,chi,Xte.lo,Xte.hi))
            for k in sm.FREE[name]:
                fold_exact_params[k].append(ep[k])
                fold_cens_params[k].append(cp[k])

        elo,ehi,eol,eoh=concat(held_exact)
        clo,chi,col,coh=concat(held_censored)
        models[name]={
          "free":sm.FREE[name],
          "fullPool":{
            "exactEndpointSse":{"params":exact_params,"score":score(exact_lo,exact_hi,X.lo,X.hi,tol)},
            "censoredEndpointLoss":{"params":cens_params,"loss":cens_loss,"score":score(cens_lo,cens_hi,X.lo,X.hi,tol)}
          },
          "lopo":{
            "exactEndpointSse":score(elo,ehi,eol,eoh,tol),
            "censoredEndpointLoss":score(clo,chi,col,coh,tol)
          },
          "foldParameterRanges":{
            "exact":{k:[min(v),max(v)] for k,v in fold_exact_params.items()},
            "censored":{k:[min(v),max(v)] for k,v in fold_cens_params.items()}
          }
        }
    return {
      "schemaVersion":"resource-coach-quantization-aware-refit-v1",
      "preregistration":"PREREG-20260924-QUANTIZATION-AWARE-REFIT",
      "status":"exploratory-post-renderer-replay",
      "tolerance":tol,
      "pool":{
        "events":len(events),
        "rows":sum(len(e["rows"]) for e in events),
        "players":len(players),
        "eventIdSha256":sm.pool_digest(events)
      },
      "models":models
    }

def report(r):
    lines=[
      "# Quantization-aware shape refit",
      "",
      f"Latent endpoint band: displayed y -> [y-{r['tolerance']}, y+{r['tolerance']}).",
      "No new physical model parameters are introduced.",
      ""
    ]
    for name,m in r["models"].items():
        e=m["lopo"]["exactEndpointSse"]; q=m["lopo"]["censoredEndpointLoss"]
        lines += [
          f"## {name}",
          "",
          f"- exact-SSE LOPO: MAE {e['midpointMae']:.4f}, endpoint MAE {e['endpointMae']:.4f}, inside {e['insideRate']:.1%}, latent-endpoint satisfaction {e['latentBandEndpointSatisfaction']:.1%}",
          f"- censored-loss LOPO: MAE {q['midpointMae']:.4f}, endpoint MAE {q['endpointMae']:.4f}, inside {q['insideRate']:.1%}, latent-endpoint satisfaction {q['latentBandEndpointSatisfaction']:.1%}",
          f"- nearest-rendered LOPO: exact fit {e['nearestMidpointMae']:.4f}/{e['nearestInsideRate']:.1%}, censored fit {q['nearestMidpointMae']:.4f}/{q['nearestInsideRate']:.1%}",
          ""
        ]
    return "\n".join(lines)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--tolerance",type=float,default=0.5)
    ap.add_argument("--out",type=Path,default=OUT_DEFAULT)
    ap.add_argument("--report",type=Path)
    args=ap.parse_args()
    r=run(args.tolerance)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(r,indent=2)+"\n",encoding="utf-8")
    txt=report(r)
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(txt+"\n",encoding="utf-8")
    print(txt)

if __name__=="__main__":
    main()
