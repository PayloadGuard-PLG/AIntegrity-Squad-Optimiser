/** Pure, Node-testable coach-preview parser. Native image recognition is only an adapter. */
import { OUTFIELD_STATS, GK_STATS } from '../utils/roleWeights';
import type { OcrResult } from './playerCardParse';
import {
  ARROW_RE, resolvePlayerName, resolveTalentTier, resolvePlayerAge,
} from './coachIdentityParse';
import { classifyCoachTransfer, type CoachTransferClass } from './coachTransfer';

const ALL_STATS = [...OUTFIELD_STATS, ...GK_STATS] as string[];
const STATS_BY_LENGTH = [...ALL_STATS].sort((a, b) => b.length - a.length);

const COACH_OCR_CORRECTIONS: Record<string, string> = {
  ANTICIPATIO: 'ANTICIPATION',
  ANTICIPAT1ON: 'ANTICIPATION',
  CONCENTRAT1ON: 'CONCENTRATION',
  COMMUNICAT1ON: 'COMMUNICATION',
};

const CATEGORY_STAT_SETS: Record<string, Set<string>> = {
  Attacking: new Set(['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING']),
  Defending: new Set(['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY']),
  Physical: new Set(['FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY']),
  Safeguard: new Set(['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY']),
  Goalkeeping: new Set([...GK_STATS]),
};

const Y_TOL_NAME = 25;
const Y_TOL_VAL = 18;
const GAIN_RE_STAT = /\+?\s*(\d+)\s*[–\-—]\s*(\d+)/;
const GAIN_RE_OVR = /\+\s*(\d+)\s*[–\-—]\s*(\d+)/;

export const COACH_TYPES = ['Standard', 'Focused', 'Extensive'] as const;
export const COACH_CATS = ['Attacking', 'Defending', 'Physical', 'Safeguard', 'Goalkeeping'] as const;
export type CoachType = typeof COACH_TYPES[number];
export type CoachCategory = typeof COACH_CATS[number];

export interface StatCapture {
  statName: string;
  /** Zero means the baseline was not observed; the interval remains valid. */
  statBefore: number;
  gainLo: number;
  gainHi: number;
}

export interface CoachScanResult {
  coachType?: CoachType;
  coachCategory?: CoachCategory;
  multiplier?: number;
  playerName?: string;
  playerAge?: number;
  talentTier?: string;
  ovrBefore?: number;
  ovrBoostLo?: number;
  ovrBoostHi?: number;
  transferClass: CoachTransferClass;
  /** Compatibility view; routing must use transferClass. */
  isRewardCoach: boolean;
  isTrainingCamp: boolean;
  isAllRound: boolean;
  stats: StatCapture[];
  _debugBlocks?: string;
}

type Token = { text: string; top: number; left: number };

function canonicalCoachText(raw: string): string {
  let canonical = raw.toUpperCase().trim();
  for (const [misread, stat] of Object.entries(COACH_OCR_CORRECTIONS)) {
    canonical = canonical.replace(new RegExp(`\\b${misread}\\b`, 'g'), stat);
  }
  return canonical;
}

function statPattern(stat: string): string {
  return stat.replace(/\s+/g, '\\s+');
}

function findStats(text: string): string[] {
  const canonical = canonicalCoachText(text);
  return STATS_BY_LENGTH.filter(stat => new RegExp(`\\b${statPattern(stat)}\\b`, 'i').test(canonical));
}

function splitStatAt(tokens: Token[], index: number): string | undefined {
  const first = tokens[index];
  const second = tokens[index + 1];
  if (!second || Math.abs(second.top - first.top) >= Y_TOL_NAME) return undefined;
  const combined = canonicalCoachText(`${first.text} ${second.text}`);
  return STATS_BY_LENGTH.find(stat => stat.includes(' ') && combined === stat);
}

function validGain(lo: number, hi: number): boolean {
  return lo >= 0 && hi >= lo && hi <= 300 && lo <= 150;
}

/**
 * Parses ML Kit's recognized text. A stat label may be a standalone line or be
 * merged into `FINISHING 125 +5–7`; both layouts occur on the three-column UI.
 */
