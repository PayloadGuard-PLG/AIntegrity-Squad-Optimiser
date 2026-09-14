import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCoachPreview } from '../src/logic/coachPreviewParse';
import { resolveCoachStats } from '../src/logic/coachPipeline';

function block(text: string, top: number, left: number) {
  return {
    text,
    frame: { top, left },
    lines: [{ text, frame: { top, left } }],
  };
}

/**
 * Minimal geometry fixture for the live blank-coach failure observed on device:
 * FOCUSED ATTACKING ×13, TRAINING CAMP, + SELECT PLAYER. The target markers are
 * line-level spatial evidence; there is deliberately no player-bound +lo-hi.
 */
const blankFocusedTrainingCamp = {
  text: [
    'TRAINING',
    '+ SELECT PLAYER',
    'FOCUSED ATTACKING ×13',
    'TRAINING CAMP',
    'ATTACK',
    'Passing',
    'Dribbling',
    'Crossing',
    'Shooting',
    'Finishing',
  ].join('\n'),
  blocks: [
    block('TRAINING', 20, 20),
    block('+ SELECT PLAYER', 50, 20),
    block('FOCUSED ATTACKING ×13', 80, 20),
    block('TRAINING CAMP', 110, 20),
    block('ATTACK', 160, 280),
    block('Passing', 200, 280),
    block('↑', 200, 430),
    block('Dribbling', 230, 280),
    block('Crossing', 260, 280),
    block('↑', 260, 430),
    block('Shooting', 290, 280),
    block('Finishing', 320, 280),
  ],
} as any;

test('blank Focused Training Camp restores target detection without manufacturing zero-gain evidence', () => {
  const scan = parseCoachPreview(blankFocusedTrainingCamp);

  assert.equal(scan.sourceFamily, 'training-camp');
  assert.equal(scan.transferClass, 'unresolved');
  assert.equal(scan.coachType, 'Focused');
  assert.equal(scan.coachCategory, 'Attacking');
  assert.equal(scan.multiplier, 13);

  assert.deepEqual(scan.targetStats?.sort(), ['CROSSING', 'PASSING']);
  assert.deepEqual(resolveCoachStats(scan, {}, ['AML', 'ML', 'AMC']).sort(), ['CROSSING', 'PASSING']);
  assert.deepEqual(scan.stats, [], 'target-only markers are not observed +0..0 preview intervals');
});

test('a new coach screenshot replaces prior scanned identity instead of inheriting it', () => {
  const src = readFileSync('app/(tabs)/coaches.tsx', 'utf8');

  assert.equal(
    /setScannedIdentity\(prev\s*=>\s*ingestScannedIdentity/.test(src),
    false,
    'separate screenshots must not merge identity through previous scan state',
  );
  assert.match(
    src,
    /setScannedIdentity\(ingestScannedIdentity\([\s\S]{0,180}?\{\s*\}\s*,?\s*\)\)/,
    'each newly selected screenshot must ingest identity from a fresh empty observation state',
  );
});
