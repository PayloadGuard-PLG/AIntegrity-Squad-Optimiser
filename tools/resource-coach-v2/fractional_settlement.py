#!/usr/bin/env python3
"""Research-only fractional settlement analysis.

No production predictor is imported or modified. This script reproduces the
frozen Haggag diagnostics and can score a CSV of Resource Coach continuous
endpoint predictions against integer observations under renderer hypotheses.

CSV columns for --resource-rows:
  predicted_lo,predicted_hi,observed_lo,observed_hi
Optional extra columns are preserved but ignored.
"""
from __future__ import annotations
import argparse, csv, json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
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
    return min(1.0, sum(binom_pmf(i,n,p) for i in range(n+1)
                        if binom_pmf(i,n,p) <= pk + 1e-15))

def stochastic_integer_support(mu: float):
    lo = math.floor(mu)
    hi = math.ceil(mu)
    f = mu - lo
    if lo == hi:
        return {lo: 1.0}
    return {lo: 1-f, hi: f}

def endpoint_probability(mu: float, observed: int) -> float:
    return stochastic_integer_support(mu).get(observed, 0.0)

def renderer_rows(path: Path):
    rows = list(csv.DictReader(path.open(newline="", encoding="utf-8")))
    out = {}
    hypotheses = ("continuous","floor","nearest","ceil","support")
    for h in hypotheses:
        errors=[]; inside=0; endpoint_errors=[]
        for r in rows:
            plo=float(r["predicted_lo"]); phi=float(r["predicted_hi"])
            olo=int(float(r["observed_lo"])); ohi=int(float(r["observed_hi"]))
            if h=="continuous":
                lo,hi=plo,phi
            elif h=="floor":
                lo,hi=math.floor(plo),math.floor(phi)
            elif h=="nearest":
                lo,hi=math.floor(plo+0.5),math.floor(phi+0.5)
            elif h=="ceil":
                lo,hi=math.ceil(plo),math.ceil(phi)
            else:
                lo,hi=math.floor(plo),math.ceil(phi)
            pm=(lo+hi)/2; om=(olo+ohi)/2
            errors.append(abs(pm-om))
            endpoint_errors.append((abs(lo-olo)+abs(hi-ohi))/2)
            inside += int(olo <= pm <= ohi)
        out[h]={
            "n":len(rows),
            "midpointMae":sum(errors)/len(errors) if errors else None,
            "endpointMae":sum(endpoint_errors)/len(endpoint_errors) if endpoint_errors else None,
            "insideRate":inside/len(rows) if rows else None
        }
    nll=0.0; impossible=0
    for r in rows:
        plo=float(r["predicted_lo"]); phi=float(r["predicted_hi"])
        olo=int(float(r["observed_lo"])); ohi=int(float(r["observed_hi"]))
        p1=endpoint_probability(plo,olo); p2=endpoint_probability(phi,ohi)
        if p1==0 or p2==0:
            impossible += 1
        else:
            nll -= math.log(p1)+math.log(p2)
    out["unbiased-stochastic-one-step"]={
        "n":len(rows),
        "impossibleRows":impossible,
        "endpointNegativeLogLikelihood":None if impossible else nll,
        "definition":"floor(mu)+Bernoulli(frac(mu)) independently at each endpoint"
    }
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    ap.add_argument("--resource-rows", type=Path)
    ap.add_argument("--json", action="store_true")
    args=ap.parse_args()
    d=json.loads(args.evidence.read_text(encoding="utf-8"))
    c=d["cleanSingleRunCondition"]
    result={
      "condition":{
        "n":c["n"],"loss1":c["loss1"],"loss2":c["loss2"],
        "pLoss2":c["loss2"]/c["n"],
        "wilson95":wilson(c["loss2"],c["n"]),
        "pVsConfiguredFraction035":exact_two_sided_binom(c["loss2"],c["n"],0.35),
        "lag1Correlation":c["lag1Correlation"],
        "fisherExactIndependenceP":c["fisherExactIndependenceP"]
      },
      "aggregate":{
        "runs":d["reconstruction"]["inferredTotalRuns"],
        "configuredExpectedLoss":d["reconstruction"]["configuredExpectedLossAt123Runs"],
        "visibleLoss":d["reconstruction"]["visibleConditionLoss"],
        "difference":d["reconstruction"]["visibleConditionLoss"]-d["reconstruction"]["configuredExpectedLossAt123Runs"]
      },
      "carry":{
        "condition":d["deterministicCarryTest"]["verdict"],
        "dribbling":d["statSettlement"]["constantCarryVerdict"]
      }
    }
    if args.resource_rows:
        result["resourceCoachRendererReplay"]=renderer_rows(args.resource_rows)
    if args.json:
        print(json.dumps(result,indent=2))
    else:
        print("Fractional settlement research replay")
        print(json.dumps(result,indent=2))
if __name__=="__main__":
    main()
