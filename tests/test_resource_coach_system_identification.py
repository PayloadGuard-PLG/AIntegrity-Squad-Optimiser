"""Small invariants for the research replay; these are not production predictors."""
import importlib.util
import pathlib
import unittest

import numpy as np

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'tools/resource-coach-v2/system_identification.py'
SPEC = importlib.util.spec_from_file_location('resource_coach_system_identification', SCRIPT)
REPLAY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPLAY)


class SystemIdentificationTests(unittest.TestCase):
    def test_cost_inverse_and_below_zero_renderer(self):
        for beta in (0, .015, .0354):
            u=np.array([-25.,0,100,150,200]);b=np.array([.1,1,40,100,900])
            for h in (0,120,135):
                g=REPLAY.inverse(u,b,np.full(len(u),h),beta)
                np.testing.assert_allclose(REPLAY.integrate(u,g,h,beta),b,atol=1e-8)
        # A T6 white displayed stat of 135 is at u=-25, so movement 20 is invisible.
        self.assertEqual(max(0,-25+20)-max(0,-25),0)

    def test_conflicted_multiplier_pair_is_only_sensitivity_evidence(self):
        rows,_=REPLAY.canonical()
        self.assertIn('PRV-0017',REPLAY.DISPUTED)
        self.assertFalse(REPLAY.pair_constraint(rows,1,.0354)['compatible'])
        self.assertTrue(REPLAY.pair_constraint(rows,.5,0)['compatible'])
        self.assertEqual(sum(r['id'] not in REPLAY.DISPUTED for r in rows),50)

    def test_archived_same_state_pairs_preserve_ranges(self):
        pairs=REPLAY.matched_archived_pairs(REPLAY.archived())
        self.assertEqual(len(pairs),24)
        self.assertTrue(all(x['dose_ratio'][0] <= x['dose_ratio'][1] for x in pairs))
        self.assertEqual(len({x['a'] for x in pairs}),3)

    def test_locked_next_experiment_predictions_are_outward_rounded(self):
        rows=REPLAY.next_experiment_predictions()
        self.assertEqual(rows[0]['x80']['drill_like'],[130,155])
        self.assertEqual(rows[0]['x80']['skill_high_exponent'],[160,178])
        self.assertTrue(all(x['x80']['drill_like'][1] < x['x80']['skill_high_exponent'][0] for x in rows))


if __name__=='__main__':unittest.main()
