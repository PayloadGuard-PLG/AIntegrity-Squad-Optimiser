import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { decodeScreenshotPng } from '../src/logic/screenshotPixels';
import { scanPlayerInput } from '../src/logic/playerScanPipeline';
import { mergePlayerScanState, replaceNewPlayerScanState, matchesSavedPlayerScanIdentity, needsRoleReview, needsTierReview, playerRoleError, PlayerCardState } from '../src/logic/playerScanState';
import { parsePlayerCard, parsePlayerCardText, parseStructuredRoleState, OcrBlock, OcrResult, PlayerCardScanExtended } from '../src/logic/playerCardParse';
import { RgbaImage, roleChips, CALIBRATION } from '../src/logic/glyphReader';
import { blankImage, hsvToRgb } from './helpers/png';
import { buildSyntheticCard } from './helpers/syntheticCard';
import { getWhiteStatKeys, isWhiteStat } from '../src/utils/roleWeights';
import { playerService } from '../src/services/playerService.web';
import { Player } from '../src/database/playerSchema';
import { ingestCardTrainingRate } from '../src/logic/trainingRate';

const ocr: OcrResult = JSON.parse(readFileSync(join(__dirname, 'fixtures/mlkit-moore.json'), 'utf8'));
const pixels = buildSyntheticCard('moore', ocr);
const ROLE_PROGRESS_RE_FOR_TEST = /(\d{1,2})\s*\/\s*50/;
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

test('new-player intake never inherits unresolved state from a previously scanned unsaved player', () => {
  const unresolved = scan({
    name: 'Danny Finlayson',
    age: 20,
    tier: 'T3',
    review: [{ field: 'roles', reason: 'low_confidence', detail: 'role evidence disagrees' }],
  });

  const next = replaceNewPlayerScanState(unresolved);
  assert.deepEqual(next.role, []);
  assert.equal(next.newRole, undefined);
  assert.equal(next.newRolePoints, undefined);
  assert.equal(next.tier, 'T3');

  const resolved = replaceNewPlayerScanState(scan({
    name: 'Danny Finlayson',
    age: 20,
    establishedRoles: ['AMC', 'MC'],
    learningRole: { role: 'ML', points: 39 },
    tier: 'T3',
  }));
  assert.deepEqual(resolved.role, ['AMC', 'MC']);
  assert.equal(resolved.newRole, 'ML');
  assert.equal(resolved.newRolePoints, 39);
});

test('edit rescan rejects a different or unread identity before state merging', () => {
  const saved = { name: 'Danny Finlayson', age: 20 };
  assert.equal(matchesSavedPlayerScanIdentity(saved, { name: '  DANNY   finlayson ', age: 20 }), true);
  assert.equal(matchesSavedPlayerScanIdentity(saved, { name: 'Ryan Gilmartin', age: 20 }), false);
  assert.equal(matchesSavedPlayerScanIdentity(saved, { name: 'Danny Finlayson', age: 19 }), false);
  assert.equal(matchesSavedPlayerScanIdentity(saved, { age: 20 }), false);
});

