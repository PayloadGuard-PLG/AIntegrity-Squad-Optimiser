// verification/dafny/budget_model.dfy
//
// Machine-checked proofs of the geometric session budget model.
// Corresponds to P1–P4 from the verification spec.
//
// Budget formula (from engineMath.ts :: coachBudgetPerStat):
//   effectiveSessions = (1 - decay^N) / (1 - decay)   when 0 < decay < 1, N > 0
//   budget = effectiveSessions × baseXps / numStats
//
// Tool:   Dafny 4.x — discharges VCs via Boogie + Z3
// Verify: dafny verify verification/dafny/budget_model.dfy
//
// Citation: K.R.M. Leino. Dafny: An Automatic Program Verifier for Functional
//           Correctness. LPAR-16, LNCS 6355, pp. 348–370. Springer, 2010.

// ── Real-valued power (decay^n) ───────────────────────────────────────────────

ghost function RealPow(base: real, n: nat): real
    decreases n
{
    if n == 0 then 1.0 else base * RealPow(base, n - 1)
}

// Lemma: RealPow(base, n) > 0 when base > 0
lemma RealPowPositive(base: real, n: nat)
    requires base > 0.0
    ensures  RealPow(base, n) > 0.0
    decreases n
{
    if n > 0 { RealPowPositive(base, n - 1); }
}

// Lemma: 0 < base < 1 → 0 < base^n < 1  (for n ≥ 1)
lemma RealPowInUnit(base: real, n: nat)
    requires 0.0 < base < 1.0
    requires n >= 1
    ensures  0.0 < RealPow(base, n) < 1.0
    decreases n
{
    if n == 1 {
        assert RealPow(base, 1) == base * RealPow(base, 0);
        assert RealPow(base, 0) == 1.0;
    } else {
        RealPowInUnit(base, n - 1);
        // IH: 0 < base^(n-1) < 1
        // base^n = base × base^(n-1)
        // Lower: base > 0, base^(n-1) > 0  →  base^n > 0
        // Upper: base^n = base × base^(n-1) < 1 × base^(n-1) < 1 × 1 = 1
        var prev := RealPow(base, n - 1);
        assert RealPow(base, n) == base * prev;
    }
}

// Lemma: 0 < base < 1 → base^(n+1) < base^n  (strictly decreasing)
lemma RealPowDecreasing(base: real, n: nat)
    requires 0.0 < base < 1.0
    ensures  RealPow(base, n + 1) < RealPow(base, n)
{
    RealPowPositive(base, n);
    assert RealPow(base, n + 1) == base * RealPow(base, n);
    // base < 1, RealPow(base, n) > 0  →  base × RealPow(base,n) < RealPow(base,n)
}

// ── Effective sessions ─────────────────────────────────────────────────────────
// Models (1 - decay^N) / (1 - decay)

ghost function EffSessions(decay: real, n: nat): real
    requires 0.0 < decay < 1.0
{
    (1.0 - RealPow(decay, n)) / (1.0 - decay)
}

// ── P4: sessions = 0 → effectiveSessions = 0 → budget = 0 ─────────────────────
lemma P4_ZeroSessionsZeroBudget(decay: real)
    requires 0.0 < decay < 1.0
    ensures  EffSessions(decay, 0) == 0.0
{
    assert RealPow(decay, 0) == 1.0;
    assert 1.0 - decay > 0.0;
    // (1 - 1) / (1 - decay) == 0.0 / (1 - decay) == 0.0
    assert (1.0 - 1.0) / (1.0 - decay) == 0.0;
}

// ── P1: sessions ≥ 1 → effectiveSessions > 0 → budget > 0 ─────────────────────
lemma P1_PositiveBudget(decay: real, n: nat)
    requires 0.0 < decay < 1.0
    requires n >= 1
    ensures  EffSessions(decay, n) > 0.0
{
    RealPowInUnit(decay, n);
    // 0 < decay^n < 1  →  1 - decay^n > 0
    // 1 - decay > 0    →  (1 - decay^n) / (1 - decay) > 0
}

