#!/usr/bin/env python3
"""Score PREREG-20260924-YOUNG-GREY-ANCHOR against the predictions frozen at 5e42483.

Reads only committed files: each player's control card, the frozen YGA predictions and the observation.
Nothing is refitted and the anchor table is not rebuilt. The implied dose (YG shape, free budget multiplier)
is a diagnostic only and never enters the verdict.

Usage:
  python tools/resource-coach-v2/score_young_grey_anchor.py \
      --out calibration/resource-coach-identification/control-score-20260924-young-grey-anchor.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import pathlib

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CRI = ROOT / "calibration" / "resource-coach-identification"

spec = importlib.util.spec_from_file_location("freeze_young_grey_anchor", HERE / "freeze_young_grey_anchor.py")
fya = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fya)
sa = fya.sa

PLAYERS = ["king-alfie", "andonov", "cieran-morgan", "blakie"]
MODELS = ("YG", "YGA", "YGA_ungated", "YGA127")
FROZEN_AT = "5e42483"
MIN_ROWS, MIN_PLAYERS, MARGIN, CELL_SHARE = 20, 3, 0.2, 2 / 3


def _score(pred, obs):
    lo = np.array([p[0] for p in pred], float); hi = np.array([p[1] for p in pred], float)
    ol = np.array([o[0] for o in obs], float); oh = np.array([o[1] for o in obs], float)
    return sa.score(lo, hi, ol, oh)


def implied_dose(card, key, observed, yg):
    c = fya.COACHES[key]
    rows = [dict(stat=s, s=float(card["stats"][s]), cls=card["classes"][s], g=[float(v[0]), float(v[1])]) for s, v in observed.items()]
    ev = sa._event(event=f"SCORE-{key}", playerName=card["name"], partition="control", family=c["family"], coach=c["label"],
                   N=float(c["N"]), p=len(rows), age=int(card["age"]), tier=card["tier"], evidence="control-preview", rows=rows)
    return math.exp(fya.yg_offset(ev, yg))


def score_player(slug, yg):
    card = json.loads((CRI / f"control-card-20260924-{slug}.json").read_text(encoding="utf-8"))
    obs = json.loads((CRI / f"control-observation-20260924-{slug}.json").read_text(encoding="utf-8"))
    pred = json.loads((CRI / f"control-predictions-20260924-yga-{slug}.json").read_text(encoding="utf-8"))
    assert obs["predictionsFrozenAtCommit"] == FROZEN_AT and obs["startValuesMatchFrozenCard"]
    arm = "primary" if int(card["age"]) >= fya.ANCHOR_MIN_AGE else "secondary"
    out = dict(player=card["name"], age=card["age"], tier=card["tier"], roles=card["roles"], arm=arm, perCoach={}, rows=[])
    for key, observed in obs["statIntervals"].items():
        c = next(c for c in pred["coaches"] if c["key"] == key)
        if c["p"] != len(observed):
            out["perCoach"][key] = dict(protocolDeviation=f"registered p={c['p']}, observed p={len(observed)}; recorded, not scored")
            continue
        by = {s["stat"]: s for s in c["statIntervals"]}
        stats = list(observed)
        o = [observed[s] for s in stats]
        entry = dict(p=len(stats), stats=stats, anchorApplied=c["anchorApplied"])
        for m in MODELS:
            entry[m] = _score([(by[s][m]["rawLo"], by[s][m]["rawHi"]) for s in stats], o)
        entry["impliedDoseVsYG"] = round(implied_dose(card, key, observed, yg), 4)
        entry["anchorDose"] = round(math.exp(c["anchor"]["logOffset"]), 4)
        out["perCoach"][key] = entry
        out["rows"] += [dict(coach=key, stat=s, start=card["stats"][s], cls=card["classes"][s], observed=observed[s],
                             **{m: [by[s][m]["rawLo"], by[s][m]["rawHi"]] for m in MODELS}) for s in stats]
    out["pooled"] = {m: _score([r[m] for r in out["rows"]], [r["observed"] for r in out["rows"]]) for m in MODELS}
    return out


def pooled(players, model):
    rows = [r for p in players for r in p["rows"]]
    return _score([r[model] for r in rows], [r["observed"] for r in rows])


def verdict(primary):
    rows = sum(len(p["rows"]) for p in primary)
    n_players = sum(1 for p in primary if p["rows"])
    yg, yga = pooled(primary, "YG")["midpointMae"], pooled(primary, "YGA")["midpointMae"]
    cells = [(p["player"], k, e["YGA"]["midpointMae"] < e["YG"]["midpointMae"])
             for p in primary for k, e in p["perCoach"].items() if "YG" in e]
    wins = sum(w for *_, w in cells)
    if rows < MIN_ROWS or n_players < MIN_PLAYERS:
        v = f"inconclusive (minimum not met: {rows} rows from {n_players} players)"
    elif yga >= yg:
        v = "falsifies YGA"
    elif yga <= yg - MARGIN and wins >= CELL_SHARE * len(cells):
        v = "supports YGA"
    else:
        v = "inconclusive"
    return dict(rows=rows, players=n_players, mae=dict(YG=yg, YGA=yga), cells=len(cells), ygaWins=wins,
                cellWinShare=wins / len(cells) if cells else None, verdict=v,
                cellTable=[dict(player=a, coach=b, ygaBetter=w) for a, b, w in cells])


def secondary(players):
    rows = [r for p in players for r in p["rows"]]
    test = [r for r in rows if r["cls"] == "MID_GREY" and r["start"] < 80]
    return dict(rows=len(rows), YG=pooled(players, "YG") if rows else None,
                YGA_ungated=pooled(players, "YGA_ungated") if rows else None,
                youngGreyRetestRows=len(test),
                youngGreyRetest="untestable: no MID_GREY row below the knot (80), where YG and the frozen model are identical"
                if not test else "see rows")


def global_dose_posthoc(scored):
    """POST HOC, not in the decision rule: one coach-agnostic dose from the FROZEN anchor table (no new data).

    Asks whether the YGA gain is coach-specific or a general level shift at these ages. Any use of it must be
    pre-registered and tested on new players first.
    """
    table = json.loads(fya.ANCHOR_TABLE.read_text(encoding="utf-8"))
    yg = dict(g=table["youngGrey"]["g"], knot=table["youngGrey"]["knot"], ageBand=tuple(table["youngGrey"]["ageBand"]))
    out = {}
    for label, keep in (("allAges", lambda e: True), ("age22plus", lambda e: e["age"] >= fya.ANCHOR_MIN_AGE)):
        prim = [p for p in scored if p["arm"] == "primary"]
        names = {p["player"] for p in prim}
        offs = [e["logOffset"] for c in table["coaches"].values() for e in c["events"] if keep(e) and e["player"] not in names]
        P = dict(sa.BASE, logC=sa.BASE["logC"] + float(np.mean(offs)))
        preds, obs, wins, cells = [], [], 0, 0
        for p in prim:
            card = json.loads((CRI / f"control-card-20260924-{slugs[p['player']]}.json").read_text(encoding="utf-8"))
            for key, e in p["perCoach"].items():
                if "YG" not in e:
                    continue
                c = fya.COACHES[key]
                rows = [r for r in p["rows"] if r["coach"] == key]
                ev = sa._event(event=f"POSTHOC-{key}", playerName=card["name"], partition="control", family=c["family"], coach=c["label"],
                               N=float(c["N"]), p=len(rows), age=int(card["age"]), tier=card["tier"], evidence="control-preview",
                               rows=[dict(stat=r["stat"], s=float(r["start"]), cls=r["cls"], g=[float(v) for v in r["observed"]]) for r in rows])
                lo, hi = sa.predict_young_grey(P, sa.Rows([ev]), yg)
                pr = list(zip(lo.tolist(), hi.tolist()))
                cells += 1
                wins += _score(pr, [r["observed"] for r in rows])["midpointMae"] < e["YG"]["midpointMae"]
                preds += pr; obs += [r["observed"] for r in rows]
        out[label] = dict(anchorEvents=len(offs), dose=round(math.exp(float(np.mean(offs))), 4), primaryArm=_score(preds, obs),
                          betterThanYGInCells=f"{wins}/{cells}")
    return out


slugs = {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    yg = fya.yg_params()
    scored = [score_player(s, yg) for s in PLAYERS]
    slugs.update({p["player"]: s for p, s in zip(scored, PLAYERS)})
    prim = [p for p in scored if p["arm"] == "primary"]
    sec = [p for p in scored if p["arm"] == "secondary"]
    res = dict(schemaVersion="resource-coach-control-score-v1", preregistration="PREREG-20260924-YOUNG-GREY-ANCHOR",
               predictionsFrozenAtCommit=FROZEN_AT, decision=verdict(prim), secondaryArm=secondary(sec),
               exploratory={m: pooled(prim, m) for m in MODELS}, postHocGlobalDose=global_dose_posthoc(scored), players=scored)
    pathlib.Path(args.out).write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for p in scored:
        print(f"{p['player']} ({p['age']}, {p['tier']}, {p['arm']})  " + "  ".join(
            f"{m} {p['pooled'][m]['midpointMae']:.2f}" for m in MODELS) + f"  [{len(p['rows'])} rows]")
        for k, e in p["perCoach"].items():
            if "YG" not in e:
                print(f"   {k}: {e}"); continue
            print(f"   {k:16s} YG {e['YG']['midpointMae']:5.2f} ({100*e['YG']['pointInsideRate']:3.0f}% in, {e['YG']['signedResidual']:+.2f})  "
                  f"YGA {e['YGA']['midpointMae']:5.2f} ({e['YGA']['signedResidual']:+.2f})  anchor x{e['anchorDose']:.2f}  implied x{e['impliedDoseVsYG']:.2f}")
    d = res["decision"]
    print(f"\nPRIMARY: {d['rows']} rows / {d['players']} players  YG {d['mae']['YG']:.3f}  YGA {d['mae']['YGA']:.3f}  "
          f"YGA better in {d['ygaWins']}/{d['cells']} cells  -> {d['verdict']}")
    print("exploratory (primary arm): " + "  ".join(f"{m} {v['midpointMae']:.3f}" for m, v in res["exploratory"].items()))
    for k, v in res["postHocGlobalDose"].items():
        print(f"post hoc global dose ({k}, n={v['anchorEvents']}, x{v['dose']:.3f}): MAE {v['primaryArm']['midpointMae']:.3f}  "
              f"better than YG in {v['betterThanYGInCells']} cells")
    print("secondary:", json.dumps({k: (v['midpointMae'] if isinstance(v, dict) else v) for k, v in res["secondaryArm"].items()}))


if __name__ == "__main__":
    main()
