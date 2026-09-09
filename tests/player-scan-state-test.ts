import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { decodeScreenshotPng } from '../src/logic/screenshotPixels';
import { scanPlayerInput } from '../src/logic/playerScanPipeline';
import { mergePlayerScanState, needsRoleReview, needsTierReview, playerRoleError, PlayerCardState } from '../src/logic/playerScanState';
import { parsePlayerCard, OcrResult, PlayerCardScanExtended } from '../src/logic/playerCardParse';
import { RgbaImage, roleChips, CALIBRATION } from '../src/logic/glyphReader';
import { blankImage, hsvToRgb } from './helpers/png';
import { buildSyntheticCard } from './helpers/syntheticCard';
import { getWhiteStatKeys, isWhiteStat } from '../src/utils/roleWeights';
import { playerService } from '../src/services/playerService.web';
import { Player } from '../src/database/playerSchema';
import { ingestCardTrainingRate } from '../src/logic/trainingRate';

const ocr: OcrResult = JSON.parse(readFileSync(join(__dirname, 'fixtures/mlkit-moore.json'), 'utf8'));
const pixels = buildSyntheticCard('moore', ocr);
const before: PlayerCardState = {
  role: ['DC', 'DMC', 'MC'], tier: 'T3', newRole: 'MC', newRolePoints: 2,
  playstyle: 'defensive', specialAbilities: ['saved-ability'],
  boosts: { TACKLING: { amount: 10, active: true, source: 'personalTrainer' } },
};

test('edit rescan retains a card training-rate observation when OCR reads zero stats', () => {
  const partialScan = { stats: {}, overall: 115.3, talent: 'FT2' };
  const next = ingestCardTrainingRate(
    { talent: 'Unknown', talentSource: 'unresolved' },
    partialScan.talent,
  );
  assert.deepEqual(next, { talent: 'Fast', talentSource: 'card' });

  const prior = { talent: 'Slow' as const, talentSource: 'manual' as const };
  assert.deepEqual(ingestCardTrainingRate(prior, undefined), prior,
    'an OVR-only scan must not replace the existing training-rate observation');

  // React Native is not loaded in this Node suite. Pin the component wiring as
  // well as the pure behavior: ingestion must precede the stats-success gate.
  const editScreen = readFileSync(join(__dirname, '..', 'app/player/[id].tsx'), 'utf8');
  const ingestion = editScreen.indexOf('const scannedTrainingRate = ingestCardTrainingRate');
  const statsGate = editScreen.indexOf('if (data.stats && Object.keys(data.stats).length > 0)', ingestion);
  assert.ok(ingestion >= 0 && statsGate > ingestion,
    'training-rate ingestion must run before a zero-stat scan can take the rejection path');
  assert.match(editScreen, /else if \(data\.talent \|\| data\.overall\)/,
    'a readable card detail with zero stats is a partial success, not an unrecognised image');
});

