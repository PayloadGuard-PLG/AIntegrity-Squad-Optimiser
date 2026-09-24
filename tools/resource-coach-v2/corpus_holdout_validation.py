#!/usr/bin/env python3
"""Replay the current ordinary-coach model against observed screenshot outcomes.

This is intentionally different from the older retrospective parameter-fit replay.

Experiment:
  1. Keep one exact player state fixed.
  2. Use ONE observed coach card for that state only to calibrate C_P.
  3. Predict every OTHER coach card for the same state without reading its outcome.
  4. Compare prediction to the screenshot-observed gain interval.
  5. Rotate every eligible coach card through the anchor role.
  6. Repeat across every player/state with >=2 eligible coach events.

Frozen/chat predictions are never used as truth. For the conversation-locked
23-Sep file, only player state + coach metadata + observed screenshot ranges are
read; the stored prediction/point fields are deliberately ignored.
"""

from __future__ import annotations

import argparse
import base64
import csv
import gzip
import hashlib
import json
import math
import pathlib
import re
from collections import defaultdict
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[2]
PROFILE_PATH = ROOT / "profiles" / "resource_coach_current_replay_20260923.json"
ARCHIVE_PATH = ROOT / "calibration" / "resource-coach-identification" / "archived-preview-rows-v1.json"
CHAT_PATH = ROOT / "calibration" / "resource-coach-identification" / "chat-locked-tests-20260923.json"
CANONICAL_PATH = ROOT / "calibration" / "longitudinal-corpus" / "canonical-corpus-v1.json.gz.b64"
EXCLUSIONS_PATH = ROOT / "calibration" / "resource-coach-log" / "quality-exclusions.json"

PROFILE = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
R = PROFILE["response"]
TIER = {f"T{i}": v for i, v in enumerate(PROFILE["tierAdditions"])}
KNOWN_CLASS = {"WHITE", "MID_GREY"}
SCREENSHOT_RE = re.compile(r"(\.png\b|screenshot|chat_upload|\bpreview\b|\bcard\b)", re.I)


def age_scale(age: int) -> float:
    for band in PROFILE["ageScaleBands"]:
        if band["minAge"] <= age <= band["maxAge"]:
            return float(band["scale"])
    raise ValueError(f"age outside replay profile: {age}")


def tier_addition(tier: Any) -> float:
    if isinstance(tier, int):
        key = f"T{tier}"
    else:
        key = str(tier).upper()
    if key not in TIER:
        raise ValueError(f"unsupported tier: {tier}")
    return float(TIER[key])


def transformed_start(start: float, tier: Any, display_class: str) -> float:
    return start - tier_addition(tier) if display_class == "WHITE" else start


def threshold(display_class: str) -> float:
    if display_class == "WHITE":
        return float(R["whiteThreshold"])
    if display_class == "MID_GREY":
        return float(R["midGreyThreshold"])
    raise ValueError(display_class)


def latent_gain(u: float, h: float, budget: float) -> float:
    """Invert integral of flat-then-exponential marginal cost."""
    if budget <= 0:
        return 0.0
    k = float(R["K"])
    if u < h:
        flat = h - u
        if budget <= flat:
            movement = budget
        else:
            movement = flat + k * math.log1p((budget - flat) / k)
    else:
        cost_at_u = math.exp((u - h) / k)
        movement = k * math.log1p(budget / (k * cost_at_u))
    if R.get("visibleGainRectification", True):
        return max(0.0, u + movement) - max(0.0, u)
    return movement


def predict_interval(row: dict[str, Any], c_player: float) -> tuple[float, float]:
    p = float(row["p"])
    if p <= 0:
        raise ValueError("affected-stat count must be positive")
    b_lo = c_player * age_scale(int(row["age"])) * float(row["N"]) / p
    b_hi = b_lo * float(R["upperDoseRatio"])
    u = transformed_start(float(row["s"]), row["tier"], row["cls"])
    h = threshold(row["cls"])
    return latent_gain(u, h, b_lo), latent_gain(u, h, b_hi)


