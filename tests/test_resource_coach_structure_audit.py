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


class YoungGreyCandidate(unittest.TestCase):
    """The current research candidate as scored by the corpus-wide audit."""

    @classmethod
    def setUpClass(cls):
        cls.yg = sa.young_grey_params()
        cls.cand = json.loads(sa.YOUNG_GREY_PROFILE.read_text(encoding="utf-8"))

    def test_parameters_come_from_the_committed_profile(self):
        self.assertEqual(self.cand["status"], "research-candidate-not-production")
        self.assertEqual((self.yg["g"], self.yg["knot"], self.yg["ageBand"]), (0.65, 80.0, (18, 21)))

    def test_reduces_to_frozen_outside_the_young_grey_rows(self):
        X = sa.Rows(CAL + X59 + HIST)
        f = sa.predict(dict(sa.BASE), X); y = sa.predict_young_grey(dict(sa.BASE), X, self.yg)
        untouched = X.w | (X.age < 18) | (X.age > 21) | (X.s >= self.yg["knot"])
        self.assertTrue(np.allclose(f[0][untouched], y[0][untouched]) and np.allclose(f[1][untouched], y[1][untouched]))
        self.assertTrue(np.all(y[0] >= f[0] - 1e-12))   # cheaper cost can only raise the gain

    def test_matches_the_frozen_control_prediction_script(self):
        spec = importlib.util.spec_from_file_location("fy", ROOT / "tools" / "resource-coach-v2" / "freeze_young_grey_predictions.py")
        fy = importlib.util.module_from_spec(spec); spec.loader.exec_module(fy)
        card = json.loads((ROOT / "calibration" / "resource-coach-identification" / "control-card-20260924-kawa.json").read_text(encoding="utf-8"))
        for c in fy.COACHES:
            rows = [dict(stat=s, s=float(card["stats"][s]), cls=card["classes"][s], g=[0, 0]) for s in fy.fc.OUTFIELD]
            e = sa._event(event="t", playerName=card["name"], partition="control", family=c["family"], coach=c["label"], N=float(c["N"]),
                          p=c["p"], age=int(card["age"]), tier=card["tier"], evidence="x", rows=rows)
            lo, hi = sa.predict_young_grey(dict(sa.BASE), sa.Rows([e]), self.yg)
            for i, r in enumerate(rows):
                a, b = fy.hyg_interval(dict(sa.BASE), int(card["age"]), card["tier"], c["N"], c["p"], r["s"], r["cls"],
                                       self.yg["g"], self.yg["knot"], self.yg["ageBand"])
                self.assertAlmostEqual(lo[i], a, places=9); self.assertAlmostEqual(hi[i], b, places=9)

    def test_recorded_retrospective_scores_reproduce(self):
        F = dict(sa.BASE)
        self.assertAlmostEqual(sa.metrics_young_grey(F, CAL, self.yg)["midpointMae"], 2.208, delta=5e-4)
        nd = [e for e in CAL if e["playerName"] != "Russell Diamond"]
        self.assertAlmostEqual(sa.metrics_young_grey(F, nd, self.yg)["midpointMae"], 1.987, delta=5e-4)
        self.assertAlmostEqual(sa.metrics_young_grey(F, X59, self.yg)["midpointMae"], sa.metrics(F, X59)["midpointMae"], places=12)


class WhiteThresholdFreeze(unittest.TestCase):
    """PREREG-20260924-WHITE-THRESHOLD-127: predictions are frozen before any preview and must not move."""

    PATH = ROOT / "calibration" / "resource-coach-identification" / "control-predictions-20260924-white-threshold.json"

    def test_frozen_file_is_byte_stable(self):
        self.assertEqual(hashlib.sha256(self.PATH.read_bytes()).hexdigest(), "75d56e5291b9b87e17cce6379f6d77f3edcdb66ddf152f780c2db242ba2165a1")

    def test_models_differ_only_on_white_rows(self):
        d = json.loads(self.PATH.read_text(encoding="utf-8"))
        for p in d["players"]:
            for c in p["coaches"]:
                for s in c["statIntervals"]:
                    if s["displayClass"] != "WHITE":
                        self.assertEqual(s["H0"], s["T127"])


