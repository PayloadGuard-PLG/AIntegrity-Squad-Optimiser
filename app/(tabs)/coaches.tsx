import { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { useSquad } from '../../src/hooks/useSquad';
import { useManager } from '../../src/context/ManagerContext';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { Chip } from '../../src/components/atoms/Chip';
import { theme, TIER_COLORS } from '../../src/constants/theme';
import { isWhiteStat, getAllStatKeys, getWhiteStatKeys } from '../../src/utils/roleWeights';
import { estimateStatGainPct } from '../../src/logic/xpEngine';
import { computeOvrFromStats, computeOvrWithPadding } from '../../src/logic/ovrProjector';
import { applyTierBonusToStats } from '../../src/logic/xpEngine';
import gameProfileJson from '../../profiles/game_2025.json';
import { DrillLevel, TalentTier, TierName, GameProfile } from '../../src/types/resources';
import { playerService } from '../../src/services/playerService';

const profile = gameProfileJson as unknown as GameProfile;

// Academy coaches have no difficulty setting — they always run at peak (Very Hard) rate
const ACADEMY_DRILL_LEVEL: DrillLevel = 'Very Hard';
const TALENT_LABEL: Record<TalentTier, string> = {
  FT1: 'FT1', FT2: 'FT2', FT3: 'FT3', Normal: 'NORM', Slow: 'SLOW',
};
const TIER_ORDER: TierName[] = ['Rare', 'Elite', 'Stellar', 'Master', 'Epic', 'Legendary'];
const TIER_COSTS: Record<TierName, number> = { None: 0, Rare: 100, Elite: 90, Stellar: 50, Master: 25, Epic: 15, Legendary: 10 };
const TIER_ADDITIONS: Record<TierName, number> = { None: 0, Rare: 10, Elite: 30, Stellar: 50, Master: 80, Epic: 120, Legendary: 160 };

type StatGain = { stat: string; from: number; gain: number; isWhite: boolean };
type ProjectionResult = { gains: StatGain[]; ovrBefore: number; ovrAfter: number; ovrGain: number; postCoachStats: Record<string, number> };

export default function CoachesScreen() {
  const { squad } = useSquad();
  const manager = useManager();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState('30');
  const [twoxAd, setTwoxAd] = useState(false);
  const [selectedStats, setSelectedStats] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [selectedTier, setSelectedTier] = useState<TierName | null>(null);
  // Tier point inputs — pre-seeded from ManagerContext, editable per session
  const [tierPointInputs, setTierPointInputs] = useState<Partial<Record<TierName, string>>>(() =>
    Object.fromEntries(
      TIER_ORDER.map(t => [t, manager.tierPoints[t] != null ? String(manager.tierPoints[t]) : ''])
    )
  );

  const player = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  const { white, grey } = useMemo(() => {
    if (!player) return { white: [] as string[], grey: [] as string[] };
    const w = getWhiteStatKeys(player.role);
    const all = getAllStatKeys(player.role);
    const g = all.filter(s => !w.includes(s));
    return { white: w, grey: g };
  }, [player]);

  // Tiers above the player's current tier
  const upgradableTiers = useMemo(() => {
    if (!player) return TIER_ORDER;
    const currentIdx = TIER_ORDER.indexOf(player.tier as TierName);
    return TIER_ORDER.filter((_, i) => i > currentIdx);
  }, [player]);

  const selectPlayer = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedStats(new Set());
    setResult(null);
    setSelectedTier(null);
  }, []);

  const toggleStat = useCallback((stat: string) => {
    setSelectedStats(prev => {
      const next = new Set(prev);
      if (next.has(stat)) next.delete(stat);
      else next.add(stat);
      return next;
    });
    setResult(null);
    setSelectedTier(null);
  }, []);

  function runProjection() {
    if (!player || selectedStats.size === 0) return;
    const sessionCount = parseInt(sessions, 10) || 0;
    if (sessionCount === 0) return;

    const drillMult = profile.drillLevelMultipliers[ACADEMY_DRILL_LEVEL] ?? 1.7;
    const budget = sessionCount * profile.baseXpPerSession / selectedStats.size;
    const gains: StatGain[] = [];
    const postCoachStats = { ...player.stats };

    for (const stat of Array.from(selectedStats)) {
      const from = player.stats[stat];
      if (from === undefined) continue;
      const isWhite = isWhiteStat(player.role, stat);
      const gain = estimateStatGainPct(budget, from, player.age, 0, player.talent, isWhite, twoxAd, drillMult, profile);
      if (gain > 0) {
        postCoachStats[stat] = Math.min(from + gain, profile.statCap);
        gains.push({ stat, from, gain: Number(gain.toFixed(1)), isWhite });
      }
    }

    const ovrBefore = computeOvrFromStats(player, profile);
    const ovrAfter = computeOvrWithPadding(postCoachStats, player.overall, profile);
    setResult({ gains, ovrBefore, ovrAfter, ovrGain: Number((ovrAfter - ovrBefore).toFixed(1)), postCoachStats });
    setSelectedTier(null);
  }

  // OVR after adding tier upgrade on top of coach gains
  function tierOvr(tier: TierName): number | null {
    if (!player || !result) return null;
    const roleKeys = getAllStatKeys(player.role);
    const afterTierStats = applyTierBonusToStats(result.postCoachStats, roleKeys, tier, profile, player.tier);
    return computeOvrWithPadding(afterTierStats, player.overall, profile);
  }

  const combinedOvr = selectedTier ? tierOvr(selectedTier) : null;
  const combinedGain = combinedOvr != null && result
    ? Number((combinedOvr - result.ovrBefore).toFixed(1))
    : null;

  function applyGains() {
    if (!player || !result) return;
    let newStats = { ...result.postCoachStats };
    let newTier = player.tier;
    let newOvr = result.ovrAfter;
    if (selectedTier && combinedOvr != null) {
      newStats = applyTierBonusToStats(newStats, getAllStatKeys(player.role), selectedTier, profile, player.tier);
      newTier = selectedTier;
      newOvr = combinedOvr;
    }
    playerService.applyAndSnapshot(player, { stats: newStats, overall: Number(newOvr.toFixed(1)), tier: newTier });
    setResult(null);
    setSelectedStats(new Set());
    setSelectedTier(null);
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
                    onChangeText={v => { setSessions(v.replace(/[^0-9]/g, '')); setResult(null); setSelectedTier(null); }}
                    placeholder="30"
                    placeholderTextColor={theme.inkGhost}
                    style={{ fontFamily: theme.mono, fontSize: 22, fontWeight: '700', color: theme.ink, padding: 10, textAlign: 'center' }}
                  />
                </View>
              </View>

              {/* Intensity — fixed for academy coaches */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <MonoLabel style={{ flex: 1 }}>INTENSITY</MonoLabel>
                <View style={{ paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: theme.ink, backgroundColor: theme.ink }}>
                  <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: theme.bg }}>VERY HARD</Text>
                </View>
                <MonoLabel size={8} color={theme.inkGhost}>ACADEMY FIXED</MonoLabel>
              </View>

              {/* Talent — read from player card */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <MonoLabel style={{ flex: 1 }}>TALENT</MonoLabel>
                <View style={{ paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: theme.steelLight }}>
                  <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: theme.steelLight }}>
                    {TALENT_LABEL[player.talent] ?? player.talent}
                  </Text>
                </View>
                <MonoLabel size={8} color={theme.inkGhost}>FROM CARD</MonoLabel>
              </View>

              {/* 2× ad */}
              <Pressable onPress={() => { setTwoxAd(v => !v); setResult(null); setSelectedTier(null); }}
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
              <>
                <View style={{ borderWidth: 1, borderColor: result.ovrGain > 0 ? theme.pos + '55' : theme.hairline2, padding: 14, marginBottom: 14 }}>
                  <MonoLabel color={theme.steelLight} style={{ marginBottom: 12 }}>PROJECTION — ×{parseInt(sessions, 10) || 0} SESSIONS</MonoLabel>

                  {/* OVR summary */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
                    <View>
                      <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 2 }}>BEFORE</MonoLabel>
                      <Text style={{ fontFamily: theme.display, fontSize: 32, fontWeight: '700', color: theme.ink }}>{result.ovrBefore.toFixed(0)}</Text>
                    </View>
                    <Text style={{ fontFamily: theme.mono, fontSize: 18, color: theme.inkGhost }}>→</Text>
                    <View>
                      <MonoLabel size={8} color={theme.pos} style={{ marginBottom: 2 }}>AFTER COACH</MonoLabel>
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

                  {/* Combined drill + tier banner — shown when tier selected */}
                  {combinedOvr != null && combinedGain != null && selectedTier && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
                      <View style={{ flex: 1 }}>
                        <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 3 }}>COACH + {selectedTier.toUpperCase()} TIER</MonoLabel>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                          <Text style={{ fontFamily: theme.display, fontSize: 26, fontWeight: '700', color: TIER_COLORS[selectedTier] ?? theme.ink }}>{combinedOvr.toFixed(1)}</Text>
                          <Text style={{ fontFamily: theme.mono, fontSize: 13, color: TIER_COLORS[selectedTier] ?? theme.pos, fontWeight: '700' }}>
                            +{combinedGain}
                          </Text>
                        </View>
                      </View>
                      <View style={{ width: 3, height: 42, backgroundColor: TIER_COLORS[selectedTier] ?? theme.steelLight }} />
                    </View>
                  )}

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

                {/* Tier upgrade section */}
                <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
                  {/* Header */}
                  <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 3, height: 12, backgroundColor: theme.hot, marginRight: 8 }} />
                    <MonoLabel size={10} color={theme.steelLight} style={{ flex: 1 }}>TIER UPGRADE</MonoLabel>
                    {/* Current tier badge */}
                    {player.tier && player.tier !== 'None' && (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: TIER_COLORS[player.tier] ?? theme.hairline2 }}>
                        <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 1, color: TIER_COLORS[player.tier] ?? theme.inkSec }}>
                          CURRENT: {player.tier.toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {(!player.tier || player.tier === 'None') && (
                      <MonoLabel size={9} color={theme.inkGhost}>NO TIER</MonoLabel>
                    )}
                  </View>

                  {upgradableTiers.length === 0 ? (
                    <View style={{ padding: 16, alignItems: 'center' }}>
                      <MonoLabel color={theme.inkGhost}>ALREADY AT LEGENDARY</MonoLabel>
                    </View>
                  ) : (
                    upgradableTiers.map((t, idx) => {
                      const cost = TIER_COSTS[t];
                      const have = parseInt(tierPointInputs[t] ?? '0', 10) || 0;
                      const canAfford = have >= cost;
                      const sel = selectedTier === t;
                      const c = TIER_COLORS[t] ?? theme.inkSec;
                      const ovrResult = sel ? combinedOvr : null;

                      return (
                        <Pressable key={t}
                          onPress={() => setSelectedTier(sel ? null : t)}
                          style={{
                            borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: theme.hairline2,
                            borderLeftWidth: sel ? 3 : 0, borderLeftColor: c,
                            backgroundColor: sel ? theme.surface2 : 'transparent',
                          }}>
                          <View style={{ padding: 12, paddingHorizontal: 14 }}>
                            {/* Row 1: tier name + additions + tick */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                              <Text style={{ fontFamily: theme.display, fontSize: 14, fontWeight: '700', color: c, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 90 }}>
                                {t}
                              </Text>
                              <MonoLabel size={9} color={theme.inkSec} style={{ flex: 1 }}>
                                +{TIER_ADDITIONS[t]} / WHITE STAT · NEED {cost} PTS
                              </MonoLabel>
                              <Text style={{ fontFamily: theme.mono, fontSize: 20, fontWeight: '700', color: canAfford ? theme.pos : theme.inkGhost }}>
                                {canAfford ? '✓' : '·'}
                              </Text>
                            </View>

                            {/* Row 2: HAVE input + shortfall / combined OVR */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <MonoLabel size={9} color={theme.inkSec}>HAVE</MonoLabel>
                              <TextInput
                                keyboardType="numeric"
                                value={tierPointInputs[t] ?? ''}
                                onChangeText={v => {
                                  const clean = v.replace(/[^0-9]/g, '');
                                  setTierPointInputs(prev => ({ ...prev, [t]: clean }));
                                  manager.setTierPoints({ ...manager.tierPoints, [t]: parseInt(clean, 10) || 0 });
                                  if (sel) setSelectedTier(null);
                                }}
                                placeholder="0"
                                placeholderTextColor={theme.inkGhost}
                                style={{
                                  backgroundColor: theme.surface3 ?? theme.surface2,
                                  color: canAfford ? theme.pos : theme.ink,
                                  fontFamily: theme.mono, fontSize: 13, fontWeight: '700',
                                  padding: 5, paddingHorizontal: 10,
                                  minWidth: 64, borderWidth: 1,
                                  borderColor: canAfford ? theme.pos + '66' : theme.hairline2,
                                  textAlign: 'center',
                                }}
                              />
                              {!canAfford && have > 0 && (
                                <MonoLabel size={9} color={theme.neg}>{cost - have} SHORT</MonoLabel>
                              )}
                              {canAfford && !sel && (
                                <MonoLabel size={9} color={theme.inkGhost}>TAP TO ADD TO PROJECTION</MonoLabel>
                              )}
                              {sel && ovrResult != null && (
                                <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                  <Text style={{ fontFamily: theme.display, fontSize: 18, fontWeight: '700', color: c }}>{ovrResult.toFixed(1)}</Text>
                                  <MonoLabel size={9} color={c}>OVR</MonoLabel>
                                </View>
                              )}
                            </View>
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </View>

                {/* Apply gains to player card */}
                {result.gains.length > 0 && (
                  <Pressable onPress={applyGains}
                    style={{ borderWidth: 1, borderColor: theme.pos, padding: 14, alignItems: 'center', marginBottom: 14, backgroundColor: theme.pos + '18' }}>
                    <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, color: theme.pos, fontWeight: '700' }}>
                      ✓ APPLY TO PLAYER CARD
                    </Text>
                    <MonoLabel size={8} color={theme.pos} style={{ marginTop: 4 }}>
                      {selectedTier ? `UPDATES STATS + TIER → ${selectedTier.toUpperCase()}` : 'UPDATES BASE STATS + OVR'}
                    </MonoLabel>
                  </Pressable>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
