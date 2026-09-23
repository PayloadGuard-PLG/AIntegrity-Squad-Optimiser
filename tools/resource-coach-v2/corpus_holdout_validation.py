#!/usr/bin/env python3
"""Seeded Resource Coach corpus holdout validation.

Research-only workflow:
- imports the current 23 Sep system-identification implementation;
- chooses one eligible archive player deterministically from a logged seed;
- excludes that player completely from fitting;
- predicts every held-out interval for that player;
- repeats the same leave-one-player-out procedure for every player;
- fits the archive once and scores the independent, non-duplicate,
  non-disputed canonical workbook rows;
- compares the current nominal response structure against simple controls.

This script does not mutate production profiles or calibrate from the outcome it
is scoring. It writes audit artifacts for human/Work-mode review.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import math
import pathlib
from typing import Any, Iterable

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
SI_PATH = ROOT / "tools" / "resource-coach-v2" / "system_identification.py"
LIVE_CANDIDATE_PATH = (
    ROOT / "calibration" / "resource-coach-identification"
    / "live-calibration-candidate-20260923.json"
)

SPEC = importlib.util.spec_from_file_location("resource_coach_system_identification", SI_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import {SI_PATH}")
SI = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SI)

# These are the exact structures already exercised in system_identification.py.
VARIANTS: dict[str, tuple[float, float, float, bool]] = {
    "current_plateau_tier": (0.0354, 135.0, 120.0, True),
    "flat_tier_control": (0.0, 135.0, 120.0, True),
    "plateau_raw_control": (0.0354, 135.0, 120.0, False),
    "common_threshold_control": (0.0354, 135.0, 135.0, True),
}
CURRENT_VARIANT = "current_plateau_tier"
KNOWN_CLASSES = {"WHITE", "MID_GREY"}


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def archived_rows() -> list[dict[str, Any]]:
    rows = [dict(r) for r in SI.archived() if r.get("cls") in KNOWN_CLASSES]
    if not rows:
        raise RuntimeError("No eligible archive rows with observed display class.")
    for r in rows:
        for key in ("player", "name", "id", "stat", "coach", "family", "cls"):
            if not r.get(key):
                raise RuntimeError(f"Incomplete archive row ({key}): {r}")
        if not all(finite_number(r.get(k)) for k in ("age", "tier", "s", "N", "p")):
            raise RuntimeError(f"Non-numeric archive covariate: {r}")
        if not (
            isinstance(r.get("g"), list)
            and len(r["g"]) == 2
            and all(finite_number(v) for v in r["g"])
            and r["g"][0] <= r["g"][1]
        ):
            raise RuntimeError(f"Invalid observed interval: {r}")
    return rows


def player_names(rows: Iterable[dict[str, Any]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for r in rows:
        out.setdefault(str(r["player"]), str(r.get("name") or r["player"]))
    return out


def choose_player(
    rows: list[dict[str, Any]],
    seed: str,
    requested: str | None = None,
) -> tuple[str, str, int]:
    names = player_names(rows)
    players = sorted(names)
    if not players:
        raise RuntimeError("No eligible players.")

    if requested:
        normalized = requested.casefold().strip()
        matches = [
            p for p in players
            if p.casefold() == normalized or names[p].casefold() == normalized
        ]
        if len(matches) != 1:
            raise RuntimeError(
                f"--player must match exactly one eligible player id/name; got {matches}"
            )
        p = matches[0]
        return p, names[p], players.index(p)

    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    index = int.from_bytes(digest[:8], "big") % len(players)
    p = players[index]
    return p, names[p], index


def interval_detail(
    row: dict[str, Any],
    pred: np.ndarray,
    variant: str,
    heldout_player: str,
) -> dict[str, Any]:
    plo, phi = float(pred[0]), float(pred[1])
    olo, ohi = float(row["g"][0]), float(row["g"][1])
    overlap = max(plo, olo) <= min(phi, ohi)
    gap = max(0.0, olo - phi, plo - ohi)
    return {
        "variant": variant,
        "heldout_player_id": heldout_player,
        "player_id": row["player"],
        "player_name": row.get("name", ""),
        "event_id": row["id"],
        "family": row["family"],
        "coach": row["coach"],
        "multiplier": row["N"],
        "affected_count": row["p"],
        "age": row["age"],
        "tier": row["tier"],
        "stat": row["stat"],
        "start": row["s"],
        "display_class": row["cls"],
        "pred_lo": plo,
        "pred_hi": phi,
        "obs_lo": olo,
        "obs_hi": ohi,
        "overlap": overlap,
        "interval_gap": gap,
        "endpoint_mae_literal": (abs(plo - olo) + abs(phi - ohi)) / 2.0,
        "source": row.get("source", ""),
    }


def evaluate_player(
    rows: list[dict[str, Any]],
    player: str,
    variant_name: str,
) -> dict[str, Any]:
    variant = VARIANTS[variant_name]
    train = [r for r in rows if r["player"] != player]
    test = [r for r in rows if r["player"] == player]
    if len(train) < 9 or not test:
        raise RuntimeError(
            f"Insufficient fold data for {player}: train={len(train)} test={len(test)}"
        )

    coeff, diagnostic = SI.fit(train, variant)
    pred = SI.predict(test, coeff, variant)
    metrics = SI.score(test, pred)
    details = [
        interval_detail(row, p, variant_name, player)
        for row, p in zip(test, pred, strict=True)
    ]
    return {
        "player": player,
        "playerName": test[0].get("name", player),
        "variant": variant_name,
        "trainRows": len(train),
        "heldoutRows": len(test),
        "heldoutEvents": len({r["id"] for r in test}),
        "fitDiagnostic": diagnostic,
        "coefficients": [float(x) for x in coeff],
        "metrics": metrics,
        "details": details,
    }


def exhaustive_lopo(
    rows: list[dict[str, Any]],
    variant_name: str,
) -> dict[str, Any]:
    variant = VARIANTS[variant_name]
    preds = np.zeros((len(rows), 2), dtype=float)
    folds: list[dict[str, Any]] = []

    for player in sorted({str(r["player"]) for r in rows}):
        indices = [i for i, r in enumerate(rows) if r["player"] == player]
        train = [r for r in rows if r["player"] != player]
        held = [rows[i] for i in indices]
        if len(train) < 9:
            raise RuntimeError(f"Insufficient training rows for LOPO fold {player}")
        coeff, diagnostic = SI.fit(train, variant)
        fold_pred = SI.predict(held, coeff, variant)
        preds[indices] = fold_pred
        folds.append(
            {
                "player": player,
                "playerName": held[0].get("name", player),
                "trainRows": len(train),
                "heldoutRows": len(held),
                "heldoutEvents": len({r["id"] for r in held}),
                "coefficients": [float(x) for x in coeff],
                "fitDiagnostic": diagnostic,
                "metrics": SI.score(held, fold_pred),
            }
        )

    details = [
        interval_detail(row, p, variant_name, str(row["player"]))
        for row, p in zip(rows, preds, strict=True)
    ]
    return {
        "variant": variant_name,
        "metrics": SI.score(rows, preds),
        "folds": folds,
        "details": details,
    }


def independent_canonical_holdout(
    archive: list[dict[str, Any]],
    variant_name: str,
) -> dict[str, Any]:
    canonical_rows, _ = SI.canonical()
    archive_fingerprints = {
        (r["name"], r["s"], r["stat"], r["N"], r["p"], tuple(r["g"]))
        for r in archive
    }
    heldout = [
        r for r in canonical_rows
        if r.get("cls") in KNOWN_CLASSES
        and r["id"] not in SI.DISPUTED
        and (r["name"], r["s"], r["stat"], r["N"], r["p"], tuple(r["g"]))
        not in archive_fingerprints
    ]
    if not heldout:
        raise RuntimeError("Independent canonical holdout is empty.")

    coeff, diagnostic = SI.fit(archive, VARIANTS[variant_name])
    pred = SI.predict(heldout, coeff, VARIANTS[variant_name])
    details = [
        interval_detail(row, p, variant_name, "INDEPENDENT_CANONICAL")
        for row, p in zip(heldout, pred, strict=True)
    ]
    return {
        "variant": variant_name,
        "trainRows": len(archive),
        "heldoutRows": len(heldout),
        "heldoutEvents": len({r["id"] for r in heldout}),
        "fitDiagnostic": diagnostic,
        "coefficients": [float(x) for x in coeff],
        "metrics": SI.score(heldout, pred),
        "details": details,
        "exclusions": {
            "qualityDisputedIds": sorted(SI.DISPUTED),
            "exactCrossSourceDuplicatesRemoved": True,
        },
    }


def write_csv(path: pathlib.Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    headers = list(rows[0])
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def fmt_pct(value: Any) -> str:
    return "n/a" if not finite_number(value) else f"{float(value) * 100:.1f}%"


def fmt_num(value: Any) -> str:
    return "n/a" if not finite_number(value) else f"{float(value):.3f}"


def metric_line(label: str, metrics: dict[str, Any]) -> str:
    return (
        f"| {label} | {metrics.get('n', 0)} | {metrics.get('events', 0)} | "
        f"{fmt_pct(metrics.get('overlap'))} | "
        f"{fmt_num(metrics.get('endpoint_rounding_mae'))} | "
        f"{fmt_num(metrics.get('mean_separation'))} |"
    )


def report_markdown(report: dict[str, Any]) -> str:
    selected = report["selectedPlayer"]
    lines = [
        "# Resource Coach seeded corpus holdout",
        "",
        f"- Seed: `{report['seed']}`",
        f"- Selected player: **{selected['playerName']}** (`{selected['playerId']}`)",
        f"- Selection index: {selected['selectionIndex']} of {report['eligiblePlayers']}",
        f"- Eligible archive rows: {report['archiveRows']}",
        f"- Current research structure: `{CURRENT_VARIANT}` = beta .0354, WHITE threshold 135, MID_GREY threshold 120, tier-adjusted WHITE coordinate.",
        f"- Live hypothesis ledger: `{report['liveCandidate']['modelVersion']}` ({report['liveCandidate']['status']}).",
        "",
        "## Primary metrics",
        "",
        "| Evaluation | Stat rows | Events | Interval overlap | Endpoint rounding MAE | Mean non-overlap gap |",
        "|---|---:|---:|---:|---:|---:|",
        metric_line("Seeded selected-player holdout", selected["current"]["metrics"]),
        metric_line("All-player LOPO", report["allPlayerLopo"][CURRENT_VARIANT]["metrics"]),
        metric_line("Independent canonical workbook", report["canonicalHoldout"][CURRENT_VARIANT]["metrics"]),
        "",
        "## Structural controls — all-player LOPO",
        "",
        "| Variant | Stat rows | Events | Interval overlap | Endpoint rounding MAE | Mean non-overlap gap |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name, result in report["allPlayerLopo"].items():
        lines.append(metric_line(name, result["metrics"]))

    lines.extend([
        "",
        "## Selected-player worst residuals",
        "",
        "| Event | Stat | Predicted | Observed | Gap |",
        "|---|---|---:|---:|---:|",
    ])
    worst = sorted(
        selected["current"]["details"],
        key=lambda r: (r["interval_gap"], r["endpoint_mae_literal"]),
        reverse=True,
    )[:12]
    for row in worst:
        lines.append(
            f"| {row['event_id']} | {row['stat']} | "
            f"[{row['pred_lo']:.2f}, {row['pred_hi']:.2f}] | "
            f"[{row['obs_lo']:.2f}, {row['obs_hi']:.2f}] | "
            f"{row['interval_gap']:.2f} |"
        )

    lines.extend([
        "",
        "## Interpretation boundary",
        "",
        "- The selected player is completely excluded from that fold's fit.",
        "- The all-player result repeats the same exclusion for every player; the seeded spotlight cannot be cherry-picked into the aggregate.",
        "- The canonical holdout removes disputed records and exact archive duplicates before scoring.",
        "- This is a research diagnostic. It does not promote coefficients, mutate app profiles, or claim the game mechanism is identified.",
        "- The 23 Sep Skill-Seminar/Focused/allocation hypotheses remain a separate testing ledger; where they are not implemented as a complete predictive law, this workflow does not fabricate missing equations.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", default="vader-20260923")
    parser.add_argument("--player", default=None)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    archive = archived_rows()
    names = player_names(archive)
    selected_id, selected_name, selected_index = choose_player(
        archive, args.seed, args.player
    )

    live_candidate = json.loads(LIVE_CANDIDATE_PATH.read_text(encoding="utf-8"))
    selected_variants = {
        name: evaluate_player(archive, selected_id, name)
        for name in VARIANTS
    }
    lopo = {
        name: exhaustive_lopo(archive, name)
        for name in VARIANTS
    }
    canonical = {
        name: independent_canonical_holdout(archive, name)
        for name in VARIANTS
    }

    report = {
        "schemaVersion": "resource-coach-seeded-corpus-holdout-v1",
        "seed": args.seed,
        "requestedPlayer": args.player,
        "archiveRows": len(archive),
        "eligiblePlayers": len(names),
        "modelSource": str(SI_PATH.relative_to(ROOT)),
        "liveCandidateSource": str(LIVE_CANDIDATE_PATH.relative_to(ROOT)),
        "liveCandidate": {
            "modelVersion": live_candidate.get("modelVersion"),
            "status": live_candidate.get("status"),
            "principles": live_candidate.get("principles", []),
        },
        "variantDefinitions": {
            name: {
                "beta": v[0],
                "whiteThreshold": v[1],
                "midGreyThreshold": v[2],
                "tierAdjustedWhite": v[3],
            }
            for name, v in VARIANTS.items()
        },
        "selectedPlayer": {
            "playerId": selected_id,
            "playerName": selected_name,
            "selectionIndex": selected_index,
            "current": selected_variants[CURRENT_VARIANT],
            "variants": selected_variants,
        },
        "allPlayerLopo": lopo,
        "canonicalHoldout": canonical,
        "safeguards": [
            "Seed selection is SHA-256 deterministic over sorted eligible player ids.",
            "Held-out player rows never enter that fold's fit.",
            "All-player LOPO repeats the same procedure for every eligible player.",
            "Canonical transfer excludes disputed records and exact archive duplicates.",
            "Observed low/high endpoints remain separate; no midpoint fitting is introduced here.",
            "No production profile or app state is modified by this workflow.",
        ],
    }

    (out_dir / "summary.json").write_text(
        json.dumps(report, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    (out_dir / "REPORT.md").write_text(report_markdown(report), encoding="utf-8")

    selected_rows: list[dict[str, Any]] = []
    for result in selected_variants.values():
        selected_rows.extend(result["details"])
    write_csv(out_dir / "selected-player-predictions.csv", selected_rows)

    all_rows: list[dict[str, Any]] = []
    for result in lopo.values():
        all_rows.extend(result["details"])
    write_csv(out_dir / "all-player-lopo-predictions.csv", all_rows)

    canonical_rows: list[dict[str, Any]] = []
    for result in canonical.values():
        canonical_rows.extend(result["details"])
    write_csv(out_dir / "canonical-holdout-predictions.csv", canonical_rows)

    fold_rows: list[dict[str, Any]] = []
    for variant_name, result in lopo.items():
        for fold in result["folds"]:
            m = fold["metrics"]
            fold_rows.append({
                "variant": variant_name,
                "player_id": fold["player"],
                "player_name": fold["playerName"],
                "train_rows": fold["trainRows"],
                "heldout_rows": fold["heldoutRows"],
                "heldout_events": fold["heldoutEvents"],
                "overlap": m.get("overlap"),
                "endpoint_rounding_mae": m.get("endpoint_rounding_mae"),
                "mean_separation": m.get("mean_separation"),
            })
    write_csv(out_dir / "per-player-fold-summary.csv", fold_rows)

    compact = {
        "seed": report["seed"],
        "selectedPlayer": {
            "id": selected_id,
            "name": selected_name,
            "metrics": selected_variants[CURRENT_VARIANT]["metrics"],
        },
        "allPlayerLopo": lopo[CURRENT_VARIANT]["metrics"],
        "canonicalHoldout": canonical[CURRENT_VARIANT]["metrics"],
    }
    print(json.dumps(compact, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