def row_endpoint_sse(row: dict[str, Any], b_lo: float) -> float:
    b_hi = b_lo * float(R["upperDoseRatio"])
    u = transformed_start(float(row["s"]), row["tier"], row["cls"])
    h = threshold(row["cls"])
    plo, phi = latent_gain(u, h, b_lo), latent_gain(u, h, b_hi)
    olo, ohi = map(float, row["g"])
    return (plo - olo) ** 2 + (phi - ohi) ** 2


def implied_budget(row: dict[str, Any]) -> float:
    """One-dimensional bounded minimisation of endpoint SSE for one observed stat."""
    lo, hi = 0.0, 10000.0
    for _ in range(160):
        m1 = lo + (hi - lo) / 3.0
        m2 = hi - (hi - lo) / 3.0
        if row_endpoint_sse(row, m1) <= row_endpoint_sse(row, m2):
            hi = m2
        else:
            lo = m1
    return (lo + hi) / 2.0


def calibrate_event(event: dict[str, Any]) -> dict[str, Any]:
    rows = event["rows"]
    budgets = [implied_budget(r) for r in rows]
    common_b = sum(budgets) / len(budgets)
    exemplar = rows[0]
    denominator = age_scale(int(exemplar["age"])) * float(exemplar["N"]) / float(exemplar["p"])
    c_player = common_b / denominator
    fitted = [predict_interval(r, c_player) for r in rows]
    anchor_endpoint_mae = sum(
        (abs(p[0] - float(r["g"][0])) + abs(p[1] - float(r["g"][1]))) / 2.0
        for r, p in zip(rows, fitted)
    ) / len(rows)
    return {
        "cPlayer": c_player,
        "commonBudgetLo": common_b,
        "perStatBudgetLo": {r["stat"]: b for r, b in zip(rows, budgets)},
        "anchorEndpointMae": anchor_endpoint_mae,
    }


def evidence_grade(source: str) -> str:
    if SCREENSHOT_RE.search(source or ""):
        return "referenced-screenshot-unverified"
    if source.startswith("conversation-observed:"):
        return "conversation-screenshot-observed"
    return "structured-secondary"


def normalize_family(v: Any) -> str:
    return str(v or "UNKNOWN").replace("-", " ").strip().upper()


def ordinary(row: dict[str, Any]) -> bool:
    transfer = str(row.get("transferClass") or "ordinary").lower()
    fam = normalize_family(row.get("family"))
    coach = str(row.get("coach") or "").upper()
    return transfer == "ordinary" and "REWARD" not in fam and "REWARD" not in coach


def load_archive_rows() -> list[dict[str, Any]]:
    doc = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))
    out = []
    for raw in doc["rows"]:
        if raw.get("cls") not in KNOWN_CLASS or not raw.get("state"):
            continue
        row = {
            "partition": "archive",
            "event": str(raw["id"]),
            "player": str(raw["player"]),
            "playerName": str(raw.get("name") or raw["player"]),
            "state": str(raw["state"]),
            "age": int(raw["age"]),
            "tier": f"T{int(raw['tier'])}",
            "stat": str(raw["stat"]).upper(),
            "s": float(raw["s"]),
            "cls": str(raw["cls"]),
            "coach": str(raw.get("coach") or "UNKNOWN"),
            "family": normalize_family(raw.get("family")),
            "N": float(raw["N"]),
            "p": int(raw["p"]),
            "g": [float(raw["g"][0]), float(raw["g"][1])],
            "source": str(raw.get("source") or ""),
            "transferClass": "ordinary",
        }
        row["evidenceGrade"] = evidence_grade(row["source"])
        if ordinary(row):
            out.append(row)
    return out


