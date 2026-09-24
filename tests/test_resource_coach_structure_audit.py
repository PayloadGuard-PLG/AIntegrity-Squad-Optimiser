"""Invariants for the ordinary Resource Coach structure audit (requires numpy and scipy)."""
import hashlib
import importlib.util
import json
import math
import pathlib
import unittest

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("structure_audit", ROOT / "tools" / "resource-coach-v2" / "structure_audit.py")
sa = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sa)

X59_PATH = ROOT / "calibration" / "resource-coach-identification" / "prospective-input-20260924-standard-safeguard-x59-skill.json"
FROZEN_X59_SHA256 = "86ebe2e564778e7ef3ba1d15c447e92bfdd61c49947e3dbce7ab262b1480ac44"
FROZEN_X59_SCORE_SHA256 = "606d7a9c2ef59748ef93011a3afa92ad9c401483565f6c8b301c61858d295c36"

EVENTS = sa.load_events()
CAL = [e for e in EVENTS if not e["hist"] and e["partition"] != "prospective-x59"]
X59 = [e for e in EVENTS if e["partition"] == "prospective-x59"]
HIST = [e for e in EVENTS if e["hist"]]


class FrozenBaselineIsUntouched(unittest.TestCase):
    def test_frozen_profile_constants(self):
        p = json.loads(sa.FROZEN_PROFILE.read_text(encoding="utf-8"))
        self.assertEqual(p["dose"]["globalAmplitude"], 1.324)
        self.assertEqual(p["response"], {"whiteThreshold": 132.6, "midGreyThreshold": 120.1, "K": 26.05,
                                         "upperDoseRatio": 1.529, "visibleGainRectification": True})
        self.assertEqual([b["scale"] for b in p["ageScaleBands"]], [8, 6, 4, 2, 1])
        self.assertEqual(p["tierAdditions"], [0, 10, 30, 50, 80, 120, 160])

    def test_frozen_x59_predictions_and_score_are_byte_stable(self):
        d = json.loads(X59_PATH.read_text(encoding="utf-8"))
        blk = [t["frozenPrediction"] for t in d["tests"]]
        self.assertEqual(hashlib.sha256(json.dumps(blk, sort_keys=True).encode()).hexdigest(), FROZEN_X59_SHA256)
        self.assertEqual(hashlib.sha256(json.dumps(d["scoreSummary"], sort_keys=True).encode()).hexdigest(), FROZEN_X59_SCORE_SHA256)
        self.assertEqual(d["scoreSummary"]["frozenAtCommit"], "46a77209b33174195aa0a6e680378e3ee3c5aabb")

    def test_audit_model_reproduces_frozen_x59_raw_predictions(self):
        X = sa.Rows(X59)
        lo, hi = sa.predict(dict(sa.BASE), X)
        rec = np.array([r["frozen"] for e in X59 for r in e["rows"]])
        self.assertLess(float(np.max(np.abs(np.c_[lo, hi] - rec))), 1e-5)

    def test_audit_model_equals_stdlib_direct_replay(self):
        for e in CAL + HIST:
            lo, hi = sa.predict(dict(sa.BASE), sa.Rows([e]))
            for i, r in enumerate(e["rows"]):
                ref = sa.dv.predict_interval(dict(p=e["p"], age=e["age"], N=e["N"], s=r["s"], tier=e["tier"], cls=r["cls"]))
                self.assertAlmostEqual(lo[i], ref[0], places=9)
                self.assertAlmostEqual(hi[i], ref[1], places=9)


class CandidateContract(unittest.TestCase):
    def setUp(self):
        self.cand = json.loads(sa.CANDIDATE_PROFILE.read_text(encoding="utf-8"))

    def test_only_the_multiplier_law_changes(self):
        frozen = json.loads(sa.FROZEN_PROFILE.read_text(encoding="utf-8"))
        self.assertEqual(self.cand["dose"]["multiplierOffset"], 1)
        self.assertEqual(self.cand["response"], frozen["response"])
        self.assertEqual(self.cand["ageScaleBands"], frozen["ageScaleBands"])
        self.assertEqual(self.cand["tierAdditions"], frozen["tierAdditions"])
        self.assertEqual(self.cand["status"], "research-candidate-not-production")

    def test_amplitude_reproduces_from_the_declared_calibration_partition(self):
        P = sa.fit(["logC"], sa.Rows(CAL), dict(sa.BASE, N0=1.0))
        self.assertAlmostEqual(math.exp(P["logC"]), self.cand["dose"]["globalAmplitude"], delta=5e-4)

    def test_candidate_reduces_to_frozen_without_offset(self):
        X = sa.Rows(CAL + X59 + HIST)
        a = sa.predict(dict(sa.BASE), X); b = sa.predict(dict(sa.BASE, N0=0.0), X)
        self.assertTrue(np.allclose(a[0], b[0]) and np.allclose(a[1], b[1]))

    def test_prediction_never_reads_the_answer_key(self):
        P = dict(sa.BASE, N0=1.0, logC=math.log(self.cand["dose"]["globalAmplitude"]))
        X = sa.Rows(CAL)
        lo, hi = sa.predict(P, X)
        X.lo = X.lo * 0 + 999.0; X.hi = X.hi * 0 - 999.0
        lo2, hi2 = sa.predict(P, X)
        self.assertTrue(np.array_equal(lo, lo2) and np.array_equal(hi, hi2))


