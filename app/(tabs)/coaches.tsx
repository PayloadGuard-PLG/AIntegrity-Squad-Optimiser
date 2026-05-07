import { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { useSquad } from '../../src/hooks/useSquad';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { Chip } from '../../src/components/atoms/Chip';
import { theme } from '../../src/constants/theme';
import { isWhiteStat, getAllStatKeys, getWhiteStatKeys } from '../../src/utils/roleWeights';
import { estimateStatGainPct } from '../../src/logic/xpEngine';
import { computeOvrFromStats, computeOvrWithPadding } from '../../src/logic/ovrProjector';
import gameProfileJson from '../../profiles/game_2025.json';
import { DrillLevel, TalentTier, GameProfile } from '../../src/types/resources';

const profile = gameProfileJson as unknown as GameProfile;

const DRILL_LEVELS: DrillLevel[] = ['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'];
const TALENT_TIERS: TalentTier[] = ['FT1', 'FT2', 'FT3', 'Normal', 'Slow'];
const TALENT_LABEL: Record<TalentTier, string> = {
  FT1: 'FT1', FT2: 'FT2', FT3: 'FT3', Normal: 'NORM', Slow: 'SLOW',
};

type StatGain = { stat: string; from: number; gain: number; isWhite: boolean };
type ProjectionResult = { gains: StatGain[]; ovrBefore: number; ovrAfter: number; ovrGain: number };

export default function CoachesScreen() {
  const { squad } = useSquad();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState('30');
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('Medium');
  const [talent, setTalent] = useState<TalentTier>('Normal');
  const [twoxAd, setTwoxAd] = useState(false);
  const [selectedStats, setSelectedStats] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ProjectionResult | null>(null);

  const player = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  const { white, grey } = useMemo(() => {
    if (!player) return { white: [] as string[], grey: [] as string[] };
    const w = getWhiteStatKeys(player.role);
    const all = getAllStatKeys(player.role);
    const g = all.filter(s => !w.includes(s));
    return { white: w, grey: g };
  }, [player]);

  const selectPlayer = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedStats(new Set());
    setResult(null);
  }, []);

  const toggleStat = useCallback((stat: string) => {
    setSelectedStats(prev => {
      const next = new Set(prev);
      if (next.has(stat)) next.delete(stat);
      else next.add(stat);
      return next;
    });
    setResult(null);
  }, []);

  function runProjection() {
    if (!player || selectedStats.size === 0) return;
    const sessionCount = parseInt(sessions, 10) || 0;
    if (sessionCount === 0) return;

    const drillMult = profile.drillLevelMultipliers[drillLevel] ?? 1.0;
    const budget = sessionCount * profile.baseXpPerSession / selectedStats.size;
    const gains: StatGain[] = [];
    const updatedStats = { ...player.stats };

    for (const stat of Array.from(selectedStats)) {
      const from = player.stats[stat];
      if (from === undefined) continue;
      const isWhite = isWhiteStat(player.role, stat);
      const gain = estimateStatGainPct(budget, from, player.age, 0, talent, isWhite, twoxAd, drillMult, profile);
      if (gain > 0) {
        updatedStats[stat] = Math.min(from + gain, profile.statCap);
        gains.push({ stat, from, gain: Number(gain.toFixed(1)), isWhite });
      }
    }

    const ovrBefore = computeOvrFromStats(player, profile);
    const ovrAfter = computeOvrWithPadding(updatedStats, player.overall, profile);
    setResult({ gains, ovrBefore, ovrAfter, ovrGain: Number((ovrAfter - ovrBefore).toFixed(1)) });
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 14, paddingHorizontal: 16, paddingBottom: 40 }}>

        {/* Player picker */}
        {squad.length > 1 && (
          <>
            <MonoLabel color={theme.steelLight} style={{ marginBottom: 8 }}>SUBJECT</MonoLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row', gap: 5, paddingBottom: 14 }}>
              {squad.map(p => (
                <Chip key={p.id} active={p.id === player?.id} onPress={() => selectPlayer(p.id)}>
                  {p.name}
                </Chip>
              ))}
            </ScrollView>
          </>
        )}

        {!player ? (
          <View style={{ padding: 24, borderWidth: 1, borderColor: theme.hairline, alignItems: 'center' }}>
            <MonoLabel color={theme.inkGhost}>ADD A PLAYER TO BEGIN</MonoLabel>
          </View>
        ) : (
          <>
            {/* Coach config block */}
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 14, marginBottom: 14 }}>
              <MonoLabel color={theme.steelLight} style={{ marginBottom: 12 }}>COACH CONFIG</MonoLabel>

              {/* Sessions */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <MonoLabel style={{ width: 80 }}>SESSIONS ×</MonoLabel>
                <View style={{ flex: 1, borderWidth: 1, borderColor: theme.hairline2 }}>
                  <TextInput
                    keyboardType="numeric"
                    value={sessions}
                    onChangeText={v => { setSessions(v.replace(/[^0-9]/g, '')); setResult(null); }}
                    placeholder="30"
                    placeholderTextColor={theme.inkGhost}
                    style={{ fontFamily: theme.mono, fontSize: 22, fontWeight: '700', color: theme.ink, padding: 10, textAlign: 'center' }}
                  />
                </View>
              </View>

              {/* Intensity */}
              <MonoLabel color={theme.steelLight} style={{ marginBottom: 6 }}>INTENSITY</MonoLabel>
              <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
                {DRILL_LEVELS.map(l => {
                  const sel = drillLevel === l;
                  return (
                    <Pressable key={l} onPress={() => { setDrillLevel(l); setResult(null); }}
                      style={{ paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: sel ? theme.ink : theme.hairline2, backgroundColor: sel ? theme.ink : 'transparent' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: sel ? theme.bg : theme.inkSec }}>
                        {l.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Talent */}
              <MonoLabel color={theme.steelLight} style={{ marginBottom: 6 }}>TALENT</MonoLabel>
              <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
                {TALENT_TIERS.map(t => (
                  <Chip key={t} active={talent === t} onPress={() => { setTalent(t); setResult(null); }}>
                    {TALENT_LABEL[t]}
                  </Chip>
                ))}
              </View>

              {/* 2× ad */}
              <Pressable onPress={() => { setTwoxAd(v => !v); setResult(null); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: twoxAd ? theme.hot : theme.hairline2, padding: 10, backgroundColor: twoxAd ? theme.surface2 : 'transparent' }}>
                <View style={{ width: 14, height: 14, backgroundColor: twoxAd ? theme.hot : 'transparent', borderWidth: 1, borderColor: twoxAd ? theme.hot : theme.hairline3 }} />
                <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1.2, color: twoxAd ? theme.hot : theme.inkSec }}>
                  2× AD ACTIVE
                </Text>
                {twoxAd && <Text style={{ fontFamily: theme.mono, fontSize: 10, color: theme.hot, marginLeft: 'auto' }}>×2.0</Text>}
              </Pressable>
            </View>

            {/* Stat coverage */}
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 14, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <MonoLabel color={theme.steelLight} style={{ flex: 1 }}>STAT COVERAGE</MonoLabel>
                {selectedStats.size > 0 && (
                  <MonoLabel color={theme.hot}>{selectedStats.size} STAT{selectedStats.size !== 1 ? 'S' : ''}</MonoLabel>
                )}
              </View>

              {/* White stats */}
              <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 6 }}>WHITE — ESSENTIAL</MonoLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
                {white.map(stat => {
                  const hasValue = stat in player.stats;
                  const sel = selectedStats.has(stat);
                  return (
                    <Pressable key={stat} onPress={() => toggleStat(stat)}
                      style={{
                        paddingHorizontal: 9, paddingVertical: 7,
                        borderWidth: 1,
                        borderColor: sel ? theme.steelLight : (hasValue ? theme.hairline2 : theme.hairline),
                        backgroundColor: sel ? theme.steelLight + '1a' : 'transparent',
                        opacity: hasValue ? 1 : 0.4,
                        minWidth: 80, alignItems: 'center',
                      }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.8, color: sel ? theme.steelLight : (hasValue ? theme.inkSec : theme.inkGhost) }}>
                        {stat}
                      </Text>
                      <Text style={{ fontFamily: theme.mono, fontSize: 11, fontWeight: '700', color: sel ? theme.steelLight : (hasValue ? theme.ink : theme.inkGhost), marginTop: 2 }}>
                        {hasValue ? Math.round(player.stats[stat]) : '—'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Grey stats */}
              {grey.length > 0 && (
                <>
                  <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 6 }}>GREY — SECONDARY (×0.5 XP)</MonoLabel>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                    {grey.map(stat => {
                      const hasValue = stat in player.stats;
                      const sel = selectedStats.has(stat);
                      return (
                        <Pressable key={stat} onPress={() => toggleStat(stat)}
                          style={{
                            paddingHorizontal: 9, paddingVertical: 7,
                            borderWidth: 1,
                            borderColor: sel ? theme.inkMuted : theme.hairline,
                            backgroundColor: sel ? theme.inkMuted + '18' : 'transparent',
                            opacity: hasValue ? 0.75 : 0.35,
                            minWidth: 80, alignItems: 'center',
                          }}>
                          <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.8, color: sel ? theme.inkSec : (hasValue ? theme.inkMuted : theme.inkGhost) }}>
                            {stat}
                          </Text>
                          <Text style={{ fontFamily: theme.mono, fontSize: 11, fontWeight: '700', color: sel ? theme.inkSec : (hasValue ? theme.inkMuted : theme.inkGhost), marginTop: 2 }}>
                            {hasValue ? Math.round(player.stats[stat]) : '—'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </View>

            {/* Project button */}
            <Pressable onPress={runProjection}
              style={{ borderWidth: 1, borderColor: selectedStats.size > 0 ? theme.ink : theme.hairline2, padding: 16, alignItems: 'center', marginBottom: 14, backgroundColor: selectedStats.size > 0 ? theme.surface2 : 'transparent' }}>
              <Text style={{ fontFamily: theme.mono, fontSize: 12, letterSpacing: 2, color: selectedStats.size > 0 ? theme.ink : theme.inkGhost }}>
                ▶ PROJECT COACH GAIN
              </Text>
            </Pressable>

            {/* Result */}
            {result && (
              <View style={{ borderWidth: 1, borderColor: result.ovrGain > 0 ? theme.pos + '55' : theme.hairline2, padding: 14 }}>
                <MonoLabel color={theme.steelLight} style={{ marginBottom: 12 }}>PROJECTION — ×{parseInt(sessions, 10) || 0} SESSIONS</MonoLabel>

                {/* OVR summary */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
                  <View>
                    <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 2 }}>BEFORE</MonoLabel>
                    <Text style={{ fontFamily: theme.display, fontSize: 32, fontWeight: '700', color: theme.ink }}>{result.ovrBefore.toFixed(0)}</Text>
                  </View>
                  <Text style={{ fontFamily: theme.mono, fontSize: 18, color: theme.inkGhost }}>→</Text>
                  <View>
                    <MonoLabel size={8} color={theme.pos} style={{ marginBottom: 2 }}>AFTER</MonoLabel>
                    <Text style={{ fontFamily: theme.display, fontSize: 32, fontWeight: '700', color: theme.pos }}>{result.ovrAfter.toFixed(1)}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <View style={{ borderWidth: 1, borderColor: result.ovrGain > 0 ? theme.pos + '66' : theme.hairline2, padding: 10, alignItems: 'center', minWidth: 64 }}>
                    <Text style={{ fontFamily: theme.mono, fontSize: 18, fontWeight: '700', color: result.ovrGain > 0 ? theme.pos : theme.inkMuted }}>
                      {result.ovrGain > 0 ? '+' : ''}{result.ovrGain}
                    </Text>
                    <MonoLabel size={8} color={result.ovrGain > 0 ? theme.pos : theme.inkMuted}>OVR</MonoLabel>
                  </View>
                </View>

                {/* Per-stat breakdown */}
                {result.gains.length > 0 ? result.gains.map(g => (
                  <View key={g.stat} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: g.isWhite ? theme.steelLight : theme.inkGhost, marginRight: 10 }} />
                    <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.8, color: g.isWhite ? theme.inkSec : theme.inkMuted, flex: 1 }}>
                      {g.stat}
                    </Text>
                    <Text style={{ fontFamily: theme.mono, fontSize: 11, color: theme.inkGhost, marginRight: 10 }}>
                      {Math.round(g.from)}
                    </Text>
                    <Text style={{ fontFamily: theme.mono, fontSize: 11, color: theme.inkMuted, marginRight: 6 }}>→</Text>
                    <Text style={{ fontFamily: theme.mono, fontSize: 11, color: theme.pos, fontWeight: '700', minWidth: 48, textAlign: 'right' }}>
                      +{g.gain}
                    </Text>
                  </View>
                )) : (
                  <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <MonoLabel color={theme.inkGhost}>NO GAINS — ENTER STAT VALUES ON PLAYER PROFILE</MonoLabel>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