def load_chat_observed_rows() -> list[dict[str, Any]]:
    """Use actual screenshot observations only. Never read prediction/point fields."""
    doc = json.loads(CHAT_PATH.read_text(encoding="utf-8"))
    states = doc["playerStates"]
    out = []
    for test in doc["tests"]:
        coach = test["coach"]
        if str(coach.get("transferClass", "ordinary")).lower() != "ordinary":
            continue
        state_id = test["playerStateId"]
        state = states[state_id]
        for stat in test["affectedStats"]:
            row = {
                "partition": "chat-observed",
                "event": str(test["testId"]),
                "player": state_id,
                "playerName": str(state["playerName"]),
                "state": state_id,
                "age": int(state["age"]),
                "tier": str(state["tier"]),
                "stat": str(stat["stat"]).upper(),
                "s": float(stat["start"]),
                "cls": str(stat["displayClass"]),
                "coach": str(coach["coachLabel"]),
                "family": normalize_family(coach.get("programmeFamily")),
                "N": float(coach["multiplier"]),
                "p": int(coach["affectedStatCount"]),
                "g": [float(stat["observed"][0]), float(stat["observed"][1])],
                "source": f"conversation-observed:{test['testId']}",
                "transferClass": "ordinary",
                "evidenceGrade": "conversation-screenshot-observed",
            }
            if row["cls"] in KNOWN_CLASS:
                out.append(row)
    return out


def load_canonical_rows() -> list[dict[str, Any]]:
    packed = CANONICAL_PATH.read_text(encoding="utf-8").strip()
    doc = json.loads(gzip.decompress(base64.b64decode(packed)).decode("utf-8"))
    excluded = {
        x["experimentId"]
        for x in json.loads(EXCLUSIONS_PATH.read_text(encoding="utf-8"))["experiments"]
    }
    out = []
    for exp in doc["experiments"]:
        if exp["id"] in excluded or exp["id"] == "PRV-0022":
            continue
        player = exp["preOutcome"]["player"]
        coach = exp["preOutcome"]["coach"]
        state = str(exp.get("_stateId") or exp["id"])
        intervals = exp["observed"]["statIntervals"]
        p = len(intervals)
        for stat, gain in intervals.items():
            cls = exp.get("_classByStat", {}).get(stat)
            if cls not in KNOWN_CLASS:
                continue
            row = {
                "partition": "canonical-workbook",
                "event": str(exp["id"]),
                "player": str(player["id"]),
                "playerName": str(player["name"]),
                "state": state,
                "age": int(player["age"]),
                "tier": str(player["tier"]),
                "stat": str(stat).upper(),
                "s": float(player["stats"][stat]),
                "cls": cls,
                "coach": str(coach["title"]),
                "family": normalize_family(coach.get("programmeFamily")),
                "N": float(coach["multiplier"]),
                "p": p,
                "g": [float(gain["lo"]), float(gain["hi"])],
                "source": "canonical-workbook",
                "transferClass": str(coach.get("transferClass") or "ordinary"),
                "evidenceGrade": "canonical-workbook",
            }
            if ordinary(row):
                out.append(row)
    return out


