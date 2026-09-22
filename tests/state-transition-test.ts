import test from 'node:test';
import assert from 'node:assert/strict';
import gameProfileJson from '../profiles/game_2025.json';
import type { GameProfile } from '../src/types/resources';
import type { PlayerPlanningState } from '../src/types/planning';
import {
  previewDeployment,
  previewPlaystyleAssignment,
  previewRoleUnlock,
  previewTierUpgrade,
} from '../src/logic/stateTransitions';
import { getWhiteStatKeys } from '../src/utils/roleWeights';

const profile = gameProfileJson as unknown as GameProfile;

const outfield = (v = 100): Record<string, number> => ({
  TACKLING: v, MARKING: v, POSITIONING: v, HEADING: v, BRAVERY: v,
  PASSING: v, DRIBBLING: v, CROSSING: v, SHOOTING: v, FINISHING: v,
  FITNESS: v, STRENGTH: v, AGGRESSION: v, SPEED: v, CREATIVITY: v,
});

const state = (roles: string[], tier: PlayerPlanningState['tier'], v = 100): PlayerPlanningState => ({
  roles,
  stats: outfield(v),
  overall: v,
  tier,
  playstyle: null,
  deployedRole: roles[0] ?? null,
});

test('Stellar DC+DMC completing MC retroactively applies +50 to exactly three new whites', () => {
  const before = state(['DC', 'DMC'], 'T3');
  const step = previewRoleUnlock(before, 'MC', profile);

  assert.deepEqual(step.newlyWhite, ['DRIBBLING', 'SHOOTING', 'SPEED']);
  for (const stat of step.newlyWhite) assert.equal(step.after.stats[stat], 150);
  assert.equal(step.after.overall - before.overall, 10);
  assert.equal(step.gameReversible, false);
});

test('pure MC -> DMC at Stellar then Master gives +50 to two new whites and +30 to 12 whites', () => {
  const before = state(['MC'], 'T3');
  const role = previewRoleUnlock(before, 'DMC', profile);

  assert.deepEqual(role.newlyWhite, ['AGGRESSION', 'HEADING']);
  assert.equal(role.after.stats.AGGRESSION, 150);
  assert.equal(role.after.stats.HEADING, 150);
  assert.ok(Math.abs((role.after.overall - before.overall) - (100 / 15)) < 1e-9);

  const tier = previewTierUpgrade(role.after, 'T4', profile);
  assert.equal(getWhiteStatKeys(tier.after.roles).length, 12);

  const totalTierDelta = tier.deltas.reduce((sum, d) => sum + (d.after - d.before), 0);
  assert.equal(totalTierDelta, 12 * 30);
  assert.ok(Math.abs((tier.after.overall - role.after.overall) - 24) < 1e-9);
});

test('DMC+MC -> AMC at Stellar newly-whites FINISHING and the observed STRENGTH interaction', () => {
  const before = state(['DMC', 'MC'], 'T3');
  const step = previewRoleUnlock(before, 'AMC', profile);

  assert.deepEqual(step.newlyWhite, ['FINISHING', 'STRENGTH']);
  assert.equal(step.after.stats.FINISHING, 150);
  assert.equal(step.after.stats.STRENGTH, 150);
  assert.ok(Math.abs((step.after.overall - before.overall) - (100 / 15)) < 1e-9);
});

test('Regista remains active when a player with MC+DMC is deployed at DMC', () => {
  let s = state(['MC', 'DMC'], 'T3');
  const style = previewPlaystyleAssignment(s, 'regista', 'Master');
  s = style.after;
  const deployment = previewDeployment(s, 'DMC');

  assert.match(deployment.notes.join(' '), /ACTIVE/);
  assert.equal(deployment.after.deployedRole, 'DMC');
  assert.equal(style.gameReversible, false);
  assert.equal(deployment.gameReversible, true);
});

test('deployment rejects a role the player does not own', () => {
  const s = state(['MC'], 'T0');
  assert.throws(() => previewDeployment(s, 'ST'), /not an established role/);
});
