import type { Player } from '../database/playerSchema';
import type { PlayerCardScanExtended } from './playerCardParse';
import { validateRoleAdjacency, ROLE_CONSTRAINTS } from '../utils/roleWeights';

export type PlayerCardState = Pick<Player,
  'role' | 'tier' | 'newRole' | 'newRolePoints' | 'playstyle' | 'specialAbilities' | 'boosts'>;

/** Blank unsaved-card state. A new-player screenshot is a replacement
 * observation, never a merge with whichever unsaved player happened to be
 * scanned immediately before it.
 */
export function freshPlayerCardState(): PlayerCardState {
  return { role: [], tier: 'T0' };
}

/** New-player intake has no stable persisted identity yet, so carrying unread
 * fields across screenshots can mix two different players. Start from blank on
 * every scan. The edit-player flow intentionally continues to use
 * mergePlayerScanState(), because there the player id is already fixed.
 */
export function replaceNewPlayerScanState(scan: PlayerCardScanExtended): PlayerCardState {
  return mergePlayerScanState(freshPlayerCardState(), scan);
}

/** A saved-player rescan must be tied to the same card before any field merges.
 * The printed name is mandatory; a readable age adds another identity check.
 */
export function matchesSavedPlayerScanIdentity(
  saved: Pick<Player, 'name' | 'age'>,
  scan: Pick<PlayerCardScanExtended, 'name' | 'age'>,
): boolean {
  const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return !!scan.name && normalise(scan.name) === normalise(saved.name) &&
    (scan.age === undefined || scan.age === saved.age);
}

export function needsRoleReview(scan: PlayerCardScanExtended): boolean {
  return scan.establishedRoles === undefined || scan.review.some(f =>
    f.field === 'roles' || f.field.startsWith('roles.') || f.field === 'learningRole');
}

export function needsTierReview(scan: PlayerCardScanExtended): boolean {
  return !/^T[0-6]$/.test(scan.tier ?? '') || scan.review.some(f => f.field === 'tier');
}

/** Merge observations, not defaults. Undefined and flagged partial reads leave
 * existing state alone; observed null/[]/{} clear it. A flat legacy text-role
 * list is never promoted here; playerCardParse may publish establishedRoles
 * only after the anchored OCR Roles row has resolved learning-vs-established
 * state, or after a confident glyph observation.
 */
export function mergePlayerScanState(previous: PlayerCardState, scan: PlayerCardScanExtended): PlayerCardState {
  const next = { ...previous };
  if (!needsRoleReview(scan)) {
    next.role = [...scan.establishedRoles!];
    if (scan.learningRole !== undefined) {
      next.newRole = scan.learningRole?.role ?? null;
      next.newRolePoints = scan.learningRole?.points ?? 0;
    }
  }
  if (!needsTierReview(scan)) next.tier = scan.tier as Player['tier'];
  for (const field of ['playstyle', 'specialAbilities', 'boosts'] as const) {
    const flagged = scan.review.some(f => f.field === field || f.field.startsWith(`${field}.`));
    if (scan[field] !== undefined && !flagged) {
      Object.assign(next, { [field]: scan[field] });
    }
  }
  return next;
}

/** Validation shared by manual entry and scan review; it changes no game state. */
export function playerRoleError(state: Pick<PlayerCardState, 'role' | 'newRole' | 'newRolePoints'>): string | null {
  if (state.role.length === 0) return 'Select at least one established role.';
  if (state.role.some(r => !ROLE_CONSTRAINTS[r]) || state.role.length > 3 ||
      new Set(state.role).size !== state.role.length || !validateRoleAdjacency(state.role)) {
    return 'Select up to three valid adjacent established roles.';
  }
  if (!state.newRole) return null;
  if (state.role.includes(state.newRole)) return 'A learning role cannot also be established. Clear learning when it completes.';
  if (!ROLE_CONSTRAINTS[state.newRole] || state.role.length >= 3 ||
      !validateRoleAdjacency([...state.role, state.newRole])) {
    return 'The learning role must be valid and adjacent to the established roles.';
  }
  const points = state.newRolePoints;
  if (points === undefined || !Number.isInteger(points) || points < 0 || points >= 50) {
    return 'Enter learning progress from 0 to 49. At 50, mark the role established and clear learning.';
  }
  return null;
}