class WhiteThresholdScore(unittest.TestCase):
    """The committed verdict must be reproducible from the frozen predictions and the observations alone."""

    def test_verdict_reproduces(self):
        spec = importlib.util.spec_from_file_location("sc", ROOT / "tools" / "resource-coach-v2" / "score_control_observations.py")
        sc = importlib.util.module_from_spec(spec); spec.loader.exec_module(sc)
        wt = json.loads(sc.WT_PREDICTIONS.read_text(encoding="utf-8"))
        white = []
        for slug in ("midgley", "ljdark-leo", "panic"):
            white += sc.score_player(slug, wt)["whiteRows"]
        h0 = sc._score([r["H0"] for r in white], [r["observed"] for r in white])
        t127 = sc._score([r["T127"] for r in white], [r["observed"] for r in white])
        rec = json.loads((ROOT / "calibration" / "resource-coach-identification" / "control-score-20260924-white-threshold.json").read_text(encoding="utf-8"))
        self.assertEqual(len(white), rec["scoredWhiteRows"])
        self.assertAlmostEqual(h0["midpointMae"], rec["H0"]["midpointMae"], places=9)
        self.assertAlmostEqual(t127["midpointMae"], rec["T127"]["midpointMae"], places=9)
        self.assertEqual(rec["verdict"], "supports T127")


class YoungGreyAnchorFreeze(unittest.TestCase):
    """PREREG-20260924-YOUNG-GREY-ANCHOR: the anchor table is frozen; the gate and target exclusion are mechanical."""

    TABLE = ROOT / "calibration" / "resource-coach-identification" / "anchor-table-20260924-young-grey.json"

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("fa", ROOT / "tools" / "resource-coach-v2" / "freeze_young_grey_anchor.py")
        cls.fa = importlib.util.module_from_spec(spec); spec.loader.exec_module(cls.fa)
        cls.table = json.loads(cls.TABLE.read_text(encoding="utf-8"))

    def test_anchor_table_is_byte_stable(self):
        self.assertEqual(hashlib.sha256(self.TABLE.read_bytes()).hexdigest(), "fa9ac4c8f762fd71295f95a0e6c4553f2afb2e2f502764fc74edcfcf35db4f08")

    def test_target_never_anchors_itself(self):
        for key, c in self.table["coaches"].items():
            for name in {e["player"] for e in c["events"]}:
                a = self.fa.anchor_for(self.table, key, name)
                if a:
                    self.assertTrue(all(name not in ev for ev in a["events"]) or all(
                        e["player"] != name for e in c["events"] if e["event"] in a["events"]))

    def test_gate_leaves_young_players_on_young_grey(self):
        card = json.loads((ROOT / "calibration" / "resource-coach-identification" / "control-card-20260924-kawa.json").read_text(encoding="utf-8"))
        for c in self.fa.predict_card(card, self.table):
            self.assertFalse(c["anchorApplied"])
            for s in c["statIntervals"]:
                if "YGA" in s:
                    self.assertEqual(s["YG"], s["YGA"])

    FROZEN_PREDICTIONS = {'king-alfie': 'fb3c3f3260e401477f94e5eed9acbbb18faee6f52897604da7dee69acda077bc', 'andonov': '0c098b0b6eca0b4863f397148551ff4cc6bb435025c31578f8787059d5473558', 'cieran-morgan': 'e9f9f1c5399b78e43d3249b3632577015441f9202d8c1f710de65b1d6c94c68c', 'blakie': 'b6b5cf1235555c58a57337d37ab971ce96db1b67414bf7f21e30b34b4ff7affd'}

    def test_player_predictions_are_frozen_and_regenerable(self):
        for slug, digest in self.FROZEN_PREDICTIONS.items():
            path = ROOT / "calibration" / "resource-coach-identification" / f"control-predictions-20260924-yga-{slug}.json"
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest, slug)
            card = json.loads((ROOT / "calibration" / "resource-coach-identification" / f"control-card-20260924-{slug}.json").read_text(encoding="utf-8"))
            frozen = json.loads(path.read_text(encoding="utf-8"))["coaches"]
            self.assertEqual(json.loads(json.dumps(self.fa.predict_card(card, self.table))), frozen, slug)

    def test_anchor_offsets_reproduce_from_committed_observations(self):
        yg = self.fa.yg_params()
        rebuilt = {ev["event"]: self.fa.yg_offset(ev, yg) for _, ev in self.fa.control_events()}
        for c in self.table["coaches"].values():
            for e in c["events"]:
                if e["event"] in rebuilt:
                    self.assertAlmostEqual(rebuilt[e["event"]], e["logOffset"], places=5)


