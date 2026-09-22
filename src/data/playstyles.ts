import type { PlaystyleFamily } from '../logic/glyphReader';
import type { PlaystyleLevel } from '../types/planning';

export interface PlaystyleDefinition {
  id: string;
  name: string;
  family: Exclude<PlaystyleFamily, 'none' | 'unknown'>;
  compatibleRoles: string[];
  source: 'observed';
  observedOn: string[];
  note?: string;
}

export const PLAYSTYLE_LEVEL_EFFECT: Record<PlaystyleLevel, number> = {
  Standard: 1,
  Intermediate: 2,
  Advanced: 3,
  Master: 4,
};

/**
 * Partial observed catalogue only.
 *
 * These five entries are grounded in live player/playstyle screens supplied on
 * 2026-09-22. The catalogue is intentionally incomplete; missing playstyles are
 * not inferred. Additions should be source-observed and preserve role
 * compatibility exactly as displayed in game.
 */
export const PLAYSTYLE_CATALOG: PlaystyleDefinition[] = [
  {
    id: 'regista',
    name: 'Regista',
    family: 'possession',
    compatibleRoles: ['MC', 'DMC'],
    source: 'observed',
    observedOn: ['Ryan Gilmartin'],
  },
  {
    id: 'false-nine',
    name: 'False Nine',
    family: 'attacking',
    compatibleRoles: ['ST', 'AMC'],
    source: 'observed',
    observedOn: ['G Neri'],
  },
  {
    id: 'target-man',
    name: 'Target Man',
    family: 'attacking',
    compatibleRoles: ['ST'],
    source: 'observed',
    observedOn: ['S DarkVader'],
  },
  {
    id: 'stopper',
    name: 'Stopper',
    family: 'defensive',
    compatibleRoles: ['DC'],
    source: 'observed',
    observedOn: ['Darren Moore'],
  },
  {
    id: 'full-back',
    name: 'Full Back',
    family: 'defensive',
    compatibleRoles: ['DL', 'DR'],
    source: 'observed',
    observedOn: ['LJDark leo'],
  },
];

export function getPlaystyleDefinition(id: string): PlaystyleDefinition | null {
  return PLAYSTYLE_CATALOG.find(p => p.id === id) ?? null;
}
