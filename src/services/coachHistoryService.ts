import { expoDb } from '../db';
import type { CoachPreviewInterval, CoachTransferClass } from '../logic/recommendation';
import { normalisePersistedCoachTransferClass } from '../logic/coachTransfer';

export type CoachHistoryEntry = {
  id: string;
  playerId: string;
  timestamp: number;
  coachType: string;
  coachCategory: string;
  sessions: number;
  stats: string[];
  transferClass: CoachTransferClass;
  observedGainIntervals: CoachPreviewInterval[];
  isManual: boolean;
  label: string;
};

function buildLabel(e: Omit<CoachHistoryEntry, 'id' | 'label'>): string {
  const parts: string[] = [];
  if (e.transferClass === 'reward') parts.push('REWARD');
  if (e.transferClass === 'unresolved') parts.push('UNCLASSIFIED');
  if (e.coachType) parts.push(e.coachType.toUpperCase());
  if (e.coachCategory) parts.push(e.coachCategory.toUpperCase());
  parts.push(`×${e.sessions}`);
  parts.push(`${e.stats.length} STAT${e.stats.length !== 1 ? 'S' : ''}`);
  if (e.isManual) parts.push('(MANUAL)');
  return parts.join(' · ');
}

export const coachHistoryService = {
  save(entry: Omit<CoachHistoryEntry, 'label'>): void {
    const label = buildLabel(entry);
    try {
      expoDb.runSync(
        `INSERT OR REPLACE INTO coach_scan_history
           (id, player_id, timestamp, coach_type, coach_category, sessions, stats,
            transfer_class, preview_intervals, transfer_class_source, is_manual, label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.id, entry.playerId, entry.timestamp, entry.coachType, entry.coachCategory,
         entry.sessions, JSON.stringify(entry.stats), entry.transferClass,
         JSON.stringify(entry.observedGainIntervals),
         // Written by the current writer, so the class was actually determined.
         // An entry saved while still unclassified stays unclassified.
         entry.transferClass === 'unresolved' ? 'legacy-default' : 'observed',
         entry.isManual ? 1 : 0, label]
      );
    } catch {}
  },

  getForPlayer(playerId: string, limit = 8): CoachHistoryEntry[] {
    try {
      const rows = expoDb.getAllSync<Record<string, unknown>>(
        `SELECT * FROM coach_scan_history WHERE player_id = ? ORDER BY timestamp DESC LIMIT ?`,
        [playerId, limit]
      );
      return rows.map(r => ({
        id: String(r.id),
        playerId: String(r.player_id),
        timestamp: Number(r.timestamp),
        coachType: String(r.coach_type ?? ''),
        coachCategory: String(r.coach_category ?? ''),
        sessions: Number(r.sessions ?? 30),
        stats: JSON.parse(String(r.stats ?? '[]')) as string[],
        // The class is trusted ONLY when something actually observed it. Rows
        // predating classification were back-filled with the literal 'ordinary'
        // by an earlier migration, so the stored value cannot be believed on its
        // own; without 'observed' provenance the row reads as unknown and the
        // projection abstains rather than inventing an ordinary transfer.
        transferClass: normalisePersistedCoachTransferClass(
          r.transfer_class,
          r.transfer_class_source,
        ),
        observedGainIntervals: JSON.parse(String(r.preview_intervals ?? '[]')) as CoachPreviewInterval[],
        isManual: r.is_manual === 1,
        label: String(r.label ?? ''),
      }));
    } catch {
      return [];
    }
  },
};