export function parseCoachPreview(result: OcrResult): CoachScanResult {
  const blockText = (result.blocks ?? []).map(b => b.text).join('\n');
  const fullText = [result.text ?? '', blockText].filter(Boolean).join('\n');
  const transferClass = classifyCoachTransfer(fullText);

  const tokens: Token[] = (result.blocks ?? [])
    .flatMap(b => b.lines ?? [])
    .map(l => ({ text: (l.text ?? '').trim(), top: l.frame?.top ?? 0, left: l.frame?.left ?? 0 }))
    .filter(t => t.text.length > 0);

  const rawType = (/\b(Standard|Focused|Extensive)\b/i.exec(fullText))?.[1];
  const coachType = rawType
    ? COACH_TYPES.find(t => t.toLowerCase() === rawType.toLowerCase())
    : undefined;
  const rawCat = (/\b(Attacking|Defending|Physical|Safeguard|Goalkeeping)\b/i.exec(fullText))?.[1];
  const coachCategory = rawCat
    ? COACH_CATS.find(c => c.toLowerCase() === rawCat.toLowerCase())
    : undefined;
  const typeIdx = fullText.search(/\b(Standard|Focused|Extensive)\b/i);
  const multMatch = /[×xX*✕]\s*(\d+)/.exec(typeIdx >= 0 ? fullText.slice(typeIdx) : fullText);
  const multiplier = multMatch ? parseInt(multMatch[1], 10) : undefined;

  const ovrMatch = /\bOVR\b[^\d]*(\d{2,3}(?:\.\d)?)/i.exec(fullText)
    ?? /(\d{2,3}(?:\.\d)?)\s*OVR/i.exec(fullText);
  const ovrBefore = ovrMatch ? parseFloat(ovrMatch[1]) : undefined;
  // An OVR boost is only observed on the OVR row. Searching the whole document
  // after "OVR" launders the first stat interval into an OVR observation.
  const ovrToken = tokens.find(t => /\bOVR\b/i.test(t.text));
  const ovrLine = ovrToken
    ? tokens
      .filter(t => Math.abs(t.top - ovrToken.top) < Y_TOL_VAL && (t === ovrToken || t.left > ovrToken.left))
      .sort((a, b) => a.left - b.left)
      .map(t => t.text)
      .join(' ')
    : '';
  const ovrLineMatch = /\bOVR\b[^\d]*(\d{2,3}(?:\.\d)?)/i.exec(ovrLine)
    ?? /(\d{2,3}(?:\.\d)?)\s*OVR/i.exec(ovrLine);
  const boostMatch = ovrLineMatch
    ? GAIN_RE_OVR.exec(ovrLine.slice(ovrLineMatch.index + ovrLineMatch[0].length))
    : null;

  const captureMap = new Map<string, StatCapture>();
  const upsert = (candidate: StatCapture) => {
    const existing = captureMap.get(candidate.statName);
    if (!existing
      || (candidate.statBefore > 0 && existing.statBefore === 0)
      || (candidate.statBefore > 0
        && candidate.gainHi - candidate.gainLo < existing.gainHi - existing.gainLo)) {
      captureMap.set(candidate.statName, candidate);
    }
  };

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];
    const directStats = findStats(token.text);
    const splitStat = directStats.length === 0 ? splitStatAt(tokens, tokenIndex) : undefined;
    const statNames = splitStat ? [splitStat] : directStats;
    for (const statName of statNames) {
      const category = coachCategory ? CATEGORY_STAT_SETS[coachCategory] : undefined;
      if (coachType === 'Focused' && category && !category.has(statName)) continue;

      const labelTokens = splitStat ? [token, tokens[tokenIndex + 1]] : [token];
      const labelRight = Math.max(...labelTokens.map(t => t.left));
      const sameRow = [
        ...labelTokens,
        ...tokens.filter(t => !labelTokens.includes(t)
          && labelTokens.some(label => Math.abs(t.top - label.top) < Y_TOL_VAL)
          && t.left > labelRight),
      ]
        .sort((a, b) => a.left - b.left)
        .map(t => canonicalCoachText(t.text))
        .join(' ');
      const afterStat = sameRow.replace(
        new RegExp(`^[\\s\\S]*?\\b${statPattern(statName)}\\b`, 'i'),
        '',
      );
      const rowMatch = /^\s*(?:(\d{1,3})\s+)?\+?\s*(\d+)\s*[–\-—]\s*(\d+)/.exec(afterStat)
        ?? GAIN_RE_STAT.exec(afterStat);

      if (rowMatch) {
        // The anchored form has baseline/lo/hi; the fallback has only lo/hi.
        const anchored = rowMatch.length === 4;
        const baseline = anchored && rowMatch[1] ? parseInt(rowMatch[1], 10) : 0;
        const lo = parseInt(rowMatch[anchored ? 2 : 1], 10);
        const hi = parseInt(rowMatch[anchored ? 3 : 2], 10);
        if (validGain(lo, hi)) upsert({ statName, statBefore: baseline, gainLo: lo, gainHi: hi });
      } else if (ARROW_RE.test(afterStat)) {
        upsert({ statName, statBefore: 0, gainLo: 0, gainHi: 0 });
      }
    }
  }

  return {
    coachType,
    coachCategory,
    multiplier,
    playerName: resolvePlayerName(result.blocks ?? []),
    playerAge: resolvePlayerAge(fullText),
    talentTier: resolveTalentTier(result.blocks ?? []),
    ovrBefore,
    ovrBoostLo: boostMatch ? parseInt(boostMatch[1], 10) : undefined,
    ovrBoostHi: boostMatch ? parseInt(boostMatch[2], 10) : undefined,
    transferClass,
    isRewardCoach: transferClass === 'reward',
    isTrainingCamp: /\btraining\s*camp\b/i.test(fullText),
    isAllRound: /\ball[\s\-]*round\b/i.test(fullText),
    stats: Array.from(captureMap.values()),
    _debugBlocks: (result.blocks ?? [])
      .map((b, i) => `[${i}] ${b.text.replace(/\n/g, ' ').slice(0, 60)}`)
      .join(' | '),
  };
}