test('new-player screen uses replacement semantics while edit rescans retain merge semantics', () => {
  const addScreen = readFileSync(join(__dirname, '..', 'app/player/new.tsx'), 'utf8');
  const editScreen = readFileSync(join(__dirname, '..', 'app/player/[id].tsx'), 'utf8');

  assert.match(addScreen, /replaceNewPlayerScanState\(data\)/);
  assert.doesNotMatch(addScreen, /mergePlayerScanState\(cardState,\s*data\)/);
  assert.match(addScreen, /preserveUnread=\{false\}/);
  assert.match(editScreen, /mergePlayerScanState\(cardState,\s*data\)/);
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

test('structured OCR role row distinguishes established from learning without pixels', () => {
  const finlayson = JSON.parse(
    readFileSync(join(__dirname, 'fixtures/mlkit-finlayson.json'), 'utf8')
  ) as OcrResult;
  const blakie = JSON.parse(
    readFileSync(join(__dirname, 'fixtures/mlkit-blakie.json'), 'utf8')
  ) as OcrResult;

  assert.deepEqual(parseStructuredRoleState(finlayson), {
    establishedRoles: ['AMC', 'MC'],
    learningRole: { role: 'ML', points: 29 },
  });
  assert.equal(parseStructuredRoleState(blakie), undefined,
    'a text-only row without X/50 cannot prove that all labels are established');

  const parsed = parsePlayerCard(finlayson, null);
  assert.deepEqual(parsed.establishedRoles, ['AMC', 'MC']);
  assert.deepEqual(parsed.learningRole, { role: 'ML', points: 29 });
  assert.equal(needsRoleReview(parsed), false);

  const state = mergePlayerScanState(fresh(), parsed);
  assert.deepEqual(state.role, ['AMC', 'MC']);
  assert.equal(state.newRole, 'ML');
  assert.equal(state.newRolePoints, 29);
});

test('learning-role counter in a separate OCR block remains attached to the rightmost role', () => {
  const split = JSON.parse(JSON.stringify(ocr)) as OcrResult;
  const roleBlock = split.blocks.find(block => /^Roles:/i.test(block.text.trim()));
  assert.ok(roleBlock);
  const roleLine = roleBlock!.lines[0];
  assert.ok(roleLine);

  roleBlock!.text = 'Roles: DC DMC MC';
  roleLine.text = 'Roles: DC DMC MC';
  roleLine.elements = roleLine.elements.filter(element => !ROLE_PROGRESS_RE_FOR_TEST.test(element.text));

  split.blocks.push({
    text: '7/50',
    frame: { left: 1450, top: 375, width: 50, height: 18 },
    lines: [{
      text: '7/50',
      frame: { left: 1450, top: 375, width: 50, height: 18 },
      elements: [{
        text: '7/50',
        frame: { left: 1450, top: 375, width: 50, height: 18 },
      }],
    }],
  });

  const parsed = parseStructuredRoleState(split);
  assert.deepEqual(parsed, {
    establishedRoles: ['DC', 'DMC'],
    learningRole: { role: 'MC', points: 7 },
  });

  const full = parsePlayerCard(split, null);
  assert.deepEqual(full.establishedRoles, ['DC', 'DMC']);
  assert.deepEqual(full.learningRole, { role: 'MC', points: 7 });
  assert.equal(needsRoleReview(full), false);
});

test('same-row X/50 outside the role-chip adjacency window is not treated as role progress', () => {
  const blakie = JSON.parse(
    readFileSync(join(__dirname, 'fixtures/mlkit-blakie.json'), 'utf8')
  ) as OcrResult;
  const roleBlock = blakie.blocks.find(block => /^Roles:/i.test(block.text.trim()));
  assert.ok(roleBlock?.frame);

  const polluted = JSON.parse(JSON.stringify(blakie)) as OcrResult;
  polluted.blocks.push({
    text: '29/50',
    frame: { left: 1900, top: roleBlock!.frame!.top, width: 50, height: 18 },
    lines: [{
      text: '29/50',
      frame: { left: 1900, top: roleBlock!.frame!.top, width: 50, height: 18 },
      elements: [{
        text: '29/50',
        frame: { left: 1900, top: roleBlock!.frame!.top, width: 50, height: 18 },
      }],
    }],
  });

  assert.equal(parseStructuredRoleState(polluted), undefined,
    'a distant counter does not certify the role row');
});

test('unread learning counter never promotes a black role to established', () => {
  const finlayson = JSON.parse(readFileSync(join(__dirname, 'fixtures/mlkit-finlayson.json'), 'utf8')) as OcrResult;
  const current = JSON.parse(JSON.stringify(finlayson).replace(/29\/50/g, '39/50')) as OcrResult;
  const currentResult = parsePlayerCard(current, null);
  assert.deepEqual(currentResult.establishedRoles, ['AMC', 'MC']);
  assert.deepEqual(currentResult.learningRole, { role: 'ML', points: 39 });
  const missing = JSON.parse(JSON.stringify(finlayson)) as OcrResult;
  missing.text = missing.text?.replace(/29\s*\/\s*50/g, '');
  for (const block of missing.blocks) {
    block.text = block.text.replace(/29\s*\/\s*50/g, '');
    for (const line of block.lines) {
      line.text = line.text.replace(/29\s*\/\s*50/g, '');
      line.elements = line.elements.filter(element => !ROLE_PROGRESS_RE_FOR_TEST.test(element.text));
    }
  }
  const result = parsePlayerCard(missing, null);
  assert.equal(result.establishedRoles, undefined);
  assert.equal(result.learningRole, undefined);
  assert.equal(needsRoleReview(result), true);
  assert.deepEqual(replaceNewPlayerScanState(result).role, []);
  assert.equal(parseStructuredRoleState(missing), undefined);
});

test('ambiguous pixels cannot be overruled by OCR role labels', () => {
  const partial = JSON.parse(JSON.stringify(ocr)) as OcrResult;
  const result = parsePlayerCard(partial, blankImage(pixels.width, pixels.height).img);
  assert.equal(needsRoleReview(result), true);
  assert.ok(result.review.some(flag => flag.field === 'roles' || flag.field.startsWith('roles.')));
});

test('line-level X/50 fallback keeps a nearby learning role when the counter element is absent', () => {
  const split = JSON.parse(JSON.stringify(ocr)) as OcrResult;
  const roleBlock = split.blocks.find(block => /^Roles:/i.test(block.text.trim()));
  assert.ok(roleBlock);
  const roleLine = roleBlock!.lines[0];
  roleLine.elements = roleLine.elements.filter(element => !ROLE_PROGRESS_RE_FOR_TEST.test(element.text));

  assert.deepEqual(parseStructuredRoleState(split), {
    establishedRoles: ['DC', 'DMC'],
    learningRole: { role: 'MC', points: 1 },
  });
});

test('decode failure still ingests a complete structured OCR role row', async () => {
  const result = await scanPlayerInput('original.jpg', {
    prepare: async () => { throw new Error('decode failed'); },
    recognize: async uri => { assert.equal(uri, 'original.jpg'); return ocr; },
  });
  assert.deepEqual(result.stats, parsePlayerCard(ocr).stats);
  assert.deepEqual(result.establishedRoles, ['DC', 'DMC']);
  assert.deepEqual(result.learningRole, { role: 'MC', points: 1 });
  assert.equal(needsRoleReview(result), false);
  assert.deepEqual(mergePlayerScanState(fresh(), result).role, ['DC', 'DMC']);
  assert.deepEqual(mergePlayerScanState(before, result).boosts, before.boosts);
  assert.ok(result.review.some(f => f.field === 'image'));
  assert.ok(!result.review.some(f => f.field === 'roles' || f.field.startsWith('roles.')));
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

test('merged MLAMC OCR element is resolved as independent ML and AMC glyph roles', () => {
  const { img, fill } = blankImage(500, 220, hsvToRgb(0, 0, 0.08));

  const frame = (left: number, top: number, width: number, height: number) => ({
    left, top, width, height
  });

  const established = hsvToRgb(125, 0.8, 0.95);

  fill(100, 111, 145, 118, established);
  fill(160, 111, 250, 118, established);

  const out = roleChips(img, {
    tokens: [
      { text: 'Roles:', frame: frame(20, 120, 55, 20) },
      { text: 'AML', frame: frame(100, 120, 45, 20) },
      { text: 'MLAMC', frame: frame(160, 120, 90, 20) },
    ],
    knownRoles: ['GK', 'DC', 'DL', 'DR', 'DMC', 'MC', 'ML', 'MR', 'AMC', 'AML', 'AMR', 'ST'],
  });

  assert.deepEqual(out.establishedRoles, ['AML', 'ML', 'AMC']);
  assert.equal(out.learningRole, null);
  assert.deepEqual(out.review, []);
});

test('partial glyph role result cannot silently replace fuller anchored text roles', () => {
  const { img, fill } = blankImage(500, 260, hsvToRgb(0, 0, 0.08));

  const f = (left: number, top: number, width = 40, height = 20) => ({
    left, top, width, height
  });

  fill(100, 91, 145, 98, hsvToRgb(125, 0.8, 0.95));

  const result: OcrResult = {
    text: 'Ryan Rogers\nRoles: AML ML',
    blocks: [
      {
        text: 'Ryan Rogers',
        frame: f(20, 20, 150, 24),
        lines: [{
          text: 'Ryan Rogers',
          frame: f(20, 20, 150, 24),
          elements: [
            { text: 'Ryan', frame: f(20, 20, 60, 24) },
            { text: 'Rogers', frame: f(85, 20, 70, 24) },
          ],
        }],
      },
      {
        text: 'Roles: AML ML',
        frame: f(20, 100, 250, 70),
        lines: [
          {
            text: 'Roles: AML',
            frame: f(20, 100, 180, 20),
            elements: [
              { text: 'Roles:', frame: f(20, 100, 55, 20) },
              { text: 'AML', frame: f(100, 100, 45, 20) },
            ],
          },
          {
            text: 'ML',
            frame: f(100, 140, 40, 20),
            elements: [
              { text: 'ML', frame: f(100, 140, 40, 20) },
            ],
          },
        ],
      },
    ],
  };

  const out = parsePlayerCard(result, img);

  assert.deepEqual(out.roles, ['ML', 'AML']);
  assert.equal(out.establishedRoles, undefined);
  assert.equal(out.learningRole, undefined);
  assert.ok(out.review.some(flag =>
    flag.field === 'roles' &&
    flag.reason === 'low_confidence' &&
    flag.detail?.includes('ML')
  ));
});


test('Ryan identity skips merged role row and stat labels', () => {
  const f = (left: number, top: number, width = 80, height = 20) => ({
    left, top, width, height,
  });

  const result: OcrResult = {
    text: [
      'Roles: AML MLAMC',
      'Tackling',
      'Ryan Rogers',
      'Age: 23',
    ].join('\n'),
    blocks: [
      {
        text: 'Roles: AML MLAMC',
        frame: f(20, 20, 260, 22),
        lines: [{
          text: 'Roles: AML MLAMC',
          frame: f(20, 20, 260, 22),
          elements: [
            { text: 'Roles:', frame: f(20, 20, 55, 20) },
            { text: 'AML', frame: f(90, 20, 40, 20) },
            { text: 'MLAMC', frame: f(145, 20, 90, 20) },
          ],
        }],
      },
      {
        text: 'Tackling',
        frame: f(20, 45, 100, 22),
        lines: [{
          text: 'Tackling',
          frame: f(20, 45, 100, 22),
          elements: [
            { text: 'Tackling', frame: f(20, 45, 100, 22) },
          ],
        }],
      },
      {
        text: 'Ryan Rogers',
        frame: f(20, 70, 150, 22),
        lines: [{
          text: 'Ryan Rogers',
          frame: f(20, 70, 150, 22),
          elements: [
            { text: 'Ryan', frame: f(20, 70, 55, 22) },
            { text: 'Rogers', frame: f(82, 70, 65, 22) },
          ],
        }],
      },
      {
        text: 'Age: 23',
        frame: f(20, 100, 90, 22),
        lines: [{
          text: 'Age: 23',
          frame: f(20, 100, 90, 22),
          elements: [
            { text: 'Age:', frame: f(20, 100, 45, 22) },
            { text: '23', frame: f(68, 100, 25, 22) },
          ],
        }],
      },
    ],
  };

  const out = parsePlayerCardText(result);

  assert.equal(out.name, 'Ryan Rogers');
  assert.deepEqual(out.roles, ['ML', 'AMC', 'AML']);
});

test('canonical stat rows can never become player identity', () => {
  const f = (top: number) => ({
    width: 160,
    height: 22,
    top,
    left: 20,
  });

  for (const text of [
    'Tackling',
    'Tackling 9',
    'Finishing',
    'Finishing 115',
    'Rushing Out',
    'Rushing Out 142',
    'Aerial Reach',
    'Aerial Reach 119',
  ]) {
    const out = parsePlayerCardText({
      text,
      blocks: [{
        text,
        frame: f(20),
        lines: [{
          text,
          frame: f(20),
          elements: [{ text, frame: f(20) }],
        }],
      }],
    });

    assert.equal(
      out.name,
      undefined,
      `${text} was incorrectly accepted as player identity`,
    );
  }
});

test('instructional prose cannot become player identity', () => {
  const f = (left: number, top: number, width: number, height = 22) => ({
    left, top, width, height,
  });

  const result: OcrResult = {
    text: [
      'Ryan Rogers',
      'OVR 89',
      'Age: 23',
      'Roles: AML MLAMC',
      'Key attributes for this player are highlighted',
      'Tackling 9',
    ].join('\n'),
    blocks: [
      {
        text: 'Ryan Rogers',
        frame: f(100, 100, 150),
        lines: [],
      },
      {
        text: 'OVR 89',
        frame: f(105, 155, 150),
        lines: [],
      },
      {
        text: 'Age: 23',
        frame: f(100, 205, 90),
        lines: [],
      },
      {
        text: 'Roles: AML MLAMC',
        frame: f(350, 205, 260),
        lines: [],
      },
      {
        text: 'Key attributes for this player are highlighted',
        frame: f(80, 500, 520),
        lines: [],
      },
      {
        text: 'Tackling',
        frame: f(80, 650, 120),
        lines: [],
      },
    ],
  };

  const out = parsePlayerCardText(result);

  assert.equal(out.name, 'Ryan Rogers');
  assert.deepEqual(out.roles, ['ML', 'AMC', 'AML']);
});

test('identity abstains when name region is unread instead of using prose', () => {
  const f = (left: number, top: number, width: number, height = 22) => ({
    left, top, width, height,
  });

  const result: OcrResult = {
    text: [
      'OVR 89',
      'Age: 23',
      'Key attributes for this player are highlighted',
      'Tackling',
    ].join('\n'),
    blocks: [
      {
        text: 'OVR 89',
        frame: f(105, 155, 150),
        lines: [],
      },
      {
        text: 'Age: 23',
        frame: f(100, 205, 90),
        lines: [],
      },
      {
        text: 'Key attributes for this player are highlighted',
        frame: f(80, 500, 520),
        lines: [],
      },
      {
        text: 'Tackling',
        frame: f(80, 650, 120),
        lines: [],
      },
    ],
  };

  const out = parsePlayerCardText(result);
  assert.equal(out.name, undefined);
});

test('real Ryan Rodger OCR header resolves name after stripping shirt number', () => {
  const f = (
    left: number,
    top: number,
    width: number,
    height: number,
  ) => ({ left, top, width, height });

  const result: OcrResult = {
    text: '40 Ryan Rodger\nOVR 89\nAge: 23\nRoles: AML MLAMC',
    blocks: [
      {
        text: '40 Ryan Rodger',
        frame: f(606, 68, 354, 60),
        lines: [{
          text: '40 Ryan Rodger',
          frame: f(606, 68, 354, 60),
          elements: [
            { text: '40', frame: f(606, 68, 37, 51) },
            { text: 'Ryan', frame: f(703, 71, 94, 52) },
            { text: 'Rodger', frame: f(827, 74, 133, 54) },
          ],
        }],
      },
      {
        text: 'OVR 89',
        frame: f(692, 163, 92, 47),
        lines: [{
          text: 'OVR 89',
          frame: f(692, 163, 92, 47),
          elements: [
            { text: 'OVR', frame: f(692, 169, 41, 41) },
            { text: '89', frame: f(737, 163, 47, 41) },
          ],
        }],
      },
      {
        text: 'Age: 23',
        frame: f(685, 249, 116, 41),
        lines: [{
          text: 'Age: 23',
          frame: f(685, 249, 116, 41),
          elements: [
            { text: 'Age:', frame: f(685, 251, 67, 39) },
            { text: '23', frame: f(767, 250, 34, 37) },
          ],
        }],
      },
      {
        text: 'Roles: AML MLAMC',
        frame: f(1239, 250, 363, 39),
        lines: [{
          text: 'Roles: AML MLAMC',
          frame: f(1239, 250, 363, 39),
          elements: [
            { text: 'Roles:', frame: f(1239, 250, 94, 39) },
            { text: 'AML', frame: f(1361, 250, 62, 39) },
            { text: 'MLAMC', frame: f(1457, 250, 145, 39) },
          ],
        }],
      },
    ],
  };

  const out = parsePlayerCardText(result);

  assert.equal(out.name, 'Ryan Rodger');
  assert.equal(out.age, 23);
  assert.equal(out.overall, 89);
  assert.deepEqual(out.roles, ['ML', 'AMC', 'AML']);
});

test('split name blocks and a merged shirt-number element resolve one identity', () => {
  const f = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height });
  const header = (text: string, left: number, width: number): OcrBlock => ({
    text, frame: f(left, 70, width, 40), lines: [{
      text, frame: f(left, 70, width, 40),
      elements: [{ text, frame: f(left, 70, width, 40) }],
    }],
  });
  const result: OcrResult = {
    text: '41 LJDark leo\nOVR 169\nAge: 24',
    blocks: [
      header('41 LJDark', 600, 270),
      header('leo', 890, 65),
      { text: 'OVR 169', frame: f(690, 150, 120, 35), lines: [] },
      { text: 'Age: 24', frame: f(690, 205, 120, 35), lines: [] },
    ],
  };
  assert.equal(parsePlayerCardText(result).name, 'LJDark leo');
  result.blocks.reverse();
  assert.equal(parsePlayerCardText(result).name, 'LJDark leo');
});
