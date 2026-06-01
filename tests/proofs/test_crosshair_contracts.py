# tests/proofs/test_crosshair_contracts.py
#
# Crosshair symbolic contract verification for the Squad Optimiser engine.
# Properties P5, P6, P8, P9, P16, P17 — all requiring symbolic execution
# of the iterative loop and list-processing functions.
#
# Crosshair uses symbolic execution to find counterexamples to PEP 316
# docstring contracts on the pure Python functions in verification/engine_pure.py.
# If no counterexample is found within the timeout, the contract is considered
# verified for all reachable inputs in that domain.
#
# Run with:  pytest tests/proofs/ -m proof -v --timeout=30
#            (requires: pip install crosshair-tool)
#
# Properties:
#   P5  : budget > 0 ∧ mult > 0 → gain ≥ 0
#   P6  : gain ≤ STAT_CAP − start_stat
#   P8  : budget₁ ≥ budget₂ ≥ 0 → gain(budget₁) ≥ gain(budget₂)
#   P9  : mult₁ ≥ mult₂ > 0 → gain(mult₁) ≥ gain(mult₂)
#   P16 : apply_season_decay never produces negative stat values
#   P17 : more levels → lower or equal stat values (non-increasing in levels)

import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

try:
    from crosshair.core import analyze_function, AnalysisOptions, MessageType
    _CROSSHAIR_AVAILABLE = True
except ImportError:
    _CROSSHAIR_AVAILABLE = False

pytestmark = pytest.mark.proof
_skip = pytest.mark.skipif(not _CROSSHAIR_AVAILABLE, reason="crosshair-tool not installed")

from verification.engine_pure import stat_gain_from_budget, apply_season_decay
from verification.constants_pure import STAT_CAP


def _verify(fn, timeout: int = 10) -> list:
    """Run Crosshair analysis on fn and return any contract violations."""
    try:
        opts = AnalysisOptions(per_condition_timeout=timeout)
    except TypeError:
        opts = AnalysisOptions()
    return [
        m for m in analyze_function(fn, opts)
        if m.state in (MessageType.POST_FAIL, MessageType.EXEC_EXCEPTION)
    ]


# ── P5: gain ≥ 0 ──────────────────────────────────────────────────────────────

@_skip
def test_p5_gain_nonnegative():
    """P5: budget > 0 ∧ mult > 0 → stat_gain_from_budget ≥ 0."""
    def p5_contract(start_stat: float, budget: float, mult: float) -> None:
        """
        pre: 0.0 <= start_stat <= 9999.0
        pre: budget > 0.0
        pre: mult > 0.0
        post: stat_gain_from_budget(start_stat, budget, mult) >= 0.0
        """
        result = stat_gain_from_budget(start_stat, budget, mult)
        assert result >= 0.0, f"P5 violated: gain={result} for start={start_stat}, budget={budget}, mult={mult}"

    violations = _verify(p5_contract)
    assert not violations, f"P5 counterexample: {violations[0]}"


# ── P6: gain ≤ STAT_CAP − start_stat ─────────────────────────────────────────

@_skip
def test_p6_gain_bounded():
    """P6: stat_gain_from_budget ≤ STAT_CAP − start_stat."""
    def p6_contract(start_stat: float, budget: float, mult: float) -> None:
        """
        pre: 0.0 <= start_stat <= 9999.0
        pre: budget >= 0.0
        pre: mult > 0.0
        post: stat_gain_from_budget(start_stat, budget, mult) <= 9999.0 - start_stat
        """
        result = stat_gain_from_budget(start_stat, budget, mult)
        assert result <= STAT_CAP - start_stat, (
            f"P6 violated: gain={result}, cap_remaining={STAT_CAP - start_stat}"
        )

    violations = _verify(p6_contract)
    assert not violations, f"P6 counterexample: {violations[0]}"


# ── P8: gain monotone in budget ───────────────────────────────────────────────

