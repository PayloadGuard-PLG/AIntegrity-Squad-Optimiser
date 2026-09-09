// Web implementation of playerService using localStorage.
// Metro resolves this file instead of playerService.ts when bundling for web.

import { Player } from '../database/playerSchema';
import { normaliseStoredTrainingRate, normaliseTrainingRateSource } from '../logic/trainingRate';

const STORAGE_KEY = 'aintegrity_squad';
const UPDATE_EVENT = 'aintegrity_squad_updated';

function load(): Player[] {
  try {
    const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Player[];
    return rows.map(p => ({
      ...p,
      talent: normaliseStoredTrainingRate(p.talent),
      talentSource: normaliseTrainingRateSource(p.talentSource),
    }));
  } catch {
    return [];
  }
}

function save(players: Player[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

function nanoid(): string {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

export const playerService = {
  getAll(): Player[] {
    return load();
  },

  getById(id: string): Player | null {
    return load().find(p => p.id === id) ?? null;
  },

  create(p: Omit<Player, 'id'>): string {
    const players = load();
    const id = nanoid();
    players.push({
      ...p,
      talent: normaliseStoredTrainingRate(p.talent),
      talentSource: normaliseTrainingRateSource(p.talentSource),
      id,
    } as Player);
    save(players);
    return id;
  },

  update(p: Player): void {
    const players = load();
    const idx = players.findIndex(x => x.id === p.id);
    if (idx !== -1) players[idx] = {
      ...p,
      talent: normaliseStoredTrainingRate(p.talent),
      talentSource: normaliseTrainingRateSource(p.talentSource),
    };
    save(players);
  },

  delete(id: string): void {
    save(load().filter(p => p.id !== id));
  },
};