class YoungGreyAnchorScore(unittest.TestCase):
    """The committed YGA verdict reproduces from the frozen predictions and the observations alone."""

    REC = ROOT / "calibration" / "resource-coach-identification" / "control-score-20260924-young-grey-anchor.json"

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("sya", ROOT / "tools" / "resource-coach-v2" / "score_young_grey_anchor.py")
        cls.s = importlib.util.module_from_spec(spec); spec.loader.exec_module(cls.s)
        cls.rec = json.loads(cls.REC.read_text(encoding="utf-8"))

    def test_verdict_reproduces(self):
        yg = self.s.fya.yg_params()
        scored = [self.s.score_player(slug, yg) for slug in self.s.PLAYERS]
        d = self.s.verdict([p for p in scored if p["arm"] == "primary"])
        self.assertEqual((d["rows"], d["players"], d["cells"], d["ygaWins"]), (60, 3, 15, 9))
        self.assertAlmostEqual(d["mae"]["YG"], self.rec["decision"]["mae"]["YG"], places=9)
        self.assertAlmostEqual(d["mae"]["YGA"], self.rec["decision"]["mae"]["YGA"], places=9)
        self.assertEqual(d["verdict"], self.rec["decision"]["verdict"])
        self.assertEqual(d["verdict"], "inconclusive")

    def test_every_scored_preview_obeys_the_game_arithmetic(self):
        cats = dict(DEFENSE=["TACKLING", "MARKING", "POSITIONING", "HEADING", "BRAVERY"],
                    ATTACK=["PASSING", "DRIBBLING", "CROSSING", "SHOOTING", "FINISHING"],
                    PHYSICAL_AND_MENTAL=["FITNESS", "STRENGTH", "AGGRESSION", "SPEED", "CREATIVITY"])
        for slug in self.s.PLAYERS:
            obs = json.loads((ROOT / "calibration" / "resource-coach-identification" / f"control-observation-20260924-{slug}.json").read_text(encoding="utf-8"))
            for key, iv in obs["statIntervals"].items():
                lo, hi = obs["ovrBoost"][key]
                self.assertLessEqual(math.floor(sum(v[0] for v in iv.values()) / 15), lo)
                self.assertGreaterEqual(math.ceil(sum(v[1] for v in iv.values()) / 15), hi)
                for cat, g in obs["categoryAverageGain"][key].items():
                    for i in (0, 1):
                        self.assertEqual(round(sum(v[i] for s, v in iv.items() if s in cats[cat]) / 5), g[i], (slug, key, cat))

    def test_prediction_files_were_frozen_before_the_observations(self):
        for slug in self.s.PLAYERS:
            obs = json.loads((ROOT / "calibration" / "resource-coach-identification" / f"control-observation-20260924-{slug}.json").read_text(encoding="utf-8"))
            self.assertEqual(obs["predictionsFrozenAtCommit"], "5e42483")
            self.assertIn(slug, YoungGreyAnchorFreeze.FROZEN_PREDICTIONS)