@_skip
def test_p8_gain_monotone_in_budget():
    """P8: budget₁ ≥ budget₂ ≥ 0 → gain(budget₁) ≥ gain(budget₂)."""
    def p8_contract(start_stat: float, budget1: float, budget2: float, mult: float) -> None:
        """
        pre: 0.0 <= start_stat <= 9999.0
        pre: budget1 >= budget2 >= 0.0
        pre: mult > 0.0
        post: stat_gain_from_budget(start_stat, budget1, mult) >= stat_gain_from_budget(start_stat, budget2, mult)
        """
        g1 = stat_gain_from_budget(start_stat, budget1, mult)
        g2 = stat_gain_from_budget(start_stat, budget2, mult)
        assert g1 >= g2, f"P8 violated: gain({budget1})={g1} < gain({budget2})={g2}"

    violations = _verify(p8_contract)
    assert not violations, f"P8 counterexample: {violations[0]}"


# ── P9: gain monotone in mult ─────────────────────────────────────────────────

@_skip
def test_p9_gain_monotone_in_mult():
    """P9: mult₁ ≥ mult₂ > 0 → gain(mult₁) ≥ gain(mult₂)."""
    def p9_contract(start_stat: float, budget: float, mult1: float, mult2: float) -> None:
        """
        pre: 0.0 <= start_stat <= 9999.0
        pre: mult1 >= mult2 > 0.0
        pre: budget >= 0.0
        post: stat_gain_from_budget(start_stat, budget, mult1) >= stat_gain_from_budget(start_stat, budget, mult2)
        """
        g1 = stat_gain_from_budget(start_stat, budget, mult1)
        g2 = stat_gain_from_budget(start_stat, budget, mult2)
        assert g1 >= g2, f"P9 violated: gain(mult={mult1})={g1} < gain(mult={mult2})={g2}"

    violations = _verify(p9_contract)
    assert not violations, f"P9 counterexample: {violations[0]}"


# ── P16: season decay never produces negative stats ───────────────────────────

@_skip
def test_p16_decay_non_negative():
    """P16: apply_season_decay never produces negative stat values."""
    def p16_contract(values: list, levels: int, decay_per: float) -> None:
        """
        pre: len(values) <= 15
        pre: all(0.0 <= v <= 10000.0 for v in values)
        pre: 0 <= levels <= 10
        pre: 0.0 <= decay_per <= 100.0
        post: all(v >= 0.0 for v in apply_season_decay(values, levels, decay_per))
        """
        result = apply_season_decay(values, levels, decay_per)
        for i, v in enumerate(result):
            assert v >= 0.0, f"P16 violated: stat[{i}]={v} < 0"

    violations = _verify(p16_contract)
    assert not violations, f"P16 counterexample: {violations[0]}"


# ── P17: decay is non-increasing in levels ────────────────────────────────────

@_skip
def test_p17_decay_non_increasing_in_levels():
    """P17: more levels → lower or equal stat values."""
    def p17_contract(values: list, levels1: int, levels2: int, decay_per: float) -> None:
        """
        pre: len(values) <= 15
        pre: all(0.0 <= v <= 10000.0 for v in values)
        pre: levels1 >= levels2 >= 0
        pre: 0.0 <= decay_per <= 100.0
        post: all(
            apply_season_decay(values, levels1, decay_per)[i] <=
            apply_season_decay(values, levels2, decay_per)[i]
            for i in range(len(values))
        )
        """
        after1 = apply_season_decay(values, levels1, decay_per)
        after2 = apply_season_decay(values, levels2, decay_per)
        for i in range(len(values)):
            assert after1[i] <= after2[i], (
                f"P17 violated at index {i}: levels={levels1} gives {after1[i]}"
                f" > levels={levels2} gives {after2[i]}"
            )

    violations = _verify(p17_contract)
    assert not violations, f"P17 counterexample: {violations[0]}"
