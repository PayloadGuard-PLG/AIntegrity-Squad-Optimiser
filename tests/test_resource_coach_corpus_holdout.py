import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "resource-coach-v2" / "corpus_holdout_validation.py"
SPEC = importlib.util.spec_from_file_location("resource_coach_current_replay", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class CurrentResourceCoachReplayTests(unittest.TestCase):
    def test_andonov_mixed_x25_anchor_recovers_current_player_amplitude(self):
        rows = [
            dict(age=23,tier='T0',s=71,stat='TACKLING',cls='MID_GREY',N=25,p=4,g=[47,63]),
            dict(age=23,tier='T0',s=84,stat='MARKING',cls='MID_GREY',N=25,p=4,g=[42,57]),
            dict(age=23,tier='T0',s=108,stat='PASSING',cls='WHITE',N=25,p=4,g=[38,50]),
            dict(age=23,tier='T0',s=100,stat='DRIBBLING',cls='WHITE',N=25,p=4,g=[43,54]),
        ]
        event = {
            'event':'ANDONOV-MIXED-X25',
            'player':'andonov','playerName':'Plamen Andonov','state':'same-state',
            'partition':'regression','family':'SKILL SEMINAR','coach':'Standard Mixed',
            'N':25,'p':4,'age':23,'tier':'T0','evidenceGrade':'conversation-screenshot-observed',
            'rows':rows,
        }
        cal = MOD.calibrate_event(event)
        # The 23-Sep calibration derived a common lower-dose budget about 44.15
        # and C_P about 1.177. Keep tolerance wider than display-quantisation noise.
        self.assertGreater(cal['commonBudgetLo'], 43.5)
        self.assertLess(cal['commonBudgetLo'], 44.8)
        self.assertGreater(cal['cPlayer'], 1.16)
        self.assertLess(cal['cPlayer'], 1.20)

    def test_chat_loader_uses_actual_observations_not_frozen_predictions(self):
        rows = MOD.load_chat_observed_rows()
        self.assertGreater(len(rows), 0)
        self.assertTrue(all('prediction' not in r and 'point' not in r for r in rows))
        self.assertTrue(all(len(r['g']) == 2 for r in rows))

    def test_primary_cross_validation_is_leave_one_coach_out_same_state(self):
        events = MOD.build_events(MOD.load_archive_rows() + MOD.load_chat_observed_rows())
        cv = MOD.cross_validate(events, primary_only=True)
        self.assertGreater(cv['metrics']['n'], 0)
        self.assertGreaterEqual(cv['eligiblePlayerStates'], 1)
        for r in cv['predictions']:
            self.assertNotEqual(r['anchor_event'], r['target_event'])
            self.assertEqual(r['evidence_grade'] in {
                'referenced-screenshot-unverified','conversation-screenshot-observed'
            }, True)

    def test_reward_chat_observation_is_excluded_from_ordinary_replay(self):
        rows = MOD.load_chat_observed_rows()
        self.assertFalse(any('REWARD' in r['family'] or 'REWARD' in r['coach'].upper() for r in rows))

    def test_canonical_replay_respects_quality_exclusions_and_remains_secondary(self):
        rows = MOD.load_canonical_rows()
        excluded = {
            x['experimentId']
            for x in __import__('json').loads(MOD.EXCLUSIONS_PATH.read_text())['experiments']
        }
        self.assertGreater(len(rows), 0)
        self.assertTrue(all(r['event'] not in excluded for r in rows))
        self.assertTrue(all(r['evidenceGrade'] == 'canonical-workbook' for r in rows))

    def test_midpoint_metrics_are_evaluation_only(self):
        # Calibration uses endpoint SSE. Midpoint exists only in score_row output.
        src = SCRIPT.read_text(encoding='utf-8')
        calibrate = src[src.index('def calibrate_event'):src.index('def evidence_grade')]
        self.assertNotIn('midpoint', calibrate.lower())
        self.assertIn('midpoint_abs_error', src)

    def test_age_factor_cancels_under_exact_state_amplitude_calibration(self):
        events = MOD.build_events(MOD.load_archive_rows() + MOD.load_chat_observed_rows())
        eligible = MOD.cross_validate(events, primary_only=True)
        example = next(r for r in eligible['predictions'] if r['player_name'] == 'Willie Ferguson')
        a = next(e for e in events if e['event'] == example['anchor_event'])
        b = next(e for e in events if e['event'] == example['target_event'])
        budget = MOD.calibrate_event(a)['commonBudgetLo']
        amp_no_age = budget / (a['N'] / a['p'])
        amp_with_age = budget / (MOD.age_scale(a['age']) * a['N'] / a['p'])
        self.assertAlmostEqual(
            amp_no_age * b['N'] / b['p'],
            amp_with_age * MOD.age_scale(b['age']) * b['N'] / b['p'], places=10)

    def test_close_coach_concentration_and_global_baseline_share_targets(self):
        events = MOD.build_events(MOD.load_archive_rows() + MOD.load_chat_observed_rows())
        cv = MOD.cross_validate(events, primary_only=True)
        sensitivity = MOD.primary_sensitivities(cv)
        self.assertEqual(sensitivity['closeSameCoach106to114']['n'], 64)
        self.assertEqual(sensitivity['excludingCloseSameCoach106to114']['n'], 63)
        self.assertEqual(sensitivity['fixedGlobalAmplitudeOnSameTargets']['n'], 127)
        self.assertLess(
            sensitivity['fixedGlobalAmplitudeOnSameTargets']['midpointMae'],
            cv['metrics']['midpointMae'])


if __name__ == '__main__':
    unittest.main()
