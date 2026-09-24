import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "resource-coach-v2" / "direct_player_card_validation.py"
SPEC = importlib.util.spec_from_file_location("resource_coach_direct_replay", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class DirectPlayerCardValidationTests(unittest.TestCase):
    def test_prediction_does_not_read_observed_answer_key(self):
        row = {
            "age": 19,
            "tier": "T0",
            "s": 73,
            "cls": "WHITE",
            "N": 33,
            "p": 4,
            "g": [1, 999],
        }
        a = MOD.predict_interval(row)
        row["g"] = [500, 900]
        b = MOD.predict_interval(row)
        self.assertEqual(a, b)

    def test_single_event_player_is_eligible(self):
        row = {
            "partition": "unit",
            "event": "ONE",
            "player": "p1",
            "playerName": "Single Player",
            "state": "state-1",
            "age": 19,
            "tier": "T0",
            "stat": "PASSING",
            "s": 73.0,
            "cls": "WHITE",
            "coach": "Standard Attacking",
            "family": "SKILL SEMINAR",
            "N": 33.0,
            "p": 4,
            "g": [78.0, 92.0],
            "source": "unit",
            "transferClass": "ordinary",
            "evidenceGrade": "structured-secondary",
        }
        events = MOD.build_events([row])
        result = MOD.direct_validate(events)
        self.assertEqual(result["metrics"]["events"], 1)
        self.assertEqual(result["metrics"]["players"], 1)
        self.assertEqual(result["metrics"]["n"], 1)

    def test_archive_no_longer_requires_state_key(self):
        rows, rejected = MOD.load_archive_rows()
        players = {r["playerName"] for r in rows}
        self.assertIn("SD Faye", players)
        self.assertGreaterEqual(len(players), 15)
        self.assertFalse(any(r.get("reason") == "missing-state" for r in rejected))

    def test_reward_is_excluded(self):
        rows, _ = MOD.load_chat_rows()
        self.assertFalse(any("REWARD" in r["family"] or "REWARD" in r["coach"].upper() for r in rows))

    def test_live_gilmartin_scores_from_one_card_and_one_preview(self):
        rows, rejected = MOD.load_live_gilmartin_rows()
        self.assertEqual(rejected, [])
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(r["tier"] == "T3" for r in rows))
        result = MOD.direct_validate(MOD.build_events(rows))
        self.assertEqual(result["metrics"]["events"], 1)
        self.assertEqual(result["metrics"]["players"], 1)

    def test_canonical_singletons_are_not_filtered_for_pairing(self):
        rows, _ = MOD.load_canonical_rows()
        events = MOD.build_events(rows)
        result = MOD.direct_validate(events)
        self.assertEqual(result["metrics"]["events"], len(events))
        self.assertGreater(result["metrics"]["n"], 0)

    def test_prospective_missing_tier_is_inventory_not_silent_drop(self):
        rows = MOD.load_prospective_inventory()
        self.assertGreater(len(rows), 0)
        self.assertTrue(all("missing-player-card-tier" in r["reason"] for r in rows))


if __name__ == "__main__":
    unittest.main()
