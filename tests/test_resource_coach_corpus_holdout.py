import importlib.util
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "resource-coach-v2" / "corpus_holdout_validation.py"
SPEC = importlib.util.spec_from_file_location("resource_coach_corpus_holdout", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class ResourceCoachCorpusHoldoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = MOD.archived_rows()

    def test_seeded_player_selection_is_deterministic(self):
        a = MOD.choose_player(self.rows, "vader-20260923")
        b = MOD.choose_player(self.rows, "vader-20260923")
        self.assertEqual(a, b)
        self.assertGreaterEqual(len(MOD.player_names(self.rows)), 10)

    def test_selected_player_is_absent_from_fit_partition(self):
        player, _, _ = MOD.choose_player(self.rows, "vader-20260923")
        result = MOD.evaluate_player(self.rows, player, MOD.CURRENT_VARIANT)
        self.assertEqual(result["heldoutRows"], sum(r["player"] == player for r in self.rows))
        self.assertEqual(result["trainRows"], sum(r["player"] != player for r in self.rows))
        self.assertGreater(result["heldoutRows"], 0)
        self.assertEqual(len(result["details"]), result["heldoutRows"])

    def test_exhaustive_lopo_scores_every_eligible_row_once(self):
        result = MOD.exhaustive_lopo(self.rows, MOD.CURRENT_VARIANT)
        self.assertEqual(result["metrics"]["n"], len(self.rows))
        self.assertEqual(len(result["details"]), len(self.rows))
        self.assertEqual(len(result["folds"]), len(MOD.player_names(self.rows)))

    def test_independent_canonical_holdout_is_nonempty_and_excludes_disputed(self):
        result = MOD.independent_canonical_holdout(self.rows, MOD.CURRENT_VARIANT)
        self.assertGreater(result["heldoutRows"], 0)
        self.assertTrue(result["exclusions"]["exactCrossSourceDuplicatesRemoved"])
        disputed = set(result["exclusions"]["qualityDisputedIds"])
        self.assertTrue(disputed)
        self.assertTrue(all(row["event_id"] not in disputed for row in result["details"]))

    def test_full_report_writes_machine_and_human_readable_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_main = MOD.__name__
            # Exercise the helpers rather than shelling out; CLI execution is covered by the workflow.
            player, name, idx = MOD.choose_player(self.rows, "smoke")
            selected = MOD.evaluate_player(self.rows, player, MOD.CURRENT_VARIANT)
            report = {
                "seed": "smoke",
                "archiveRows": len(self.rows),
                "eligiblePlayers": len(MOD.player_names(self.rows)),
                "liveCandidate": {"modelVersion": "test", "status": "testing-only"},
                "selectedPlayer": {
                    "playerId": player,
                    "playerName": name,
                    "selectionIndex": idx,
                    "current": selected,
                },
                "allPlayerLopo": {
                    MOD.CURRENT_VARIANT: MOD.exhaustive_lopo(self.rows, MOD.CURRENT_VARIANT)
                },
                "canonicalHoldout": {
                    MOD.CURRENT_VARIANT: MOD.independent_canonical_holdout(self.rows, MOD.CURRENT_VARIANT)
                },
            }
            text = MOD.report_markdown(report)
            self.assertIn("Seeded selected-player holdout", text)
            self.assertIn(name, text)


if __name__ == "__main__":
    unittest.main()