def event_fingerprint(rows: list[dict[str, Any]]) -> str:
    payload = {
        "player": rows[0]["player"], "state": rows[0]["state"],
        "coach": rows[0]["coach"], "family": rows[0]["family"],
        "N": rows[0]["N"], "p": rows[0]["p"],
        "stats": sorted((r["stat"], r["s"], r["cls"], tuple(r["g"])) for r in rows),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def build_events(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        grouped[(r["partition"], r["player"], r["state"], r["event"])].append(r)
    events = []
    seen = set()
    for (_, player, state, event), rr in sorted(grouped.items()):
        rr.sort(key=lambda x: x["stat"])
        fp = event_fingerprint(rr)
        if fp in seen:
            continue
        seen.add(fp)
        events.append({
            "event": event,
            "player": player,
            "playerName": rr[0]["playerName"],
            "state": state,
            "partition": rr[0]["partition"],
            "family": rr[0]["family"],
            "coach": rr[0]["coach"],
            "N": rr[0]["N"],
            "p": rr[0]["p"],
            "age": rr[0]["age"],
            "tier": rr[0]["tier"],
            "evidenceGrade": rr[0]["evidenceGrade"],
            "rows": rr,
        })
    return events


def score_row(anchor: dict[str, Any], target: dict[str, Any], row: dict[str, Any], c_player: float) -> dict[str, Any]:
    plo, phi = predict_interval(row, c_player)
    olo, ohi = map(float, row["g"])
    pmid, omid = (plo + phi) / 2.0, (olo + ohi) / 2.0
    inter = max(0.0, min(phi, ohi) - max(plo, olo))
    union = max(phi, ohi) - min(plo, olo)
    overlap = max(plo, olo) <= min(phi, ohi)
    return {
        "partition": target["partition"],
        "player_id": target["player"],
        "player_name": target["playerName"],
        "state": target["state"],
        "anchor_event": anchor["event"],
        "anchor_family": anchor["family"],
        "anchor_coach": anchor["coach"],
        "target_event": target["event"],
        "target_family": target["family"],
        "target_coach": target["coach"],
        "target_multiplier": target["N"],
        "target_p": target["p"],
        "target_age": row["age"],
        "target_tier": row["tier"],
        "stat": row["stat"],
        "start": row["s"],
        "display_class": row["cls"],
        "c_player": c_player,
        "pred_lo": plo,
        "pred_hi": phi,
        "pred_mid": pmid,
        "pred_display_lo": math.floor(plo),
        "pred_display_hi": math.ceil(phi),
        "obs_lo": olo,
        "obs_hi": ohi,
        "obs_mid": omid,
        "signed_midpoint_residual": pmid - omid,
        "midpoint_abs_error": abs(pmid - omid),
        "point_inside_observed": olo <= pmid <= ohi,
        "interval_overlap": overlap,
        "endpoint_mae": (abs(plo - olo) + abs(phi - ohi)) / 2.0,
        "interval_iou": 1.0 if union == 0 else inter / union,
        "evidence_grade": row["evidenceGrade"],
        "source": row["source"],
    }


def cross_validate(events: list[dict[str, Any]], primary_only: bool) -> dict[str, Any]:
    by_state: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for e in events:
        if primary_only and e["evidenceGrade"] not in {
            "referenced-screenshot-unverified", "conversation-screenshot-observed"
        }:
            continue
        by_state[(e["partition"], e["player"], e["state"])].append(e)

    predictions = []
    anchor_records = []
    eligible_groups = 0
    for key, group in sorted(by_state.items()):
        if len(group) < 2:
            continue
        eligible_groups += 1
        for anchor in group:
            cal = calibrate_event(anchor)
            anchor_records.append({
                "partition": anchor["partition"],
                "player_id": anchor["player"],
                "player_name": anchor["playerName"],
                "state": anchor["state"],
                "anchor_event": anchor["event"],
                "anchor_family": anchor["family"],
                "anchor_coach": anchor["coach"],
                "anchor_multiplier": anchor["N"],
                "anchor_p": anchor["p"],
                "c_player": cal["cPlayer"],
                "common_budget_lo": cal["commonBudgetLo"],
                "anchor_endpoint_mae": cal["anchorEndpointMae"],
                "per_stat_budget_lo": json.dumps(cal["perStatBudgetLo"], sort_keys=True),
            })
            for target in group:
                if target["event"] == anchor["event"]:
                    continue
                for row in target["rows"]:
                    predictions.append(score_row(anchor, target, row, cal["cPlayer"]))

    return {
        "eligiblePlayerStates": eligible_groups,
        "anchors": anchor_records,
        "predictions": predictions,
        "metrics": aggregate(predictions),
        "byTargetFamily": grouped_metrics(predictions, "target_family"),
        "byAnchorTargetFamily": grouped_metrics(predictions, ("anchor_family", "target_family")),
    }


def aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"n": 0}
    return {
        "n": len(rows),
        "players": len({r["player_id"] for r in rows}),
        "playerStates": len({(r["partition"], r["player_id"], r["state"]) for r in rows}),
        "anchorTargetPairs": len({(r["partition"], r["anchor_event"], r["target_event"]) for r in rows}),
        "distinctTargetCoaches": len({(r["target_family"], r["target_coach"], r["target_multiplier"]) for r in rows}),
        "midpointMae": sum(r["midpoint_abs_error"] for r in rows) / len(rows),
        "pointInsideObservedRate": sum(bool(r["point_inside_observed"]) for r in rows) / len(rows),
        "intervalOverlapRate": sum(bool(r["interval_overlap"]) for r in rows) / len(rows),
        "endpointMae": sum(r["endpoint_mae"] for r in rows) / len(rows),
        "meanIntervalIou": sum(r["interval_iou"] for r in rows) / len(rows),
        "signedMidpointResidual": sum(r["signed_midpoint_residual"] for r in rows) / len(rows),
    }


def grouped_metrics(rows: list[dict[str, Any]], field: Any) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        if isinstance(field, tuple):
            key = " -> ".join(str(r[f]) for f in field)
        else:
            key = str(r[field])
        groups[key].append(r)
    return {k: aggregate(v) for k, v in sorted(groups.items())}


def global_baseline(events: list[dict[str, Any]], primary_only: bool) -> dict[str, Any]:
    c = float(PROFILE["dose"]["globalAmplitude"])
    rows = []
    for e in events:
        if primary_only and e["evidenceGrade"] not in {
            "referenced-screenshot-unverified", "conversation-screenshot-observed"
        }:
            continue
        for row in e["rows"]:
            dummy = {"event": "GLOBAL", "family": "GLOBAL", "coach": "GLOBAL"}
            rows.append(score_row(dummy, e, row, c))
    return {"metrics": aggregate(rows), "byTargetFamily": grouped_metrics(rows, "target_family"), "predictions": rows}


def primary_sensitivities(cv: dict[str, Any]) -> dict[str, Any]:
    """Expose repeated close-coach transfers and a baseline on identical targets."""
    rows = cv["predictions"]
    close = [r for r in rows if r["anchor_coach"] == r["target_coach"]
             and r["target_p"] == 8 and r["target_multiplier"] in (106, 114)]
    remaining = [r for r in rows if r not in close]
    by_event = {a["anchor_event"]: a for a in cv["anchors"]}
    fixed = []
    for r in rows:
        anchor = by_event[r["anchor_event"]]
        target = {"partition": r["partition"], "player": r["player_id"],
                  "playerName": r["player_name"], "state": r["state"],
                  "event": r["target_event"], "family": r["target_family"],
                  "coach": r["target_coach"], "N": r["target_multiplier"], "p": r["target_p"]}
        row = {"s": r["start"], "tier": r["target_tier"], "cls": r["display_class"],
               "age": r["target_age"], "N": r["target_multiplier"], "p": r["target_p"],
               "g": [r["obs_lo"], r["obs_hi"]], "stat": r["stat"],
               "evidenceGrade": r["evidence_grade"], "source": r["source"]}
        fixed.append(score_row({"event": anchor["anchor_event"], "family": anchor["anchor_family"],
                                "coach": anchor["anchor_coach"]}, target, row,
                               float(PROFILE["dose"]["globalAmplitude"])))
    return {"closeSameCoach106to114": aggregate(close),
            "excludingCloseSameCoach106to114": aggregate(remaining),
            "fixedGlobalAmplitudeOnSameTargets": aggregate(fixed),
            "ageBandIdentifiability": "Not identifiable: the age multiplier cancels algebraically when amplitude is calibrated and predicted within one exact player state."}


def seeded_spotlight(cv: dict[str, Any], seed: str) -> dict[str, Any] | None:
    pairs: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in cv["predictions"]:
        pairs[(r["partition"], r["anchor_event"], r["target_event"])].append(r)
    if not pairs:
        return None
    keys = sorted(pairs)
    idx = int.from_bytes(hashlib.sha256(seed.encode()).digest()[:8], "big") % len(keys)
    key = keys[idx]
    rows = pairs[key]
    return {
        "seed": seed,
        "selectionIndex": idx,
        "pairCount": len(keys),
        "partition": key[0],
        "anchorEvent": key[1],
        "targetEvent": key[2],
        "player": rows[0]["player_name"],
        "state": rows[0]["state"],
        "anchorCoach": rows[0]["anchor_coach"],
        "targetCoach": rows[0]["target_coach"],
        "metrics": aggregate(rows),
        "rows": rows,
    }


def write_csv(path: pathlib.Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    headers = list(rows[0])
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def pct(v: Any) -> str:
    return "n/a" if v is None else f"{100*float(v):.1f}%"


def num(v: Any) -> str:
    return "n/a" if v is None else f"{float(v):.3f}"


def markdown(report: dict[str, Any]) -> str:
    m = report["primaryCrossValidation"]["metrics"]
    g = report["globalBaseline"]["metrics"]
    lines = [
        "# Current Resource Coach model — screenshot replay",
        "",
        f"Model: `{PROFILE['modelVersion']}`",
        "",
        "## Primary leave-one-coach-out result",
        "",
        "| Metric | Player-state calibrated | Global C baseline |",
        "|---|---:|---:|",
        f"| Stat predictions | {m.get('n',0)} | {g.get('n',0)} |",
        f"| Players | {m.get('players',0)} | {g.get('players',0)} |",
        f"| Player states | {m.get('playerStates',0)} | {g.get('playerStates',0)} |",
        f"| Anchor→target coach pairs | {m.get('anchorTargetPairs',0)} | — |",
        f"| Midpoint MAE | {num(m.get('midpointMae'))} | {num(g.get('midpointMae'))} |",
        f"| Predicted midpoint inside observed range | {pct(m.get('pointInsideObservedRate'))} | {pct(g.get('pointInsideObservedRate'))} |",
        f"| Interval overlap | {pct(m.get('intervalOverlapRate'))} | {pct(g.get('intervalOverlapRate'))} |",
        f"| Endpoint MAE | {num(m.get('endpointMae'))} | {num(g.get('endpointMae'))} |",
        f"| Mean interval IoU | {num(m.get('meanIntervalIou'))} | {num(g.get('meanIntervalIou'))} |",
        "",
        "The primary score uses transcribed preview ranges with screenshot filenames or conversation references. The image pixels are not bundled or independently checked here. These are game preview ranges, not gains measured after applying a coach. Frozen assistant predictions are never read as truth.",
        "",
        "## By target family",
        "",
        "| Family | n | midpoint MAE | point inside | overlap | endpoint MAE |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for family, fm in report["primaryCrossValidation"]["byTargetFamily"].items():
        lines.append(
            f"| {family} | {fm.get('n',0)} | {num(fm.get('midpointMae'))} | "
            f"{pct(fm.get('pointInsideObservedRate'))} | {pct(fm.get('intervalOverlapRate'))} | "
            f"{num(fm.get('endpointMae'))} |"
        )

    sens = report["primarySensitivities"]
    lines += [
        "", "## Sensitivity and identification",
        "",
        f"- Close same-coach x106/x114 transfers: {sens['closeSameCoach106to114']['n']} of {m['n']} predictions.",
        f"- Without those transfers: {sens['excludingCloseSameCoach106to114']['n']} predictions, "
        f"midpoint MAE {num(sens['excludingCloseSameCoach106to114'].get('midpointMae'))}, "
        f"midpoint inside {pct(sens['excludingCloseSameCoach106to114'].get('pointInsideObservedRate'))}.",
        f"- Fixed global amplitude on the **same scored target rows**: midpoint MAE "
        f"{num(sens['fixedGlobalAmplitudeOnSameTargets'].get('midpointMae'))}; player-state fitted amplitude: {num(m.get('midpointMae'))}.",
        f"- {sens['ageBandIdentifiability']}",
        "- Scores from repeated stats and reciprocal anchor/target directions are correlated. The number of independent player states is six.",
        "- Canonical workbook results and provenance exclusions must be read before treating the headline as transferable.",
    ]

    s = report.get("spotlight")
    if s:
        lines += [
            "",
            "## Seeded spotlight",
            "",
            f"- Seed: `{s['seed']}`",
            f"- Player: **{s['player']}**",
            f"- Anchor: **{s['anchorCoach']}**",
            f"- Target: **{s['targetCoach']}**",
            f"- Midpoint MAE: **{num(s['metrics'].get('midpointMae'))}**",
            f"- Point-inside rate: **{pct(s['metrics'].get('pointInsideObservedRate'))}**",
            "",
            "| Stat | Start | Predicted | Pred mid | Observed | Obs mid | |mid err| |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ]
        for r in s["rows"]:
            lines.append(
                f"| {r['stat']} | {r['start']:.0f} | [{r['pred_lo']:.2f},{r['pred_hi']:.2f}] | "
                f"{r['pred_mid']:.2f} | [{r['obs_lo']:.0f},{r['obs_hi']:.0f}] | "
                f"{r['obs_mid']:.2f} | {r['midpoint_abs_error']:.2f} |"
            )

    lines += [
        "",
        "## Boundary",
        "",
        "- One observed coach event calibrates C_P; every scored target is a different event.",
        "- Calibration never crosses player-state boundaries.",
        "- Reward is excluded from this ordinary-coach model.",
        "- Programme/coach-family performance is reported separately rather than fitted away.",
        "- Canonical workbook replay is emitted as a secondary provenance tier, not silently pooled into the primary screenshot score.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", default="vader-20260923")
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()
    out = pathlib.Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    archive = load_archive_rows()
    chat = load_chat_observed_rows()
    canonical = load_canonical_rows()

    # Primary data: direct screenshot references from archive + observed screenshot
    # outcomes from chat. Secondary canonical workbook is scored separately.
    primary_events = build_events(archive + chat)
    canonical_events = build_events(canonical)

    primary_cv = cross_validate(primary_events, primary_only=True)
    sensitivities = primary_sensitivities(primary_cv)
    canonical_cv = cross_validate(canonical_events, primary_only=False)
    global_base = global_baseline(primary_events, primary_only=True)
    spotlight = seeded_spotlight(primary_cv, args.seed)

    report = {
        "schemaVersion": "resource-coach-current-model-replay-v1",
        "modelVersion": PROFILE["modelVersion"],
        "profile": str(PROFILE_PATH.relative_to(ROOT)),
        "seed": args.seed,
        "evidenceCounts": {
            "archiveRowsKnownClass": len(archive),
            "chatObservedRows": len(chat),
            "canonicalRowsAfterExclusions": len(canonical),
            "primaryEvents": len(primary_events),
            "canonicalEvents": len(canonical_events),
        },
        "primaryCrossValidation": {
            k: v for k, v in primary_cv.items() if k != "predictions" and k != "anchors"
        },
        "primarySensitivities": sensitivities,
        "byPlayer": grouped_metrics(primary_cv["predictions"], "player_name"),
        "byTargetN": grouped_metrics(primary_cv["predictions"], "target_multiplier"),
        "byTargetP": grouped_metrics(primary_cv["predictions"], "target_p"),
        "byDisplayClass": grouped_metrics(primary_cv["predictions"], "display_class"),
        "canonicalCrossValidation": {
            k: v for k, v in canonical_cv.items() if k != "predictions" and k != "anchors"
        },
        "globalBaseline": {
            k: v for k, v in global_base.items() if k != "predictions"
        },
        "spotlight": spotlight,
        "safeguards": PROFILE["evidenceBoundary"] + [
            "chat-locked-tests prediction and point fields are deliberately never accessed",
            "target event id must differ from anchor event id",
            "same player/state is mandatory for C_P transfer",
        ],
    }

    (out / "summary.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (out / "REPORT.md").write_text(markdown(report), encoding="utf-8")
    write_csv(out / "primary-predictions.csv", primary_cv["predictions"])
    write_csv(out / "primary-anchor-calibrations.csv", primary_cv["anchors"])
    write_csv(out / "canonical-predictions.csv", canonical_cv["predictions"])
    write_csv(out / "canonical-anchor-calibrations.csv", canonical_cv["anchors"])
    write_csv(out / "global-baseline-predictions.csv", global_base["predictions"])

    print(json.dumps({
        "modelVersion": report["modelVersion"],
        "primary": report["primaryCrossValidation"]["metrics"],
        "canonical": report["canonicalCrossValidation"]["metrics"],
        "spotlight": None if spotlight is None else {
            "player": spotlight["player"],
            "anchor": spotlight["anchorCoach"],
            "target": spotlight["targetCoach"],
            "metrics": spotlight["metrics"],
        },
    }, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