// ── P2: sessions₁ > sessions₂ → effectiveSessions₁ > effectiveSessions₂ ────────
// (Monotonicity — more sessions = strictly more effective sessions = more budget)
lemma P2_Monotone(decay: real, n1: nat, n2: nat)
    requires 0.0 < decay < 1.0
    requires n1 > n2
    ensures  EffSessions(decay, n1) > EffSessions(decay, n2)
    decreases n1 - n2
{
    if n2 == 0 {
        P1_PositiveBudget(decay, n1);
        P4_ZeroSessionsZeroBudget(decay);
    } else {
        // Reduce to step of 1: prove EffSessions(n) > EffSessions(n-1)
        if n1 == n2 + 1 {
            P2_OneStep(decay, n2);
        } else {
            P2_Monotone(decay, n1 - 1, n2);
            P2_OneStep(decay, n1 - 1);
        }
    }
}

lemma P2_OneStep(decay: real, n: nat)
    requires 0.0 < decay < 1.0
    requires n >= 1
    ensures  EffSessions(decay, n + 1) > EffSessions(decay, n)
{
    RealPowDecreasing(decay, n);
    assert 1.0 - decay > 0.0;
    assert 1.0 - RealPow(decay, n + 1) > 1.0 - RealPow(decay, n);
    assert (1.0 - RealPow(decay, n + 1)) / (1.0 - decay) > (1.0 - RealPow(decay, n)) / (1.0 - decay);
}

// Edge case: one step from 0
lemma P2_OneStepFromZero(decay: real)
    requires 0.0 < decay < 1.0
    ensures  EffSessions(decay, 1) > EffSessions(decay, 0)
{
    P4_ZeroSessionsZeroBudget(decay);
    P1_PositiveBudget(decay, 1);
}

// ── P3: effectiveSessions ≤ sessions (geometric ≤ linear) ─────────────────────
lemma P3_GeomLeqLinear(decay: real, n: nat)
    requires 0.0 < decay < 1.0
    ensures  EffSessions(decay, n) <= n as real
    decreases n
{
    if n == 0 {
        P4_ZeroSessionsZeroBudget(decay);
    } else {
        P3_GeomLeqLinear(decay, n - 1);
        RealPowInUnit(decay, n);
        // IH: EffSessions(n-1) ≤ n-1
        // EffSessions(n) = (1 - decay^n)/(1-decay)
        //                = EffSessions(n-1) + decay^(n-1)
        // Wait, let me verify this identity holds:
        // (1 - decay^n)/(1-decay) = (1 - decay^(n-1))/(1-decay) + decay^(n-1)
        // ↔ 1 - decay^n = 1 - decay^(n-1) + decay^(n-1)(1-decay)
        // ↔ 1 - decay^n = 1 - decay^(n-1) + decay^(n-1) - decay^n
        // ↔ 1 - decay^n = 1 - decay^n  ✓
        P3_StepIdentity(decay, n - 1);
        // Now: EffSessions(n) = EffSessions(n-1) + decay^(n-1)
        // By IH:  EffSessions(n-1) ≤ (n-1) as real
        // And:    decay^(n-1) ≤ 1  (since 0 < decay < 1)
        RealPowPositive(decay, n - 1);
    }
}

// Identity: EffSessions(n+1) = EffSessions(n) + decay^n
lemma P3_StepIdentity(decay: real, n: nat)
    requires 0.0 < decay < 1.0
    ensures  EffSessions(decay, n + 1) == EffSessions(decay, n) + RealPow(decay, n)
{
    var d := 1.0 - decay;
    var pn := RealPow(decay, n);
    assert d > 0.0;
    assert d != 0.0;
    assert RealPow(decay, n + 1) == decay * pn;
    // (1 - decay*pn) = (1 - pn) + pn*(1 - decay) = (1 - pn) + pn*d
    assert 1.0 - decay * pn == (1.0 - pn) + pn * d;
    // Dividing both sides by d:
    // (1 - decay*pn)/d = (1 - pn)/d + pn
    assert (1.0 - decay * pn) / d == (1.0 - pn) / d + pn;
}
