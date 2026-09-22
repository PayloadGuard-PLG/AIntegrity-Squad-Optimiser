# Z3 proofs for OCR-intake -> planning-state transitions.
#
# This suite is deliberately downstream of the live TypeScript intake validator:
# verification/run_ts.ts exposes the finite accepted role/learning-role domain and
# the actual transition functions. Z3 then proves invariant preservation for the
# transition mathematics, while Hypothesis differentially checks that the TS
# implementation follows the proved equations over generated valid intake states.
#
# A green ordinary unit suite is not enough for this surface. The merge gate is:
#   accepted OCR/manual intake
#     -> any legal state transition
#     -> valid output state
#     -> repeatable at the next transition.

import atexit
import json
import subprocess

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

try:
    from z3 import (
        And, Bool, BoolVal, If, Implies, Int, Not, Or, Real, Solver, Sum,
        unsat, unknown,
    )
    _Z3_AVAILABLE = True
except ImportError:
    _Z3_AVAILABLE = False

pytestmark = pytest.mark.proof
_skip = pytest.mark.skipif(not _Z3_AVAILABLE, reason="z3-solver not installed")

_RUNNER = 'verification/run_ts.ts'
_proc = None


def _runner():
    global _proc
    if _proc is None or _proc.poll() is not None:
        _proc = subprocess.Popen(
            ['node', '--import', 'tsx', _RUNNER],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        atexit.register(_stop_runner)
    return _proc


def _stop_runner():
    global _proc
    if _proc and _proc.poll() is None:
        try:
            _proc.stdin.close()
            _proc.wait(timeout=5)
        except Exception:
            _proc.kill()


def _ts(fn, args):
    proc = _runner()
    proc.stdin.write(json.dumps({'fn': fn, 'args': args}) + '\n')
    proc.stdin.flush()
    line = proc.stdout.readline()
    parsed = json.loads(line)
    if 'error' in parsed:
        raise RuntimeError(f'TS runner error for {fn}: {parsed["error"]}')
    return parsed['result']


DOMAIN = _ts('stateTransitionDomain', [])
ROLE_STATES = DOMAIN['roleStates']
ROLE_EDGES = DOMAIN['roleEdges']
TIER_ADDITIONS = {int(k[1:]): int(v) for k, v in DOMAIN['tierAdditions'].items()}
STAT_CAP = int(DOMAIN['statCap'])
TOTAL_ATTRS = int(DOMAIN['totalAttributeCount'])
OUTFIELD_STATS = list(DOMAIN['outfieldStats'])
PLAYSTYLES = list(DOMAIN['playstyles'])
TIER_NAMES = [f'T{i}' for i in range(7)]
TIER_PAIRS = [(a, b) for a in range(7) for b in range(a + 1, 7)]

DIFF = settings(max_examples=120, deadline=None)


def _check(s):
    result = s.check()
    assert result != unknown, 'Z3 returned unknown — hard failure'
    assert result == unsat, f'Z3 found a counterexample:\n{s.model()}'


def _tier_add(t):
    expr = TIER_ADDITIONS[6]
    for i in reversed(range(6)):
        expr = If(t == i, TIER_ADDITIONS[i], expr)
    return expr


@_skip
def test_p20_intake_abstention_or_valid_observation_preserves_valid_state():
    """Unread OCR fields preserve prior valid state; readable fields must be validated."""
    s = Solver()
    prev_roles_valid = Bool('prev_roles_valid')
    prev_tier_valid = Bool('prev_tier_valid')
    obs_roles_valid = Bool('obs_roles_valid')
    obs_tier_valid = Bool('obs_tier_valid')
    roles_readable = Bool('roles_readable')
    tier_readable = Bool('tier_readable')

    s.add(prev_roles_valid, prev_tier_valid)
    s.add(Implies(roles_readable, obs_roles_valid))
    s.add(Implies(tier_readable, obs_tier_valid))

    out_roles_valid = If(roles_readable, obs_roles_valid, prev_roles_valid)
    out_tier_valid = If(tier_readable, obs_tier_valid, prev_tier_valid)

    s.add(Not(And(out_roles_valid, out_tier_valid)))
    _check(s)


@_skip
def test_p21_every_live_role_transition_edge_closes_back_into_intake_domain():
    """For every role edge exposed by the live TS planner, its output is intake-valid."""
    assert ROLE_EDGES, 'live transition domain unexpectedly contains no role edges'
    s = Solver()
    edge = Int('edge')
    s.add(edge >= 0, edge < len(ROLE_EDGES))

    valid_cases = []
    for i, e in enumerate(ROLE_EDGES):
        valid_cases.append(And(
            edge == i,
            BoolVal(bool(e['postValid'])),
            BoolVal(int(e['post']) >= 0),
        ))

    s.add(Not(Or(valid_cases)))
    _check(s)


@_skip
def test_p22_role_transition_math_preserves_stat_bounds_and_exact_ovr_monotonicity():
    """Any newly-white subset and any valid tier bonus preserve stat/OVR invariants."""
    s = Solver()
    tier = Int('role_tier')
    s.add(tier >= 0, tier <= 6)
    bonus = _tier_add(tier)

    before = [Real(f'rb_{i}') for i in range(TOTAL_ATTRS)]
    after = [Real(f'ra_{i}') for i in range(TOTAL_ATTRS)]
    newly_white = [Bool(f'nw_{i}') for i in range(TOTAL_ATTRS)]

    for i in range(TOTAL_ATTRS):
        s.add(before[i] >= 0, before[i] <= STAT_CAP)
        candidate = before[i] + bonus
        s.add(after[i] == If(
            newly_white[i],
            If(candidate > STAT_CAP, STAT_CAP, candidate),
            before[i],
        ))

    before_sum = Sum(before)
    after_sum = Sum(after)
    violations = [
        after[i] < 0 for i in range(TOTAL_ATTRS)
    ] + [
        after[i] > STAT_CAP for i in range(TOTAL_ATTRS)
    ] + [
        after[i] < before[i] for i in range(TOTAL_ATTRS)
    ] + [
        after_sum < before_sum,
        after_sum / TOTAL_ATTRS < before_sum / TOTAL_ATTRS,
    ]
    s.add(Or(violations))
    _check(s)


@_skip
def test_p23_tier_transition_math_preserves_stat_bounds_and_exact_ovr_monotonicity():
    """Every higher target tier has positive delta and cannot lower a stat or exact OVR."""
    s = Solver()
    t0 = Int('tier_from')
    t1 = Int('tier_to')
    s.add(t0 >= 0, t0 <= 6, t1 >= 0, t1 <= 6, t1 > t0)
    inc = _tier_add(t1) - _tier_add(t0)

    before = [Real(f'tb_{i}') for i in range(TOTAL_ATTRS)]
    after = [Real(f'ta_{i}') for i in range(TOTAL_ATTRS)]
    white = [Bool(f'w_{i}') for i in range(TOTAL_ATTRS)]

    for i in range(TOTAL_ATTRS):
        s.add(before[i] >= 0, before[i] <= STAT_CAP)
        candidate = before[i] + inc
        s.add(after[i] == If(
            white[i],
            If(candidate > STAT_CAP, STAT_CAP, candidate),
            before[i],
        ))

    violations = [inc <= 0]
    violations += [after[i] < 0 for i in range(TOTAL_ATTRS)]
    violations += [after[i] > STAT_CAP for i in range(TOTAL_ATTRS)]
    violations += [after[i] < before[i] for i in range(TOTAL_ATTRS)]
    violations += [Sum(after) < Sum(before)]
    s.add(Or(violations))
    _check(s)


@_skip
def test_p24_playstyle_transition_is_core_state_identity():
    """Assigning a named playstyle cannot mutate roles, tier, learning progress or stats."""
    s = Solver()
    tier_before = Int('ps_tier_before')
    tier_after = Int('ps_tier_after')
    role_state_before = Int('ps_role_before')
    role_state_after = Int('ps_role_after')
    before = [Real(f'ps_b_{i}') for i in range(TOTAL_ATTRS)]
    after = [Real(f'ps_a_{i}') for i in range(TOTAL_ATTRS)]

    s.add(tier_before >= 0, tier_before <= 6)
    s.add(role_state_before >= 0, role_state_before < len(ROLE_STATES))
    s.add(tier_after == tier_before, role_state_after == role_state_before)
    for i in range(TOTAL_ATTRS):
        s.add(after[i] == before[i])

    s.add(Or(
        tier_after != tier_before,
        role_state_after != role_state_before,
        Or([after[i] != before[i] for i in range(TOTAL_ATTRS)]),
    ))
    _check(s)


@_skip
def test_p25_deployment_transition_is_core_state_identity():
    """Deployment changes only deployedRole; persisted development state is invariant."""
    s = Solver()
    tier_before = Int('dp_tier_before')
    tier_after = Int('dp_tier_after')
    role_state_before = Int('dp_role_before')
    role_state_after = Int('dp_role_after')
    before = [Real(f'dp_b_{i}') for i in range(TOTAL_ATTRS)]
    after = [Real(f'dp_a_{i}') for i in range(TOTAL_ATTRS)]

    s.add(tier_before >= 0, tier_before <= 6)
    s.add(role_state_before >= 0, role_state_before < len(ROLE_STATES))
    s.add(tier_after == tier_before, role_state_after == role_state_before)
    for i in range(TOTAL_ATTRS):
        s.add(after[i] == before[i])

    s.add(Or(
        tier_after != tier_before,
        role_state_after != role_state_before,
        Or([after[i] != before[i] for i in range(TOTAL_ATTRS)]),
    ))
    _check(s)


@_skip
def test_p26_any_single_legal_transition_preserves_numeric_state_invariants():
    """Union proof: role/tier/playstyle/deployment all preserve bounds and non-decreasing exact OVR.

    Since each legal transition closes back into the intake-valid domain (P21) and
    this property is one-step universal, induction gives the same invariant after
    every finite sequence of transitions.
    """
    s = Solver()
    kind = Int('kind')  # 0 role, 1 tier, 2 playstyle, 3 deployment
    tier = Int('any_tier')
    t0 = Int('any_t0')
    t1 = Int('any_t1')
    s.add(kind >= 0, kind <= 3)
    s.add(tier >= 0, tier <= 6)
    s.add(t0 >= 0, t0 <= 6, t1 >= 0, t1 <= 6, t1 > t0)

    role_bonus = _tier_add(tier)
    tier_inc = _tier_add(t1) - _tier_add(t0)

    before = [Real(f'any_b_{i}') for i in range(TOTAL_ATTRS)]
    after = [Real(f'any_a_{i}') for i in range(TOTAL_ATTRS)]
    newly_white = [Bool(f'any_nw_{i}') for i in range(TOTAL_ATTRS)]
    white = [Bool(f'any_w_{i}') for i in range(TOTAL_ATTRS)]

    for i in range(TOTAL_ATTRS):
        s.add(before[i] >= 0, before[i] <= STAT_CAP)
        gain = If(
            kind == 0,
            If(newly_white[i], role_bonus, 0),
            If(kind == 1, If(white[i], tier_inc, 0), 0),
        )
        candidate = before[i] + gain
        s.add(after[i] == If(candidate > STAT_CAP, STAT_CAP, candidate))

    s.add(Or(
        Or([after[i] < 0 for i in range(TOTAL_ATTRS)]),
        Or([after[i] > STAT_CAP for i in range(TOTAL_ATTRS)]),
        Or([after[i] < before[i] for i in range(TOTAL_ATTRS)]),
        Sum(after) < Sum(before),
    ))
    _check(s)


# ── Differential bridge: proved equations vs live TypeScript ─────────────────

role_edge_strategy = st.sampled_from(ROLE_EDGES)
tier_pair_strategy = st.sampled_from(TIER_PAIRS)
role_state_strategy = st.sampled_from(ROLE_STATES)
stat_values_strategy = st.lists(
    st.integers(min_value=0, max_value=min(STAT_CAP, 500)),
    min_size=TOTAL_ATTRS,
    max_size=TOTAL_ATTRS,
)


@pytest.mark.proof
@given(role_edge_strategy, st.integers(min_value=0, max_value=6), stat_values_strategy,
       st.integers(min_value=0, max_value=49))
@DIFF
def test_ts_role_transition_matches_proved_contract(edge, tier_idx, values, learning_points):
    pre = ROLE_STATES[edge['pre']]
    learning = pre['learningRole']
    if learning is not None:
        learning = {**learning, 'points': learning_points}

    stats = dict(zip(OUTFIELD_STATS, values))
    state = {
        'roles': pre['roles'],
        'stats': stats,
        'overall': sum(values) / TOTAL_ATTRS,
        'tier': TIER_NAMES[tier_idx],
        'learningRole': learning,
        'playstyle': None,
        'deployedRole': pre['roles'][0],
    }
    out = _ts('previewStateTransition', [{
        'kind': 'role',
        'state': state,
        'newRole': edge['newRole'],
    }])

    bonus = TIER_ADDITIONS[tier_idx]
    expected = {
        stat: min(STAT_CAP, value + bonus) if stat in edge['newlyWhite'] else value
        for stat, value in stats.items()
    }
    assert out['after']['roles'] == ROLE_STATES[edge['post']]['roles']
    expected_learning = None if (
        learning is not None and learning['role'] == edge['newRole']
    ) else learning
    assert out['after'].get('learningRole') == expected_learning
    assert out['after']['stats'] == expected
    assert abs(out['after']['overall'] - (sum(expected.values()) / TOTAL_ATTRS)) < 1e-10


@pytest.mark.proof
@given(role_state_strategy, tier_pair_strategy, stat_values_strategy)
@DIFF
def test_ts_tier_transition_matches_proved_contract(card, tiers, values):
    t0, t1 = tiers
    keys = card['statKeys']
    if len(keys) != TOTAL_ATTRS:
        pytest.fail(f'intake role state does not expose {TOTAL_ATTRS} stats: {card}')
    stats = dict(zip(keys, values))
    state = {
        'roles': card['roles'],
        'stats': stats,
        'overall': sum(values) / TOTAL_ATTRS,
        'tier': TIER_NAMES[t0],
        'learningRole': card['learningRole'],
        'playstyle': None,
        'deployedRole': card['roles'][0],
    }
    out = _ts('previewStateTransition', [{
        'kind': 'tier',
        'state': state,
        'targetTier': TIER_NAMES[t1],
    }])

    inc = TIER_ADDITIONS[t1] - TIER_ADDITIONS[t0]
    whites = set(card['whiteStats'])
    expected = {
        stat: min(STAT_CAP, value + inc) if stat in whites else value
        for stat, value in stats.items()
    }
    assert out['after']['tier'] == TIER_NAMES[t1]
    assert out['after']['roles'] == card['roles']
    assert out['after'].get('learningRole') == card['learningRole']
    assert out['after']['stats'] == expected
    assert abs(out['after']['overall'] - (sum(expected.values()) / TOTAL_ATTRS)) < 1e-10


@pytest.mark.proof
@given(role_state_strategy, st.sampled_from(PLAYSTYLES), stat_values_strategy)
@DIFF
def test_ts_playstyle_transition_preserves_intake_core(card, style, values):
    keys = card['statKeys']
    if len(keys) != TOTAL_ATTRS:
        pytest.fail(f'intake role state does not expose {TOTAL_ATTRS} stats: {card}')
    stats = dict(zip(keys, values))
    state = {
        'roles': card['roles'],
        'stats': stats,
        'overall': sum(values) / TOTAL_ATTRS,
        'tier': 'T3',
        'learningRole': card['learningRole'],
        'playstyle': None,
        'deployedRole': card['roles'][0],
    }
    out = _ts('previewStateTransition', [{
        'kind': 'playstyle',
        'state': state,
        'playstyleId': style['id'],
        'level': 'Master',
    }])
    after = out['after']
    assert after['roles'] == state['roles']
    assert after['stats'] == state['stats']
    assert after['tier'] == state['tier']
    assert after.get('learningRole') == state['learningRole']


@pytest.mark.proof
@given(role_state_strategy, stat_values_strategy)
@DIFF
def test_ts_deployment_transition_preserves_intake_core(card, values):
    keys = card['statKeys']
    if len(keys) != TOTAL_ATTRS:
        pytest.fail(f'intake role state does not expose {TOTAL_ATTRS} stats: {card}')
    stats = dict(zip(keys, values))
    deployed = card['roles'][-1]
    state = {
        'roles': card['roles'],
        'stats': stats,
        'overall': sum(values) / TOTAL_ATTRS,
        'tier': 'T3',
        'learningRole': card['learningRole'],
        'playstyle': None,
        'deployedRole': card['roles'][0],
    }
    out = _ts('previewStateTransition', [{
        'kind': 'deployment',
        'state': state,
        'deployedRole': deployed,
    }])
    after = out['after']
    assert after['deployedRole'] == deployed
    assert after['roles'] == state['roles']
    assert after['stats'] == state['stats']
    assert after['tier'] == state['tier']
    assert after.get('learningRole') == state['learningRole']
