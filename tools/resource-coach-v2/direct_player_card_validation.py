#!/usr/bin/env python3
"""Direct replay of the frozen ordinary Resource Coach model.

Primary experiment:
  1. Read player-card inputs (age, tier, displayed stat, display class).
  2. Read the ordinary coach definition (family, multiplier N, affected count p).
  3. Predict the preview interval from the frozen global model only.
  4. Read the observed game preview interval only for scoring.

A second coach output is never required. No observed preview is used to calibrate
a player-specific amplitude. Repeated same-state coach cards remain useful as
secondary mechanism diagnostics, but they are not an eligibility gate.
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
PROSPECTIVE_PATH = ROOT / "calibration" / "resource-coach-identification" / "prospective-evidence-20260921.json"
LIVE_GILMARTIN_PATH = ROOT / "calibration" / "resource-coach-identification" / "live-preview-20260923-gilmartin.json"
CANONICAL_PATH = ROOT / "calibration" / "longitudinal-corpus" / "canonical-corpus-v1.json.gz.b64"
EXCLUSIONS_PATH = ROOT / "calibration" / "resource-coach-log" / "quality-exclusions.json"

PROFILE = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
R = PROFILE["response"]
GLOBAL_C = float(PROFILE["dose"]["globalAmplitude"])
TIER = {f"T{i}": v for i, v in enumerate(PROFILE["tierAdditions"])}
KNOWN_CLASS = {"WHITE", "MID_GREY"}
SCREENSHOT_RE = re.compile(r"(\.png\b|screenshot|chat_upload|\bpreview\b|\bcard\b)", re.I)
TIER_RE = re.compile(r"\bT([0-6])\b", re.I)

EVIDENCE_PRIORITY = {
    "live-screenshot-transcription": 5,
    "conversation-screenshot-observed": 4,
    "direct-screenshot-reference": 3,
    "canonical-workbook": 2,
    "structured-secondary": 1,
}


def age_scale(age: int) -> float:
    for band in PROFILE["ageScaleBands"]:
        if band["minAge"] <= age <= band["maxAge"]:
            return float(band["scale"])
    raise ValueError(f"age outside replay profile: {age}")


def normalize_tier(value: Any) -> str | None:
    if isinstance(value, int):
        key = f"T{value}"
        return key if key in TIER else None
    match = TIER_RE.search(str(value or ""))
    if not match:
        return None
    key = f"T{match.group(1)}"
    return key if key in TIER else None


def tier_addition(tier: Any) -> float:
    key = normalize_tier(tier)
    if key is None:
        raise ValueError(f"unsupported or missing tier: {tier}")
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


def predict_interval(row: dict[str, Any]) -> tuple[float, float]:
    """Pure prediction from player-card + coach inputs. Never reads row['g']."""
    p = float(row["p"])
    if p <= 0:
        raise ValueError("affected-stat count must be positive")
    b_lo = GLOBAL_C * age_scale(int(row["age"])) * float(row["N"]) / p
    b_hi = b_lo * float(R["upperDoseRatio"])
    u = transformed_start(float(row["s"]), row["tier"], row["cls"])
    h = threshold(row["cls"])
    return latent_gain(u, h, b_lo), latent_gain(u, h, b_hi)


def evidence_grade(source: str) -> str:
    if SCREENSHOT_RE.search(source or ""):
        return "direct-screenshot-reference"
    return "structured-secondary"


def normalize_family(value: Any) -> str:
    return str(value or "UNKNOWN").replace("-", " ").strip().upper()


def ordinary(row: dict[str, Any]) -> bool:
    transfer = str(row.get("transferClass") or "ordinary").lower()
    family = normalize_family(row.get("family"))
    coach = str(row.get("coach") or "").upper()
    return transfer == "ordinary" and "REWARD" not in family and "REWARD" not in coach


def row_ready(row: dict[str, Any]) -> tuple[bool, str | None]:
    if row.get("cls") not in KNOWN_CLASS:
        return False, "missing-or-unknown-display-class"
    if normalize_tier(row.get("tier")) is None:
        return False, "missing-or-unknown-tier"
    if row.get("age") is None:
        return False, "missing-age"
    if row.get("N") is None:
        return False, "missing-coach-multiplier"
    if not row.get("p"):
        return False, "missing-affected-stat-count"
    if row.get("s") is None:
        return False, "missing-start-stat"
    if row.get("g") is None:
        return False, "missing-observed-answer-key"
    return True, None


def load_archive_rows() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    doc = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))
    ready, rejected = [], []
    for raw in doc["rows"]:
        row = {
            "partition": "archive",
            "event": str(raw["id"]),
            "player": str(raw.get("player") or raw.get("name") or "UNKNOWN"),
            "playerName": str(raw.get("name") or raw.get("player") or "UNKNOWN"),
            "state": str(raw.get("state") or f"unkeyed:{raw.get('player') or raw.get('name') or raw['id']}"),
            "age": raw.get("age"),
            "tier": normalize_tier(raw.get("tier")),
            "stat": str(raw.get("stat") or "").upper(),
            "s": raw.get("s"),
            "cls": raw.get("cls"),
            "coach": str(raw.get("coach") or "UNKNOWN"),
            "family": normalize_family(raw.get("family")),
            "N": raw.get("N"),
            "p": raw.get("p"),
            "g": raw.get("g"),
            "source": str(raw.get("source") or ""),
            "transferClass": "ordinary",
        }
        row["evidenceGrade"] = evidence_grade(row["source"])
        if not ordinary(row):
            continue
        ok, reason = row_ready(row)
        if ok:
            row["age"] = int(row["age"])
            row["N"] = float(row["N"])
            row["p"] = int(row["p"])
            row["s"] = float(row["s"])
            row["g"] = [float(row["g"][0]), float(row["g"][1])]
            ready.append(row)
        else:
            rejected.append({**row, "reason": reason})
    return ready, rejected


def load_chat_rows() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    doc = json.loads(CHAT_PATH.read_text(encoding="utf-8"))
    states = doc["playerStates"]
    ready, rejected = [], []
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
                "age": state.get("age"),
                "tier": normalize_tier(state.get("tier")),
                "stat": str(stat.get("stat") or "").upper(),
                "s": stat.get("start"),
                "cls": stat.get("displayClass"),
                "coach": str(coach.get("coachLabel") or "UNKNOWN"),
                "family": normalize_family(coach.get("programmeFamily")),
                "N": coach.get("multiplier"),
                "p": coach.get("affectedStatCount"),
                "g": stat.get("observed"),
                "source": f"conversation-observed:{test['testId']}",
                "transferClass": "ordinary",
                "evidenceGrade": "conversation-screenshot-observed",
            }
            ok, reason = row_ready(row)
            if ok:
                row["age"] = int(row["age"])
                row["N"] = float(row["N"])
                row["p"] = int(row["p"])
                row["s"] = float(row["s"])
                row["g"] = [float(row["g"][0]), float(row["g"][1])]
                ready.append(row)
            else:
                rejected.append({**row, "reason": reason})
    return ready, rejected


def load_canonical_rows() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    packed = CANONICAL_PATH.read_text(encoding="utf-8").strip()
    doc = json.loads(gzip.decompress(base64.b64decode(packed)).decode("utf-8"))
    excluded = {
        item["experimentId"]
        for item in json.loads(EXCLUSIONS_PATH.read_text(encoding="utf-8"))["experiments"]
    }
    ready, rejected = [], []
    for exp in doc["experiments"]:
        if exp["id"] in excluded or exp["id"] == "PRV-0022":
            continue
        player = exp["preOutcome"]["player"]
        coach = exp["preOutcome"]["coach"]
        if str(coach.get("transferClass") or "ordinary").lower() != "ordinary":
            continue
        state = str(exp.get("_stateId") or exp["id"])
        intervals = exp["observed"]["statIntervals"]
        p = len(intervals)
        for stat, gain in intervals.items():
            row = {
                "partition": "canonical-workbook",
                "event": str(exp["id"]),
                "player": str(player["id"]),
                "playerName": str(player["name"]),
                "state": state,
                "age": player.get("age"),
                "tier": normalize_tier(player.get("tier")),
                "stat": str(stat).upper(),
                "s": player.get("stats", {}).get(stat),
                "cls": exp.get("_classByStat", {}).get(stat),
                "coach": str(coach.get("title") or "UNKNOWN"),
                "family": normalize_family(coach.get("programmeFamily")),
                "N": coach.get("multiplier"),
                "p": p,
                "g": [gain.get("lo"), gain.get("hi")],
                "source": str(exp.get("_sourceId") or "canonical-workbook"),
                "transferClass": str(coach.get("transferClass") or "ordinary"),
                "evidenceGrade": "canonical-workbook",
            }
            if not ordinary(row):
                continue
            ok, reason = row_ready(row)
            if ok:
                row["age"] = int(row["age"])
                row["N"] = float(row["N"])
                row["p"] = int(row["p"])
                row["s"] = float(row["s"])
                row["g"] = [float(row["g"][0]), float(row["g"][1])]
                ready.append(row)
            else:
                rejected.append({**row, "reason": reason})
    return ready, rejected


def load_live_gilmartin_rows() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    doc = json.loads(LIVE_GILMARTIN_PATH.read_text(encoding="utf-8"))
    player = doc["player"]
    coach = doc["coach"]
    ready, rejected = [], []
    for stat, gain in doc["observed"]["statIntervals"].items():
        row = {
            "partition": "live-gilmartin",
            "event": str(doc["id"]),
            "player": "ryan-gilmartin-live-20260923",
            "playerName": str(player["name"]),
            "state": str(doc["id"]),
            "age": player.get("age"),
            "tier": normalize_tier(player.get("tier")),
            "stat": str(stat).upper(),
            "s": gain.get("start"),
            "cls": gain.get("class"),
            "coach": str(coach.get("title") or "UNKNOWN"),
            "family": normalize_family(coach.get("family")),
            "N": coach.get("multiplier"),
            "p": coach.get("affectedCount"),
            "g": [gain.get("lo"), gain.get("hi")],
            "source": str(doc.get("source", {}).get("coachPreview") or "live screenshot"),
            "transferClass": "ordinary",
            "evidenceGrade": "live-screenshot-transcription",
        }
        ok, reason = row_ready(row)
        if ok:
            row["age"] = int(row["age"])
            row["N"] = float(row["N"])
            row["p"] = int(row["p"])
            row["s"] = float(row["s"])
            row["g"] = [float(row["g"][0]), float(row["g"][1])]
            ready.append(row)
        else:
            rejected.append({**row, "reason": reason})
    return ready, rejected


def load_prospective_inventory() -> list[dict[str, Any]]:
    """Inventory newer evidence even when it lacks a complete player-card state."""
    doc = json.loads(PROSPECTIVE_PATH.read_text(encoding="utf-8"))
    out = []
    for preview in doc["previews"]:
        if "REWARD" in normalize_family(preview.get("family")):
            continue
        for stat in preview["stats"]:
            row = {
                "partition": "prospective-20260921",
                "event": str(preview["id"]),
                "playerName": str(preview["name"]),
                "age": preview.get("age"),
                "tier": None,
                "stat": str(stat.get("stat") or "").upper(),
                "s": stat.get("s"),
                "cls": stat.get("cls"),
                "coach": str(preview.get("coach") or "UNKNOWN"),
                "family": normalize_family(preview.get("family")),
                "N": preview.get("N"),
                "p": preview.get("p"),
                "g": stat.get("actual"),
                "source": str(doc.get("source") or ""),
                "reason": "missing-player-card-tier" if stat.get("cls") in KNOWN_CLASS else "missing-player-card-tier-and-class",
            }
            out.append(row)
    return out


def event_fingerprint(rows: list[dict[str, Any]]) -> str:
    first = rows[0]
    payload = {
        "playerName": first["playerName"].strip().casefold(),
        "age": first["age"],
        "tier": first["tier"],
        "coach": first["coach"].strip().casefold(),
        "family": first["family"],
        "N": first["N"],
        "p": first["p"],
        "stats": sorted(
            (r["stat"], r["s"], r["cls"], tuple(r["g"])) for r in rows
        ),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def build_events(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(row["partition"], row["player"], row["event"])].append(row)

    candidates = []
    for (_, player, event), rr in sorted(grouped.items()):
        rr.sort(key=lambda r: r["stat"])
        first = rr[0]
        candidates.append({
            "event": event,
            "player": player,
            "playerName": first["playerName"],
            "state": first["state"],
            "partition": first["partition"],
            "family": first["family"],
            "coach": first["coach"],
            "N": first["N"],
            "p": first["p"],
            "age": first["age"],
            "tier": first["tier"],
            "evidenceGrade": first["evidenceGrade"],
            "source": first["source"],
            "rows": rr,
        })

    # Exact observations can occur in more than one source. Keep the strongest
    # provenance copy so duplicate transcriptions do not inflate the score.
    selected: dict[str, dict[str, Any]] = {}
    for event in candidates:
        fp = event_fingerprint(event["rows"])
        prior = selected.get(fp)
        if prior is None or EVIDENCE_PRIORITY[event["evidenceGrade"]] > EVIDENCE_PRIORITY[prior["evidenceGrade"]]:
            selected[fp] = event
    return sorted(selected.values(), key=lambda e: (e["playerName"], e["event"]))


def score_row(event: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    pred_lo, pred_hi = predict_interval(row)
    obs_lo, obs_hi = map(float, row["g"])
    pred_mid = (pred_lo + pred_hi) / 2.0
    obs_mid = (obs_lo + obs_hi) / 2.0
    intersection = max(0.0, min(pred_hi, obs_hi) - max(pred_lo, obs_lo))
    union = max(pred_hi, obs_hi) - min(pred_lo, obs_lo)
    overlap = max(pred_lo, obs_lo) <= min(pred_hi, obs_hi)
    return {
        "partition": event["partition"],
        "player_id": event["player"],
        "player_name": event["playerName"],
        "state": event["state"],
        "event": event["event"],
        "family": event["family"],
        "coach": event["coach"],
        "multiplier": event["N"],
        "p": event["p"],
        "age": event["age"],
        "tier": event["tier"],
        "stat": row["stat"],
        "start": row["s"],
        "display_class": row["cls"],
        "global_c": GLOBAL_C,
        "pred_lo": pred_lo,
        "pred_hi": pred_hi,
        "pred_mid": pred_mid,
        "pred_display_lo": math.floor(pred_lo),
        "pred_display_hi": math.ceil(pred_hi),
        "obs_lo": obs_lo,
        "obs_hi": obs_hi,
        "obs_mid": obs_mid,
        "midpoint_abs_error": abs(pred_mid - obs_mid),
        "point_inside_observed": obs_lo <= pred_mid <= obs_hi,
        "interval_overlap": overlap,
        "endpoint_mae": (abs(pred_lo - obs_lo) + abs(pred_hi - obs_hi)) / 2.0,
        "interval_iou": 1.0 if union == 0 else intersection / union,
        "signed_residual": pred_mid - obs_mid,
        "evidence_grade": row["evidenceGrade"],
        "source": row["source"],
    }


def direct_validate(events: list[dict[str, Any]]) -> dict[str, Any]:
    predictions = [
        score_row(event, row)
        for event in events
        for row in event["rows"]
    ]
    return {
        "events": len(events),
        "predictions": predictions,
        "metrics": aggregate(predictions),
        "byFamily": grouped_metrics(predictions, "family"),
        "byEvidence": grouped_metrics(predictions, "evidence_grade"),
        "byPlayer": grouped_metrics(predictions, "player_name"),
        "byAge": grouped_metrics(predictions, "age"),
        "byTier": grouped_metrics(predictions, "tier"),
    }


def aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"n": 0}
    return {
        "n": len(rows),
        "players": len({r["player_name"] for r in rows}),
        "playerStates": len({(r["player_name"], r["state"]) for r in rows}),
        "events": len({(r["partition"], r["event"]) for r in rows}),
        "distinctCoaches": len({(r["family"], r["coach"], r["multiplier"], r["p"]) for r in rows}),
        "midpointMae": sum(r["midpoint_abs_error"] for r in rows) / len(rows),
        "pointInsideObservedRate": sum(bool(r["point_inside_observed"]) for r in rows) / len(rows),
        "intervalOverlapRate": sum(bool(r["interval_overlap"]) for r in rows) / len(rows),
        "endpointMae": sum(r["endpoint_mae"] for r in rows) / len(rows),
        "meanIntervalIou": sum(r["interval_iou"] for r in rows) / len(rows),
        "signedResidual": sum(r["signed_residual"] for r in rows) / len(rows),
    }


def grouped_metrics(rows: list[dict[str, Any]], field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row[field])].append(row)
    return {key: aggregate(value) for key, value in sorted(groups.items())}


def seeded_spotlight(result: dict[str, Any], seed: str) -> dict[str, Any] | None:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in result["predictions"]:
        grouped[(row["partition"], row["event"])].append(row)
    if not grouped:
        return None
    keys = sorted(grouped)
    index = int.from_bytes(hashlib.sha256(seed.encode()).digest()[:8], "big") % len(keys)
    rows = grouped[keys[index]]
    return {
        "seed": seed,
        "selectionIndex": index,
        "eventCount": len(keys),
        "player": rows[0]["player_name"],
        "event": rows[0]["event"],
        "coach": rows[0]["coach"],
        "family": rows[0]["family"],
        "metrics": aggregate(rows),
        "rows": rows,
    }


def write_csv(path: pathlib.Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    headers = list(rows[0])
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def pct(value: Any) -> str:
    return "n/a" if value is None else f"{100 * float(value):.1f}%"


def num(value: Any) -> str:
    return "n/a" if value is None else f"{float(value):.3f}"


def markdown(report: dict[str, Any]) -> str:
    primary = report["directReplay"]["metrics"]
    lines = [
        "# Ordinary Resource Coach — direct player-card replay",
        "",
        f"Model: \`{PROFILE['modelVersion']}\`",
        f"Frozen global amplitude: **{GLOBAL_C:.3f}**",
        "",
        "## Primary result",
        "",
        "Each ordinary preview is predicted independently from the player-card state and coach definition. "
        "The observed preview is an answer key only. A second coach output is not required and no target outcome is used for calibration.",
        "",
        "| Metric | Direct replay |",
        "|---|---:|",
        f"| Stat predictions | {primary.get('n', 0)} |",
        f"| Players | {primary.get('players', 0)} |",
        f"| Player states | {primary.get('playerStates', 0)} |",
        f"| Coach preview events | {primary.get('events', 0)} |",
        f"| Distinct coach definitions | {primary.get('distinctCoaches', 0)} |",
        f"| Midpoint MAE | {num(primary.get('midpointMae'))} |",
        f"| Predicted midpoint inside observed range | {pct(primary.get('pointInsideObservedRate'))} |",
        f"| Interval overlap | {pct(primary.get('intervalOverlapRate'))} |",
        f"| Endpoint MAE | {num(primary.get('endpointMae'))} |",
        f"| Mean interval IoU | {num(primary.get('meanIntervalIou'))} |",
        f"| Signed residual | {num(primary.get('signedResidual'))} |",
        "",
        "## By programme family",
        "",
        "| Family | n | players | midpoint MAE | inside | overlap | endpoint MAE |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for family, metrics in report["directReplay"]["byFamily"].items():
        lines.append(
            f"| {family} | {metrics.get('n', 0)} | {metrics.get('players', 0)} | "
            f"{num(metrics.get('midpointMae'))} | {pct(metrics.get('pointInsideObservedRate'))} | "
            f"{pct(metrics.get('intervalOverlapRate'))} | {num(metrics.get('endpointMae'))} |"
        )

    lines += [
        "",
        "## Evidence coverage",
        "",
        "| Evidence grade | n | players | events | midpoint MAE |",
        "|---|---:|---:|---:|---:|",
    ]
    for grade, metrics in report["directReplay"]["byEvidence"].items():
        lines.append(
            f"| {grade} | {metrics.get('n', 0)} | {metrics.get('players', 0)} | "
            f"{metrics.get('events', 0)} | {num(metrics.get('midpointMae'))} |"
        )

    q = report["quarantine"]
    lines += [
        "",
        "## Quarantine / incomplete evidence",
        "",
        f"- Rows not scored because a required player-card/model input is missing: **{q['rowCount']}**",
        f"- Distinct affected players: **{q['players']}**",
        "- These records remain in the inventory. They are not dropped because the player has only one coach preview.",
        "- The 21 September prospective file is inventoried separately because it does not carry tier for those player states; "
        "that is an ingestion/provenance defect, not a requirement for multiple coach outputs.",
    ]

    spotlight = report.get("spotlight")
    if spotlight:
        lines += [
            "",
            "## Seeded single-event spotlight",
            "",
            f"- Player: **{spotlight['player']}**",
            f"- Coach: **{spotlight['coach']}** ({spotlight['family']})",
            f"- Event: \`{spotlight['event']}\`",
            f"- Midpoint MAE: **{num(spotlight['metrics'].get('midpointMae'))}**",
            f"- Point-inside rate: **{pct(spotlight['metrics'].get('pointInsideObservedRate'))}**",
            "",
            "| Stat | Start | Predicted | Observed | |mid err| |",
            "|---|---:|---:|---:|---:|",
        ]
        for row in spotlight["rows"]:
            lines.append(
                f"| {row['stat']} | {row['start']:.0f} | [{row['pred_lo']:.2f},{row['pred_hi']:.2f}] | "
                f"[{row['obs_lo']:.0f},{row['obs_hi']:.0f}] | {row['midpoint_abs_error']:.2f} |"
            )

    lines += [
        "",
        "## Method boundary",
        "",
        "- Primary prediction uses the frozen global amplitude; there is no per-player or per-event fit.",
        "- A single coach preview is sufficient to score a player. Repeated previews are diagnostics, not eligibility.",
        "- Reward is excluded from the ordinary model.",
        "- Exact duplicate observations across source tiers are de-duplicated in favour of stronger provenance.",
        "- Lower-provenance transcriptions are retained and stratified rather than silently deleting their players.",
        "- Player cards with no observed coach preview can be prediction-ready, but they cannot contribute an empirical error score until an answer key exists.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", default="vader-direct-20260924")
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    out = pathlib.Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    archive, archive_rejected = load_archive_rows()
    chat, chat_rejected = load_chat_rows()
    canonical, canonical_rejected = load_canonical_rows()
    live, live_rejected = load_live_gilmartin_rows()
    prospective_inventory = load_prospective_inventory()

    # Primary direct replay includes every complete ordinary event available in
    # the current repository. Provenance is retained as a scoring stratum.
    events = build_events(archive + chat + canonical + live)
    result = direct_validate(events)

    quarantine_rows = archive_rejected + chat_rejected + canonical_rejected + live_rejected + prospective_inventory
    quarantine_players = {
        str(row.get("playerName") or row.get("player") or "UNKNOWN")
        for row in quarantine_rows
    }

    report = {
        "schemaVersion": "resource-coach-direct-player-card-replay-v2",
        "modelVersion": PROFILE["modelVersion"],
        "profile": str(PROFILE_PATH.relative_to(ROOT)),
        "globalAmplitude": GLOBAL_C,
        "seed": args.seed,
        "evidenceCounts": {
            "archiveRowsReady": len(archive),
            "chatRowsReady": len(chat),
            "canonicalRowsReady": len(canonical),
            "liveRowsReady": len(live),
            "deduplicatedEvents": len(events),
            "prospectiveInventoryRowsMissingCompleteCard": len(prospective_inventory),
        },
        "directReplay": {
            key: value for key, value in result.items() if key != "predictions"
        },
        "quarantine": {
            "rowCount": len(quarantine_rows),
            "players": len(quarantine_players),
            "byReason": {
                reason: sum(1 for row in quarantine_rows if row.get("reason") == reason)
                for reason in sorted({str(row.get("reason")) for row in quarantine_rows})
            },
        },
        "spotlight": seeded_spotlight(result, args.seed),
        "safeguards": [
            "observed preview intervals are answer keys only and never calibrate the primary predictor",
            "single-event players are eligible for direct replay",
            "state ids are provenance labels, not an eligibility requirement",
            "reward observations are excluded from the ordinary model",
            "exact duplicate observations are de-duplicated by empirical fingerprint",
        ],
    }

    (out / "summary.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (out / "REPORT.md").write_text(markdown(report), encoding="utf-8")
    write_csv(out / "direct-predictions.csv", result["predictions"])
    write_csv(out / "event-inventory.csv", [
        {
            "partition": event["partition"],
            "player": event["playerName"],
            "state": event["state"],
            "event": event["event"],
            "family": event["family"],
            "coach": event["coach"],
            "N": event["N"],
            "p": event["p"],
            "age": event["age"],
            "tier": event["tier"],
            "evidenceGrade": event["evidenceGrade"],
            "rowCount": len(event["rows"]),
            "source": event["source"],
        }
        for event in events
    ])
    write_csv(out / "quarantined-rows.csv", quarantine_rows)

    print(json.dumps({
        "modelVersion": report["modelVersion"],
        "globalAmplitude": GLOBAL_C,
        "direct": report["directReplay"]["metrics"],
        "quarantine": report["quarantine"],
    }, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