// Independent PNG writer: Node zlib + PNG chunks, not the production codec's
// encoder. Generated from synthetic pixels; no screenshot is written to disk.
function pngBase64(image: RgbaImage, channels: 3 | 4 = 4): string {
  function chunk(type: string, data: Buffer): Buffer {
    const payload = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, payload, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width); header.writeUInt32BE(image.height, 4);
  header[8] = 8; header[9] = channels === 4 ? 6 : 2;
  const rows = Buffer.alloc(image.height * (1 + image.width * channels));
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      for (let c = 0; c < channels; c++) {
        rows[y * (1 + image.width * channels) + 1 + x * channels + c] = image.data[(y * image.width + x) * 4 + c];
      }
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

const fresh = (): PlayerCardState => ({ role: [], tier: 'T0' });
const scan = (overrides: Partial<PlayerCardScanExtended> = {}): PlayerCardScanExtended => ({
  stats: {}, review: [], ...overrides,
});

test('PNG decoding preserves RGB, RGBA, alpha and row order', () => {
  const rgba: RgbaImage = { width: 2, height: 2, data: [255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 12, 34, 56, 255] };
  assert.deepEqual(Array.from(decodeScreenshotPng(pngBase64(rgba)).data), rgba.data);
  const rgb = decodeScreenshotPng(pngBase64(rgba, 3));
  assert.deepEqual([rgb.width, rgb.height], [2, 2]);
  assert.equal(rgb.data[7], 255);
  assert.equal(rgb.data[12], 12);
});

test('non-PNG input is rejected instead of supplying invented pixels', () => {
  assert.throws(() => decodeScreenshotPng(Buffer.from('not a PNG').toString('base64')));
});

test('live orchestration: normalized URI and pixels -> learning role -> persistence -> whiteness', async () => {
  let disposed = false;
  const result = await scanPlayerInput('original.jpg', {
    prepare: async uri => {
      assert.equal(uri, 'original.jpg');
      return { uri: 'normalized.png', image: decodeScreenshotPng(pngBase64(pixels)), dispose: async () => { disposed = true; } };
    },
    recognize: async uri => { assert.equal(uri, 'normalized.png'); return ocr; },
  });
  assert.equal(disposed, true);
  assert.deepEqual(result.establishedRoles, ['DC', 'DMC']);
  assert.deepEqual(result.learningRole, { role: 'MC', points: 1 }); // frozen fixture is 1/50, later evidence is 2/50
  const state = mergePlayerScanState(fresh(), result);
  const stored: Player = JSON.parse(JSON.stringify({ ...state, id: 'moore', name: 'Moore', age: 18,
    talent: 'Normal', overall: 192, stats: result.stats, isMutantCandidate: false }));
  assert.equal(stored.newRole, 'MC');
  assert.equal(stored.newRolePoints, 1);
  assert.equal(getWhiteStatKeys(stored.role).length, 10);
  for (const stat of ['DRIBBLING', 'SHOOTING', 'SPEED']) assert.equal(isWhiteStat(stored.role, stat), false);
  assert.equal(needsRoleReview(result), false);
});

test('decode failure preserves text output, abstains, and cannot promote text roles', async () => {
  const result = await scanPlayerInput('original.jpg', {
    prepare: async () => { throw new Error('decode failed'); },
    recognize: async uri => { assert.equal(uri, 'original.jpg'); return ocr; },
  });
  assert.deepEqual(result.stats, parsePlayerCard(ocr).stats);
  assert.ok(result.roles?.includes('MC')); // legacy text pass is deliberately frozen
  assert.equal(needsRoleReview(result), true);
  assert.deepEqual(mergePlayerScanState(fresh(), result).role, []);
  assert.deepEqual(mergePlayerScanState(before, result).boosts, before.boosts);
  assert.ok(result.review.some(f => f.field === 'image'));
});

test('OCR rejection still releases the prepared cache image', async () => {
  let disposed = false;
  await assert.rejects(scanPlayerInput('card.jpg', {
    prepare: async () => ({ uri: 'cache.png', image: pixels, dispose: async () => { disposed = true; } }),
    recognize: async () => { throw new Error('OCR failed'); },
  }), /OCR failed/);
  assert.equal(disposed, true);
});

test('explicit supplied pixels skip preparation; cleanup errors do not discard observations', async () => {
  const result = await scanPlayerInput('card.png', {
    prepare: async () => { throw new Error('must not prepare'); }, recognize: async () => ocr,
  }, pixels);
  assert.deepEqual(result.establishedRoles, ['DC', 'DMC']);
  const afterCleanupFailure = await scanPlayerInput('card.png', {
    prepare: async () => ({ uri: 'cache.png', image: pixels, dispose: async () => { throw new Error('cleanup'); } }),
    recognize: async () => ocr,
  });
  assert.deepEqual(afterCleanupFailure.establishedRoles, ['DC', 'DMC']);
});

test('unread and flagged partial fields preserve the full previously saved state', () => {
  assert.deepEqual(mergePlayerScanState(before, scan()), before);
  const partial = scan({ establishedRoles: ['DC'], learningRole: null,
    specialAbilities: [], boosts: {}, review: [
      { field: 'roles.MC', reason: 'chip_state_unclear' },
      { field: 'specialAbilities', reason: 'unmatched_icon' },
      { field: 'boosts.TACKLING', reason: 'boost_split_unclear' },
    ] });
  assert.deepEqual(mergePlayerScanState(before, partial), before);
  assert.equal(needsRoleReview(partial), true);
});

test('observed absence clears stale learning, ability and boost state', () => {
  const result = mergePlayerScanState(before, scan({ establishedRoles: ['DC', 'DMC', 'MC'],
    learningRole: null, tier: 'T0', playstyle: 'none', specialAbilities: [], boosts: {} }));
  assert.equal(result.newRole, null);
  assert.equal(result.newRolePoints, 0);
  assert.equal(result.tier, 'T0');
  assert.deepEqual(result.boosts, {});
  assert.deepEqual(result.specialAbilities, []);
  assert.equal(result.playstyle, 'none');
});

test('empty observed roles are distinct from an unread role list', () => {
  const result = mergePlayerScanState(before, scan({ establishedRoles: [], learningRole: null }));
  assert.deepEqual(result.role, []);
  assert.ok(playerRoleError(result));
});

test('unread tier requires explicit review; observed T0 does not', () => {
  assert.equal(needsTierReview(scan()), true);
  assert.equal(mergePlayerScanState(before, scan()).tier, 'T3');
  assert.equal(needsTierReview(scan({ tier: 'T0' })), false);
  assert.equal(needsTierReview(scan({ tier: 'unrecognised' })), true);
});

test('boost overlays never alter base stats through state merging', () => {
  const observed = scan({ stats: { TACKLING: 120 }, boosts: before.boosts });
  const state = mergePlayerScanState(fresh(), observed);
  assert.equal(observed.stats.TACKLING, 120);
  assert.equal(state.boosts?.TACKLING.amount, 10);
  assert.equal('stats' in state, false);
});

test('manual review rejects learning/established overlap and invalid progress', () => {
  assert.ok(playerRoleError(before));
  const valid = { role: ['DC', 'DMC'], newRole: 'MC', newRolePoints: 2 };
  assert.equal(playerRoleError(valid), null);
  for (const points of [50, -1, NaN, 1.5]) assert.ok(playerRoleError({ ...valid, newRolePoints: points }));
  assert.ok(playerRoleError({ ...valid, newRole: 'XYZ' }));
  assert.ok(playerRoleError({ role: ['GK', 'ST'] }));
  assert.equal(playerRoleError({ role: ['GK'] }), null);
});

test('web create/read/edit preserves the complete card state and base stats', () => {
  const storage = new Map<string, string>();
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } });
  try {
    const state = { ...before, role: ['DC', 'DMC'] };
    const id = playerService.create({ ...state, name: 'Moore', age: 18, overall: 192,
      talent: 'Normal', stats: { TACKLING: 120 }, isMutantCandidate: false });
    const loaded = playerService.getById(id)!;
    playerService.update({ ...loaded, ...mergePlayerScanState(loaded, scan()), name: 'Edited Moore' });
    const edited = playerService.getById(id)!;
    assert.equal(edited.name, 'Edited Moore');
    assert.equal(edited.newRolePoints, 2);
    assert.deepEqual(edited.boosts, before.boosts);
    assert.deepEqual(edited.specialAbilities, before.specialAbilities);
    assert.equal(edited.stats.TACKLING, 120);
  } finally {
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('an unreadable role row abstains instead of publishing an empty established set', () => {
  // Pixels are present and the "Roles:" anchor is found, but no chip token was
  // recognised. Every player has at least one established role, so [] here would
  // be a failed read masquerading as an observation — and would clear the stored
  // roles and the learning progress with it.
  const blank: RgbaImage = { width: 1, height: 1, data: [0, 0, 0, 255] };
  const frame = { left: 10, top: 10, width: 40, height: 14 };
  const unreadable = roleChips(blank, {
    tokens: [{ text: 'Roles:', frame }],
    knownRoles: ['DC', 'DMC', 'MC'],
  });
  assert.equal(unreadable.establishedRoles, undefined);
  assert.equal(unreadable.learningRole, undefined);
  assert.ok(unreadable.review.some(f => f.field === 'roles' && f.reason === 'region_unread'));

  const asScan = scan({ establishedRoles: unreadable.establishedRoles,
    learningRole: unreadable.learningRole, review: unreadable.review });
  assert.equal(needsRoleReview(asScan), true);
  assert.deepEqual(mergePlayerScanState(before, asScan), before);
});

test('a dark-only role row abstains rather than reporting no established roles', () => {
  // A learning chip with an X/50 counter and no established chip alongside it is
  // not a valid card state: it means the established chips were misclassified.
  // Nothing else flags this, so without the guard it publishes [] as fact.
  const { img, fill: paint } = blankImage(400, 200, hsvToRgb(127, 0.30, 0.98));
  paint(100, 40, 180, 90, hsvToRgb(49, 0.52, CALIBRATION.chip.darkValueMax / 2));
  const result = roleChips(img, {
    tokens: [
      { text: 'Roles:', frame: { left: 20, top: 60, width: 50, height: 18 } },
      { text: 'MC', frame: { left: 120, top: 60, width: 30, height: 18 } },
      { text: '2/50', frame: { left: 200, top: 60, width: 40, height: 18 } },
    ],
    knownRoles: ['MC', 'DC', 'DMC'],
  });
  assert.equal(result.establishedRoles, undefined);
  assert.equal(result.learningRole, undefined);
  assert.ok(result.review.some(f => f.field === 'roles' && f.reason === 'low_confidence'));
  assert.equal(needsRoleReview(scan({ review: result.review })), true);
});

test('two-word GK stat rows can carry an observable boost overlay', () => {
  // RUSHING OUT / AERIAL REACH reach OCR as two elements, exactly as the frozen
  // text pass sees them. Without two-word matching a boost on them is structurally
  // unreachable, and boosts would then read {} — an absence that was never observed.
  const el = (text: string, left: number, top: number, width: number) =>
    ({ text, frame: { left, top, width, height: 16 } });
  const row = [el('AERIAL', 0, 100, 60), el('REACH', 62, 100, 50),
    el('120', 200, 100, 30), el('+15', 232, 100, 26)];
  const gkOcr: OcrResult = {
    text: 'AERIAL REACH 120 +15',
    blocks: [{ text: 'AERIAL REACH 120 +15', lines: [{ text: 'AERIAL REACH 120 +15', elements: row }] }],
  };
  // No image: the overlay cannot be classified, so it must abstain by name rather
  // than silently vanish from the candidate list.
  const noPixels = parsePlayerCard(gkOcr, null);
  assert.equal(noPixels.stats['AERIAL REACH'], 120);
  assert.ok(noPixels.review.some(f => f.field === 'boosts.AERIAL REACH'));
  assert.equal(noPixels.boosts, undefined);
});
