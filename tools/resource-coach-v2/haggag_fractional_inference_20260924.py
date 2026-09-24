#!/usr/bin/env python3
"""Reproduce the Haggag fractional-observation diagnostics.

Research-only. This deliberately does not import or modify production Resource Coach
logic. The frozen JSON is evidence/derived observations; this script recomputes the
sequence-level conclusions that can be checked without fitting a coach target.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "calibration" / "resource-coach-identification" / "haggag-fractional-sequence-20260924.json"


def flatten(window):
    return [(str(t), int(d)) for t, d in window]


def suffix_prefix_overlap(newer, older):
    """Rows are newest->oldest. Return exact shared boundary length."""
    best = 0
    for k in range(1, min(len(newer), len(older)) + 1):
        if newer[-k:] == older[:k]:
            best = k
    return best


def merge_newest_to_oldest(windows, order):
    merged = list(windows[order[0]])
    overlaps = {}
    for key in order[1:]:
        newer = list(windows[key])
        k = suffix_prefix_overlap(newer, merged)
        overlaps[f"{key}_to_previous"] = k
        merged = newer[: len(newer) - k] + merged
    return merged, overlaps


def wilson_interval(k, n, z=1.959963984540054):
    if n == 0:
        return [math.nan, math.nan]
    p = k / n
    den = 1.0 + z * z / n
    center = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [center - half, center + half]


def max_run(values, target):
    best = cur = 0
    for value in values:
        if value == target:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


def gain_lags(gains):
    d = gains["DRIBBLING"]
    f = gains["FINISHING"]
    out = []
    for rid in d:
        later = [x for x in f if x > rid]
        out.append(None if not later else min(later) - rid)
    return out


def main():
    data = json.loads(DATA.read_text())
    windows = {k: flatten(v) for k, v in data["teamplayHistory"]["windows"].items()}
    order = ["142238", "142244", "142249", "142255", "142259"]
    merged, overlaps = merge_newest_to_oldest(windows, order)

    drains = [-d for _, d in merged]
    ones = sum(x == 1 for x in drains)
    twos = sum(x == 2 for x in drains)

    # A single exact 1.35 decrement with a persistent floor/nearest phase cannot
    # produce adjacent integer losses of 2: after a 2, phase advances by 0.65,
    # so the next displayed loss must be 1. The original Teamplay windows contain
    # adjacent twos directly, independent of cross-screenshot deduplication.
    direct_adjacent_twos = any(
        (-a[1] == 2 and -b[1] == 2)
        for window in windows.values()
        for a, b in zip(window, window[1:])
    )

    seq = data["sequence"]
    reports = seq["capturedTrainingReports"]
    forced_missing = seq["minimumMissingRunsForcedByDeltas"]
    min_runs = reports + forced_missing

    aggregate = seq["aggregateIfInitialConditionWas100"]
    total = aggregate["visibleConditionConsumed"]
    required_twos = total - min_runs
    required_ones = min_runs - required_twos

    assert min_runs == seq["minimumActualRuns"]
    assert required_twos == 43 and required_ones == 80
    assert direct_adjacent_twos
    assert data["player"]["visibleGain"]["total"] == 21
    assert data["endpointConservation"]["directlyRenderedPoints"] == 19

    lags = gain_lags(data["directVisibleStatGainReports"])

    result = {
        "teamplayKnownUnique": {
            "rows": len(merged),
            "ones": ones,
            "twos": twos,
            "twoRate": twos / len(merged),
            "meanDrain": sum(drains) / len(merged),
            "wilson95TwoRate": wilson_interval(twos, len(merged)),
            "maxConsecutiveTwos": max_run(drains, 2),
            "directAdjacentTwos": direct_adjacent_twos,
            "overlaps": overlaps,
        },
        "minimumRunReconstruction": {
            "capturedReports": reports,
            "forcedMissingRuns": forced_missing,
            "minimumRuns": min_runs,
            "conditionalInitialCondition": 100,
            "aggregateVisibleDrain": total,
            "nominalAt1_35": min_runs * data["drill"]["configuredDrainPct"],
            "differenceObservedMinusNominal": total - min_runs * data["drill"]["configuredDrainPct"],
            "onesRequiredIfEveryRunSettlesTo1or2": required_ones,
            "twosRequiredIfEveryRunSettlesTo1or2": required_twos,
            "twoRate": required_twos / min_runs,
            "wilson95TwoRate": wilson_interval(required_twos, min_runs),
        },
        "statSequence": {
            "visibleEndpointGain": data["player"]["visibleGain"],
            "directGainReports": data["directVisibleStatGainReports"],
            "dribblingToNextFinishingReportIdLags": lags,
            "note": (
                "Report-id lag is descriptive only because two recovery slots and "
                "at least eight uncaptured runs exist. Phase inference must model "
                "missing runs as latent integers rather than treating report id as run id."
            ),
        },
        "decision": {
            "conditionPersistentCarry": "falsified",
            "conditionIndependentIntegerSettlement": "compatible-not-proven",
            "singleGlobalStatFraction": "not-supported-by-existing-coach-recheck",
            "nextModel": (
                "stat-specific latent phase/dose fitted from the drill sequence only, "
                "then propagated through frozen M1/M*/M** coach response"
            ),
        },
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