class SingleDoseFreeze(unittest.TestCase):
    """PREREG-20260924-SINGLE-DOSE-22PLUS: the dose is the pinned table's 22+ mean, is the object behind the post-hoc
    finding, and can only be applied to eligible players."""

    PREREG = ROOT / "calibration" / "resource-coach-identification" / "preregistration-20260924-single-dose-22plus.json"

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("fsd", ROOT / "tools" / "resource-coach-v2" / "freeze_single_dose.py")
        cls.m = importlib.util.module_from_spec(spec); spec.loader.exec_module(cls.m)
        cls.table = json.loads(cls.m.fya.ANCHOR_TABLE.read_text(encoding="utf-8"))

    def test_preregistration_is_byte_stable(self):
        self.assertEqual(hashlib.sha256(self.PREREG.read_bytes()).hexdigest(), "096ba081b5881acf2836a421fb75ac73568e48e5f0275c1a865bf0398a8f95d5")

    def test_dose_literal_equals_the_pinned_table(self):
        mean, n = self.m.dose_from_table(self.table)
        self.assertAlmostEqual(mean, self.m.DOSE_LOG, places=12)
        self.assertEqual(n, self.m.DOSE_EVENTS)
        contributors = {e["player"] for c in self.table["coaches"].values() for e in c["events"] if e["age"] >= self.m.DOSE_MIN_AGE}
        self.assertEqual(contributors, set(self.m.DOSE_PLAYERS))
        pre = json.loads(self.PREREG.read_text(encoding="utf-8"))["dose"]
        self.assertEqual(pre["doseLog"], self.m.DOSE_LOG)
        self.assertEqual(set(pre["contributingPlayers"]), contributors)

    def test_frozen_dose_is_the_one_behind_the_post_hoc_finding(self):
        rec = json.loads((ROOT / "calibration" / "resource-coach-identification" / "control-score-20260924-young-grey-anchor.json").read_text(encoding="utf-8"))
        ph = rec["postHocGlobalDose"]["age22plus"]
        self.assertEqual(ph["dose"], round(math.exp(self.m.DOSE_LOG), 4))
        self.assertEqual(ph["anchorEvents"], self.m.DOSE_EVENTS)

    def test_ineligible_players_are_refused(self):
        card = json.loads((ROOT / "calibration" / "resource-coach-identification" / "control-card-20260924-blakie.json").read_text(encoding="utf-8"))
        with self.assertRaises(SystemExit):  # 21 today
            self.m.predict_card(card, self.table, self.m.fya.COACHES)
        for slug in ("king-alfie", "rodger"):
            card = json.loads((ROOT / "calibration" / "resource-coach-identification" / f"control-card-20260924-{slug}.json").read_text(encoding="utf-8"))
            with self.assertRaises(SystemExit):
                self.m.predict_card(card, self.table, self.m.fya.COACHES)

    def test_sd22_is_yg_shifted_by_the_dose_only(self):
        card = json.loads((ROOT / "calibration" / "resource-coach-identification" / "control-card-20260924-blakie.json").read_text(encoding="utf-8"))
        card = dict(card, name="Eligibility Probe", age=22)
        for c in self.m.predict_card(card, self.table, self.m.fya.COACHES):
            for s in c["statIntervals"]:
                if s["YG"]["rawHi"] > 0.5:
                    self.assertLess(s["SD22"]["rawHi"], s["YG"]["rawHi"])
        saved = self.m.DOSE_LOG
        try:
            self.m.DOSE_LOG = 0.0
            for c in self.m.predict_card(card, self.table, self.m.fya.COACHES):
                for s in c["statIntervals"]:
                    self.assertEqual(s["SD22"], s["YG"])
        finally:
            self.m.DOSE_LOG = saved

if __name__ == "__main__":
    unittest.main()
