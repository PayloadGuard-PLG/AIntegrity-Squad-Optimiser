import { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSquad } from '../../src/hooks/useSquad';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { theme, TIER_COLORS } from '../../src/constants/theme';
import { squadPlanService, SquadPlanRun } from '../../src/services/squadPlanService';
import { formatGain, formatOvrDelta, EVIDENCE_LABEL } from '../../src/logic/runEvidence';
import { TierName } from '../../src/types/resources';

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function SquadPlanScreen() {
  const { squad } = useSquad();
  const [runsByPlayer, setRunsByPlayer] = useState<Record<string, SquadPlanRun[]>>({});

  useFocusEffect(useCallback(() => {
    const allRuns = squadPlanService.getAllRuns();
    const grouped: Record<string, SquadPlanRun[]> = {};
    for (const run of allRuns) {
      if (!grouped[run.playerId]) grouped[run.playerId] = [];
      grouped[run.playerId].push(run);
    }
    setRunsByPlayer(grouped);
  }, []));

  function deleteRun(id: string) {
    Alert.alert('DELETE RUN', 'Remove this run from the squad plan?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          squadPlanService.deleteRun(id);
          const allRuns = squadPlanService.getAllRuns();
          const grouped: Record<string, SquadPlanRun[]> = {};
          for (const run of allRuns) {
            if (!grouped[run.playerId]) grouped[run.playerId] = [];
            grouped[run.playerId].push(run);
          }
          setRunsByPlayer(grouped);
        },
      },
    ]);
  }

  const playersWithAnyRuns = squad.filter(p => (runsByPlayer[p.id]?.length ?? 0) > 0);
  const playersWithoutRuns = squad.filter(p => !runsByPlayer[p.id]?.length);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 14, paddingHorizontal: 16, paddingBottom: 40 }}>

        {squad.length === 0 && (
          <View style={{ padding: 24, borderWidth: 1, borderColor: theme.hairline, alignItems: 'center' }}>
            <MonoLabel color={theme.inkGhost}>ADD PLAYERS TO BEGIN</MonoLabel>
          </View>
        )}

        {/* Players with saved runs */}
        {playersWithAnyRuns.map(player => {
          const runs = runsByPlayer[player.id] ?? [];
          return (
            <View key={player.id} style={{ marginBottom: 20 }}>
              {/* Player header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.hairline2, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: theme.display, fontSize: 14, fontWeight: '700', color: theme.ink }}>{player.name}</Text>
                  <MonoLabel size={8} color={theme.inkMuted}>{player.role.join(' · ')} · OVR {player.overall.toFixed(0)} · {player.tier.toUpperCase()}</MonoLabel>
                </View>
                <MonoLabel size={9} color={theme.inkGhost}>{runs.length} RUN{runs.length !== 1 ? 'S' : ''}</MonoLabel>
              </View>

              {runs.map(run => {
                // An interval run has no scalar ovrAfter to subtract. formatOvrDelta
                // returns the change in the shape the evidence actually supports —
                // a range stays a range — and the grade travels with it.
                const ovrDelta = formatOvrDelta(run.outcome, run.ovrBefore);
                // An observed run has NO post-action OVR — the preview showed a
                // boost, not a result — so there is nothing to print after the
                // arrow. Printing ovrBefore+boost there is the laundering itself.
                const ovrAfterText =
                  run.outcome.kind === 'projected' || run.outcome.kind === 'legacy-unknown'
                    ? run.outcome.ovrAfter.toFixed(1)
                    : null;
                const tierColor = run.tier ? (TIER_COLORS[run.tier as TierName] ?? theme.inkSec) : null;
                return (
                  <View key={run.id} style={{ borderWidth: 1, borderColor: theme.hairline, marginBottom: 6, backgroundColor: theme.surface }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12 }}>
                      {/* OVR change */}
                      <View style={{ minWidth: 70 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                          <Text style={{ fontFamily: theme.mono, fontSize: 14, fontWeight: '700', color: theme.ink }}>{run.ovrBefore.toFixed(0)}</Text>
                          {ovrAfterText !== null && (
                            <>
                              <Text style={{ fontFamily: theme.mono, fontSize: 10, color: theme.inkGhost }}>→</Text>
                              <Text style={{ fontFamily: theme.mono, fontSize: 13, fontWeight: '700', color: theme.pos }}>{ovrAfterText}</Text>
                            </>
                          )}
                        </View>
                        <MonoLabel size={8} color={ovrDelta.grade === 'legacy-unknown' ? theme.inkMuted : theme.pos}>
                          {ovrDelta.text} OVR
                        </MonoLabel>
                        {run.outcome.kind !== 'projected' && (
                          <MonoLabel size={7} color={run.outcome.kind === 'legacy-unknown' ? theme.neg : theme.inkGhost}>
                            {run.outcome.kind === 'legacy-unknown'
                              ? EVIDENCE_LABEL['legacy-unknown']
                              : run.outcome.kind === 'none-observed'
                                ? 'NO OVR OBSERVED'
                                : 'OBSERVED BOOST'}
                          </MonoLabel>
                        )}
                      </View>

                      {/* Meta */}
                      <View style={{ flex: 1, paddingHorizontal: 10 }}>
                        <MonoLabel size={9} color={theme.inkSec}>×{run.sessions} SESSIONS · {run.selectedStats.length} STATS</MonoLabel>
                        <MonoLabel size={8} color={theme.inkGhost}>{formatDate(run.createdAt)}</MonoLabel>
                        {run.tier && (
                          <MonoLabel size={8} color={tierColor ?? theme.inkSec}>+ {run.tier.toUpperCase()} TIER</MonoLabel>
                        )}
                      </View>

                      {/* Delete */}
                      <Pressable onPress={() => deleteRun(run.id)}
                        style={{ paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: theme.neg + '44' }}>
                        <MonoLabel size={9} color={theme.neg}>✕</MonoLabel>
                      </Pressable>
                    </View>

                    {/* Stat gains row */}
                    {run.gains.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 12, paddingBottom: 10 }}>
                        {run.gains.map(g => {
                          // One formatter for every kind. An observed interval renders
                          // as an interval; nothing here averages two bounds.
                          const shown = formatGain(g);
                          return (
                          <View key={g.stat} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: theme.surface2, borderWidth: 1, borderColor: shown.grade === 'legacy-unknown' ? theme.neg + '44' : theme.hairline }}>
                            <Text style={{ fontFamily: theme.mono, fontSize: 8, color: theme.inkMuted }}>{g.stat}</Text>
                            <Text style={{ fontFamily: theme.mono, fontSize: 8, color: shown.grade === 'legacy-unknown' ? theme.inkMuted : theme.pos, fontWeight: '700' }}>{shown.text}</Text>
                          </View>
                          );
                        })}
                      </View>
                    )}

                    {run.outcome.kind === 'legacy-unknown' && (
                      <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
                        <MonoLabel size={7} color={theme.inkMuted}>
                          SAVED BEFORE PROJECTIONS AND OBSERVED RANGES WERE RECORDED SEPARATELY.
                          THESE FIGURES MAY BE THE MIDPOINT OF A RANGE THE GAME DISPLAYED —
                          NOT USABLE AS CALIBRATION EVIDENCE.
                        </MonoLabel>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Add run shortcut */}
              <Pressable onPress={() => router.push('/coaches' as any)}
                style={{ borderWidth: 1, borderColor: theme.hairline, borderStyle: 'dashed', padding: 10, alignItems: 'center' }}>
                <MonoLabel size={9} color={theme.inkGhost}>+ ADD RUN → COACHES TAB</MonoLabel>
              </Pressable>
            </View>
          );
        })}

        {/* Players with no runs yet */}
        {playersWithoutRuns.length > 0 && (
          <View style={{ marginTop: playersWithAnyRuns.length > 0 ? 8 : 0 }}>
            {playersWithAnyRuns.length > 0 && (
              <MonoLabel color={theme.inkMuted} style={{ marginBottom: 10 }}>NO RUNS YET</MonoLabel>
            )}
            {playersWithoutRuns.map(player => (
              <Pressable key={player.id} onPress={() => router.push('/coaches' as any)}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: theme.hairline, marginBottom: 6, backgroundColor: theme.surface }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: theme.display, fontSize: 13, color: theme.inkSec }}>{player.name}</Text>
                  <MonoLabel size={8} color={theme.inkGhost}>{player.role.join(' · ')} · OVR {player.overall.toFixed(0)}</MonoLabel>
                </View>
                <MonoLabel size={9} color={theme.inkGhost}>GO TO COACHES →</MonoLabel>
              </Pressable>
            ))}
          </View>
        )}

        {squad.length > 0 && (
          <View style={{ marginTop: 16, padding: 12, borderWidth: 1, borderColor: theme.hairline, backgroundColor: theme.surface }}>
            <MonoLabel size={8} color={theme.inkGhost}>RUN PROJECTIONS IN THE COACHES TAB AND TAP "SAVE RUN TO SQUAD PLAN" TO LOG THEM HERE.</MonoLabel>
          </View>
        )}

      </ScrollView>
    </View>
  );
}
