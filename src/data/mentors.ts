export interface MentorAttributeBoost {
  stats: string[];
  amount: number;
  nextAmount?: number;
}

export interface MentorTacticBoost {
  tactic: string;
  effectivenessPct: number;
}

export interface MentorSignatureMove {
  unlockLevel: number;
  trigger: string;
  effect: string;
}

export interface MentorDefinition {
  id: string;
  name: string;
  archetype: string;
  observedLevel: number;
  attributeBoost: MentorAttributeBoost;
  tacticBoost: MentorTacticBoost;
  signatureMove: MentorSignatureMove;
  source: 'observed';
}

/**
 * Partial observed mentor catalogue from live screens supplied on 2026-09-22.
 * Flat stat effects are deterministic inputs. Percentage tactic/signature labels
 * are preserved as game-stated modifiers; no win probability or goal conversion
 * is inferred from them.
 */
export const MENTOR_CATALOG: MentorDefinition[] = [
  {
    id: 'jonas-braun',
    name: 'Jonas Braun',
    archetype: 'The Analyst',
    observedLevel: 8,
    attributeBoost: { stats: ['STRENGTH', 'POSITIONING'], amount: 20, nextAmount: 25 },
    tacticBoost: { tactic: 'Long Pass', effectivenessPct: 30 },
    signatureMove: {
      unlockLevel: 10,
      trigger: "Opponent's weakest defensive zone identified at halftime",
      effect: '+20 All Attribute boost to players attacking through that area for the rest of the match',
    },
    source: 'observed',
  },
  {
    id: 'lewis-green',
    name: 'Lewis Green',
    archetype: 'The Wing Commander',
    observedLevel: 8,
    attributeBoost: { stats: ['CROSSING', 'HEADING'], amount: 20, nextAmount: 40 },
    tacticBoost: { tactic: 'Attacks over the Wings', effectivenessPct: 30 },
    signatureMove: {
      unlockLevel: 10,
      trigger: 'Aerial duel after a cross',
      effect: "Defender Heading is labelled 80% less effective in the duel",
    },
    source: 'observed',
  },
  {
    id: 'ruben-herrera',
    name: 'Rubén Herrera',
    archetype: 'The Saboteur',
    observedLevel: 9,
    attributeBoost: { stats: ['CREATIVITY', 'PASSING'], amount: 30 },
    tacticBoost: { tactic: 'Counter Attack', effectivenessPct: 30 },
    signatureMove: {
      unlockLevel: 10,
      trigger: 'During a counter-attack',
      effect: "Opponent Marking, Positioning and Speed are labelled 30% less effective",
    },
    source: 'observed',
  },
];
