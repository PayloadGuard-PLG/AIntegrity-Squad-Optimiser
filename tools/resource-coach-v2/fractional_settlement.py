#!/usr/bin/env python3
"""Research-only fractional settlement analysis.

This module deliberately sits outside src/. It does not modify or replace the
production Resource Coach predictor. It has two jobs:

1. reproduce the Haggag fractional-condition/stat diagnostics;
2. replay discrete renderer hypotheses downstream of the existing frozen
   Resource Coach continuous response models.

The Resource Coach replay imports the repository's existing evidence loader and
shape-model code so it cannot silently substitute a different corpus.

Usage:
  python tools/resource-coach-v2/fractional_settlement.py --json
  python tools/resource-coach-v2/fractional_settlement.py --resource-pool --lopo \
      --out-dir /tmp/fractional-settlement --json
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT_EVIDENCE = ROOT / "calibration/fractional-settlement/haggag-20260924-summary.json"


def wilson(k: int, n: int, z: float = 1.959963984540054):
    p = k / n
    d = 1 + z*z/n
    c = (p + z*z/(2*n))/d
    h = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n))/d
    return c-h, c+h


def binom_pmf(k: int, n: int, p: float) -> float:
    return math.comb(n,k) * p**k * (1-p)**(n-k)


def exact_two_sided_binom(k: int, n: int, p: float) -> float:
    pk = binom_pmf(k,n,p)
    return min(1.0, sum(
        binom_pmf(i,n,p) for i in range(n+1)
        if binom_pmf(i,n,p) <= pk + 1e-15
    ))


def stochastic_integer_support(mu: float):
    lo = math.floor(mu)
    hi = math.ceil(mu)
    f = mu - lo
    if lo == hi:
        return {lo: 1.0}
    return {lo: 1-f, hi: f}


def endpoint_probability(mu: float, observed: int) -> float:
    return stochastic_integer_support(mu).get(observed, 0.0)


def _score_arrays(lo, hi, ol, oh):
    import numpy as np
    pm, om = (lo+hi)/2, (ol+oh)/2
    inter = np.maximum(0.0, np.minimum(hi,oh)-np.maximum(lo,ol))
    union = np.maximum(hi,oh)-np.minimum(lo,ol)
    return {
        "n": int(len(lo)),
        "midpointMae": float(np.mean(np.abs(pm-om))),
        "endpointMae": float(np.mean((np.abs(lo-ol)+np.abs(hi-oh))/2)),
        "insideRate": float(np.mean((ol <= pm) & (pm <= oh))),
        "overlapRate": float(np.mean(np.maximum(lo,ol) <= np.minimum(hi,oh))),
        "signedMidpointError": float(np.mean(pm-om)),
        "meanIoU": float(np.mean(np.where(union == 0, 1.0, inter/np.where(union == 0,1.0,union)))),
    }


def renderer_metrics(lo, hi, ol, oh):
    import numpy as np
    lo=np.asarray(lo,float); hi=np.asarray(hi,float)
    ol=np.asarray(ol,float); oh=np.asarray(oh,float)
    transforms = {
        "continuous": (lo,hi),
        "floor": (np.floor(lo),np.floor(hi)),
        "nearest": (np.floor(lo+0.5),np.floor(hi+0.5)),
        "ceil": (np.ceil(lo),np.ceil(hi)),
        "support": (np.floor(lo),np.ceil(hi)),
    }
    out={k:_score_arrays(a,b,ol,oh) for k,(a,b) in transforms.items()}

    probs=[]; frac=[]; ceil_obs=[]; distances=[]; impossible_rows=0
    for a,b,c,d in zip(lo,hi,ol,oh):
        row_possible=True
        for mu,y in ((a,int(c)),(b,int(d))):
            supp=stochastic_integer_support(float(mu))
            p=supp.get(y,0.0)
            if p == 0.0:
                row_possible=False
            else:
                probs.append(p)
                fl=math.floor(mu); ce=math.ceil(mu)
                if fl != ce:
                    frac.append(mu-fl)
                    ceil_obs.append(1.0 if y == ce else 0.0)
            distances.append(min(abs(y-k) for k in supp))
        impossible_rows += int(not row_possible)
    n_end=2*len(lo)
    impossible_end=sum(1 for d in distances if d > 0)
    out["stochastic-one-step"]={
        "nRows":int(len(lo)),
        "nEndpoints":int(n_end),
        "impossibleRows":int(impossible_rows),
        "impossibleEndpoints":int(impossible_end),
        "endpointSupportRate":float(1-impossible_end/n_end) if n_end else None,
        "rowSupportRate":float(1-impossible_rows/len(lo)) if len(lo) else None,
        "meanDistanceToSupport":float(sum(distances)/len(distances)) if distances else None,
        "supportedEndpointNll":float(-sum(math.log(max(p,1e-300)) for p in probs)) if probs else None,
        "supportedEndpointMeanNll":float(-sum(math.log(max(p,1e-300)) for p in probs)/len(probs)) if probs else None,
        "fractionalCeilMeanPredicted":float(sum(frac)/len(frac)) if frac else None,
        "fractionalCeilMeanObserved":float(sum(ceil_obs)/len(ceil_obs)) if ceil_obs else None,
        "fractionalBrier":float(sum((p-y)**2 for p,y in zip(frac,ceil_obs))/len(frac)) if frac else None,
        "definition":"floor(mu)+Bernoulli(frac(mu)); endpoint support is {floor(mu),ceil(mu)}"
    }
    return out


def renderer_rows(path: Path):
    rows=list(csv.DictReader(path.open(newline="",encoding="utf-8")))
    req=("predicted_lo","predicted_hi","observed_lo","observed_hi")
    for k in req:
        if rows and k not in rows[0]:
            raise ValueError(f"missing CSV column {k}")
    return renderer_metrics(
        [float(r["predicted_lo"]) for r in rows],
        [float(r["predicted_hi"]) for r in rows],
        [float(r["observed_lo"]) for r in rows],
        [float(r["observed_hi"]) for r in rows],
    )


def _load_shape_models():
    spec=importlib.util.spec_from_file_location("shape_models_fractional", HERE/"shape_models.py")
    sm=importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(sm)
    return sm


def _concat(parts):
    import numpy as np
    return tuple(np.concatenate([p[i] for p in parts]) for i in range(4))


def resource_pool_replay(lopo: bool):
    """Replay frozen response models with renderer variants.

    Full-pool scoring uses the frozen constants verbatim.
    LOPO refits only the already-declared upstream free parameters inside each
    training fold, then applies every renderer to the identical held-out
    continuous predictions. Renderer comparison therefore cannot change the
    physics model to compensate for rounding.
    """
    import numpy as np
    sm=_load_shape_models()
    ev=sm.pool()
    yg=sm.sa.young_grey_params()
    frozen=sm.load_frozen()
    X=sm.sa.Rows(ev)

    model_names=["YG","M1","Mstar","Mstarstar"]
    full={}
    for name in model_names:
        if name=="YG":
            lo,hi=sm.sa.predict_young_grey(dict(sm.sa.BASE),X,yg)
        else:
            P=sm.params(frozen["models"][name]["fitted"])
            lo,hi=sm.predict(P,X,yg)
        full[name]=renderer_metrics(lo,hi,X.lo,X.hi)

    out={
        "pool":{
            "events":len(ev),
            "rows":int(len(X.lo)),
            "players":len({e["playerName"] for e in ev}),
            "eventIdSha256":sm.pool_digest(ev),
        },
        "fullPoolFrozen":full,
        "lopo":None,
    }
    if not lopo:
        return out

    players=sorted({e["playerName"] for e in ev})
    held={name:[] for name in model_names}
    fold_fits={name:{} for name in model_names if name!="YG"}
    for player in players:
        tr=[e for e in ev if e["playerName"] != player]
        te=[e for e in ev if e["playerName"] == player]
        Xtr=sm.sa.Rows(tr); Xte=sm.sa.Rows(te)
        lo,hi=sm.sa.predict_young_grey(dict(sm.sa.BASE),Xte,yg)
        held["YG"].append((lo,hi,Xte.lo,Xte.hi))
        for name in ("M1","Mstar","Mstarstar"):
            fitted=sm.fit(sm.FREE[name],Xtr,yg)
            fold_fits[name][player]=fitted
            P=sm.params(fitted)
            lo,hi=sm.predict(P,Xte,yg)
            held[name].append((lo,hi,Xte.lo,Xte.hi))

    lopo_out={}
    for name in model_names:
        lo,hi,ol,oh=_concat(held[name])
        lopo_out[name]=renderer_metrics(lo,hi,ol,oh)
    out["lopo"]={
        "players":len(players),
        "models":lopo_out,
        "fitPolicy":"For M1/Mstar/Mstarstar, refit only their preregistered upstream parameters on all other players; YG is frozen. Every renderer sees the same held-out continuous predictions.",
    }
    # Do not dump 30 folds x parameters into the primary report; a digest-like
    # compact range is enough to detect pathological fold fits.
    out["lopo"]["fitRanges"]={
        name:{p:[
            min(fold_fits[name][pl][p] for pl in players),
            max(fold_fits[name][pl][p] for pl in players)
        ] for p in sm.FREE[name]}
        for name in ("M1","Mstar","Mstarstar")
    }
    return out


def markdown_report(result):
    lines=[
        "# Fractional settlement replay",
        "",
        "Research-only downstream renderer comparison. Upstream production code is untouched.",
        "",
        "## Haggag condition",
        "",
    ]
    c=result["condition"]
    lines += [
        f"- clean single-run transitions: {c['n']} ({c['loss1']} x -1, {c['loss2']} x -2)",
        f"- P(-2): {c['pLoss2']:.4f}; configured fractional part: 0.35",
        f"- exact binomial p vs 0.35: {c['pVsConfiguredFraction035']:.4f}",
        f"- Wilson 95%: [{c['wilson95'][0]:.4f}, {c['wilson95'][1]:.4f}]",
        f"- aggregate 123-run expected/visible loss: {result['aggregate']['configuredExpectedLoss']:.2f} / {result['aggregate']['visibleLoss']}",
        "",
    ]
    rc=result.get("resourceCoachPool")
    if rc:
        lines += ["## Resource Coach renderer replay","","### Full frozen pool",""]
        for name,m in rc["fullPoolFrozen"].items():
            lines.append(
                f"- **{name}** continuous MAE {m['continuous']['midpointMae']:.3f}, "
                f"nearest {m['nearest']['midpointMae']:.3f}, support {m['support']['midpointMae']:.3f}; "
                f"one-step endpoint support {m['stochastic-one-step']['endpointSupportRate']:.1%}"
            )
        if rc.get("lopo"):
            lines += ["","### Leave-one-player-out",""]
            for name,m in rc["lopo"]["models"].items():
                s=m["stochastic-one-step"]
                lines.append(
                    f"- **{name}** continuous MAE {m['continuous']['midpointMae']:.3f} / inside {m['continuous']['insideRate']:.1%}; "
                    f"nearest MAE {m['nearest']['midpointMae']:.3f} / inside {m['nearest']['insideRate']:.1%}; "
                    f"support MAE {m['support']['midpointMae']:.3f} / inside {m['support']['insideRate']:.1%}; "
                    f"one-step endpoint support {s['endpointSupportRate']:.1%}, row support {s['rowSupportRate']:.1%}"
                )
    return "\n".join(lines)+"\n"


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--evidence",type=Path,default=DEFAULT_EVIDENCE)
    ap.add_argument("--resource-rows",type=Path)
    ap.add_argument("--resource-pool",action="store_true")
    ap.add_argument("--lopo",action="store_true")
    ap.add_argument("--out-dir",type=Path)
    ap.add_argument("--json",action="store_true")
    args=ap.parse_args()

    d=json.loads(args.evidence.read_text(encoding="utf-8"))
    c=d["cleanSingleRunCondition"]
    result={
        "schemaVersion":"fractional-settlement-replay-v1",
        "condition":{
            "n":c["n"],"loss1":c["loss1"],"loss2":c["loss2"],
            "pLoss2":c["loss2"]/c["n"],
            "wilson95":wilson(c["loss2"],c["n"]),
            "pVsConfiguredFraction035":exact_two_sided_binom(c["loss2"],c["n"],0.35),
            "lag1Correlation":c["lag1Correlation"],
            "fisherExactIndependenceP":c["fisherExactIndependenceP"],
        },
        "aggregate":{
            "runs":d["reconstruction"]["inferredTotalRuns"],
            "configuredExpectedLoss":d["reconstruction"]["configuredExpectedLossAt123Runs"],
            "visibleLoss":d["reconstruction"]["visibleConditionLoss"],
            "difference":d["reconstruction"]["visibleConditionLoss"]-d["reconstruction"]["configuredExpectedLossAt123Runs"],
        },
        "carry":{
            "condition":d["deterministicCarryTest"]["verdict"],
            "dribbling":d["statSettlement"]["constantCarryVerdict"],
        },
    }
    if args.resource_rows:
        result["resourceCoachCsvReplay"]=renderer_rows(args.resource_rows)
    if args.resource_pool:
        result["resourceCoachPool"]=resource_pool_replay(args.lopo)

    if args.out_dir:
        args.out_dir.mkdir(parents=True,exist_ok=True)
        (args.out_dir/"fractional-settlement.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
        (args.out_dir/"REPORT.md").write_text(markdown_report(result),encoding="utf-8")
    if args.json:
        print(json.dumps(result,indent=2))
    else:
        print(markdown_report(result))


if __name__=="__main__":
    main()
