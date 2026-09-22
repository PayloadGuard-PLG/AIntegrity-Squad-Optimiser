import type { Player, PlayerSnapshot, PlaystyleFamily, StatBoost } from '../database/playerSchema';
import type { TierName } from '../types/resources';
import { normaliseStoredTrainingRate, normaliseTrainingRateSource } from './trainingRate';

export interface StoredPlayerRecord {
  id: string;
  name: string;
  roles: string;
  age: number;
  overall: number;
  tier: string;
  talent: string;
  talentSource?: string | null;
  stats: string;
  isMutantCandidate: boolean | number;
  snapshot?: string | null;
  newRole?: string | null;
  newRolePoints?: number | null;
  playstyle?: string | null;
  specialAbilities?: string | null;
  boosts?: string | null;
}

const LEGACY_TIER_MAP: Record<string, TierName> = {
  None: 'T0', Rare: 'T1', Elite: 'T2', Stellar: 'T3',
  Master: 'T4', Epic: 'T5', Legendary: 'T6',
};

function normaliseTier(t: string): TierName {
  return (LEGACY_TIER_MAP[t] ?? t) as TierName;
}

function parseJson<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined;
  try { return JSON.parse(raw) as T; } catch { return undefined; }
}

/**
 * Canonical native row -> Player hydration.
 *
 * OCR-derived card state must not disappear when a user changes tabs. Keeping
 * this conversion pure lets the live-query hook and the CRUD service consume the
 * exact same persisted representation.
 */
export function hydrateStoredPlayer(row: StoredPlayerRecord): Player {
  const roles = parseJson<string[]>(row.roles) ?? ['ST'];
  const stats = parseJson<Record<string, number>>(row.stats) ?? {};

  let snapshot: PlayerSnapshot | null = null;
  const rawSnapshot = parseJson<PlayerSnapshot>(row.snapshot);
  if (rawSnapshot) snapshot = { ...rawSnapshot, tier: normaliseTier(rawSnapshot.tier as string) };

  return {
    id: row.id,
    name: row.name,
    role: roles,
    age: row.age,
    overall: row.overall,
    tier: normaliseTier(row.tier),
    talent: normaliseStoredTrainingRate(row.talent),
    talentSource: normaliseTrainingRateSource(row.talentSource),
    stats,
    isMutantCandidate: Boolean(row.isMutantCandidate),
    snapshot,
    newRole: row.newRole ?? null,
    newRolePoints: row.newRolePoints ?? 0,
    playstyle: (row.playstyle ?? undefined) as PlaystyleFamily | undefined,
    specialAbilities: parseJson<string[]>(row.specialAbilities),
    boosts: parseJson<Record<string, StatBoost>>(row.boosts),
  };
}