class StructuralFindings(unittest.TestCase):
    def test_scott_ritchie_hist_previews_are_inadmissible_at_the_recorded_tier(self):
        for e in [e for e in HIST if e["playerName"] == "Scott Ritchie"]:
            def rmse(d):
                fn = lambda s, w, t, A, B: sa.movement(s - np.where(w, d, 0), np.where(w, 132.6, 120.1), 26.05, B)
                return math.sqrt(sa.event_geometry_sse(fn, e)[0] / (2 * len(e["rows"])))
            self.assertGreater(rmse(30), 10.0)   # recorded T2 coordinate
            self.assertLess(rmse(0), 5.0)        # untiered coordinate

    def test_flat_zone_multiplier_contrast_excludes_proportional_dose(self):
        mc = sa.matched_controls(EVENTS, dict(sa.BASE))["neriPassingX26overX7"]
        lo, hi = mc["admissibleBudgetRatio"]
        self.assertFalse(lo <= 26 / 7 <= hi)
        self.assertTrue(lo <= 25 / 6 <= hi)

    def test_same_coach_age_19_and_21_receive_equal_dose(self):
        mc = sa.matched_controls(EVENTS, dict(sa.BASE))["ageControlFerguson21overHowden19"]
        lo, hi = mc["admissibleDoseRatioFrozenShape"]
        self.assertTrue(lo <= 1.0 <= hi)
        self.assertFalse(lo <= math.exp(-0.06) <= hi)

    def test_affine_multiplier_predicts_the_unseen_low_multiplier_regime(self):
        tr = sa.Rows([e for e in CAL if e["N"] >= 13]); te = [e for e in CAL if e["N"] <= 10]
        mae = {}
        for N0 in (0.0, 1.0):
            P = sa.fit(["logC"], tr, dict(sa.BASE, N0=N0))
            mae[N0] = sa.metrics(P, te)["midpointMae"]
        self.assertLess(mae[1.0], mae[0.0] - 0.5)

    def test_coach_anchor_never_uses_the_target_players_own_preview(self):
        pool = [e for e in X59]  # one coach definition, four different players
        target = pool[0]
        P = dict(sa.BASE)
        base = sa.anchor_offset(P, target, pool)
        triple = lambda e: dict(e, rows=[dict(r, g=[3 * r["g"][0], 3 * r["g"][1]]) for r in e["rows"]])
        # corrupting the target's own answer key cannot move its anchor
        self.assertEqual(sa.anchor_offset(P, target, [triple(target)] + pool[1:]), base)
        # corrupting another player's preview does move it
        self.assertNotAlmostEqual(sa.anchor_offset(P, target, [target, triple(pool[1])] + pool[2:]), base, places=3)
        # a pool containing only the target yields no anchor at all
        self.assertIsNone(sa.anchor_offset(P, target, [target]))


if __name__ == "__main__":
    unittest.main()


class CorpusRoster(unittest.TestCase):
    """Corpus membership is decided mechanically, never by assertion."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("corpus_roster", ROOT / "tools" / "resource-coach-v2" / "corpus_roster.py")
        cls.cr = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.cr)
        cls.found, cls.legacy = cls.cr.sources()

    def status(self, name):
        return self.cr.lookup(name, self.found, self.legacy)["status"]

    def test_roster_file_agrees_with_the_script(self):
        roster = json.loads((ROOT / "calibration" / "resource-coach-identification" / "corpus-roster-20260924.json").read_text(encoding="utf-8"))
        for p in roster["players"]:
            self.assertEqual(self.status(p["name"]), p["status"], p["name"])

    def test_known_cases(self):
        self.assertEqual(self.status("LJDark leo"), "NO-ORDINARY-EVIDENCE")   # legacy records are comparison only
        self.assertEqual(self.status("Jables JaseysBoi"), "NO-ORDINARY-EVIDENCE")
        self.assertEqual(self.status("Mirsad Panic"), "ORDINARY-EVIDENCE")
        self.assertEqual(self.status("Willie Ferguson"), "ORDINARY-EVIDENCE")
        self.assertEqual(self.status("Michal Kawa"), "NO-ORDINARY-EVIDENCE")  # a frozen control card is not prior evidence
        self.assertEqual(self.status("LJ Galileo"), "ORDINARY-EVIDENCE")      # substring 'leo' must not leak across players

    def test_user_handle_claim_is_withdrawn(self):
        d = json.loads((ROOT / "profiles" / "calibration_data.json").read_text(encoding="utf-8"))
        self.assertIn("WITHDRAWN", d["gillespie"]["correction_20260924"])
