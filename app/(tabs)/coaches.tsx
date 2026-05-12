import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { scanCoachPreview } from '../../src/logic/coachScanner';
import { useSquad } from '../../src/hooks/useSquad';
import { useManager } from '../../src/context/ManagerContext';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { Chip } from '../../src/components/atoms/Chip';
import { theme, TIER_COLORS } from '../../src/constants/theme';
import { isWhiteStat, getAllStatKeys, getWhiteStatKeys } from '../../src/utils/roleWeights';
import { StatGrid3Col } from '../../src/components/StatGrid3Col';
import { estimateStatGainPct } from '../../src/logic/xpEngine';
import { computeOvrFromStats, computeOvrWithPadding } from '../../src/logic/ovrProjector';
import { applyTierBonusToStats } from '../../src/logic/xpEngine';
import gameProfileJson from '../../profiles/game_2025.json';
import { DrillLevel, TalentTier, TierName, GameProfile } from '../../src/types/resources';
import { playerService } from '../../src/services/playerService';
import { squadPlanService } from '../../src/services/squadPlanService';

const profile = gameProfileJson as unknown as GameProfile;

const ACADEMY_DRILL_LEVEL: DrillLevel = 'Very Hard';
const TALENT_LABEL: Record<TalentTier, string> = {
  Fastest: '×1.5', Fast: '×1.25', Average: '×1.1', Normal: '×1.0', Slow: '×0.7',
};
const TIER_ORDER: TierName[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
const TIER_COSTS: Record<TierName, number> = { T0: 0, T1: 100, T2: 90, T3: 50, T4: 25, T5: 15, T6: 10 };
const TIER_ADDITIONS: Record<TierName, number> = { T0: 0, T1: 10, T2: 30, T3: 50, T4: 80, T5: 120, T6: 160 };
// Step increment per tier (gain when buying this specific tier step)
const TIER_INCREMENTS: Record<TierName, number> = { T0: 0, T1: 10, T2: 20, T3: 20, T4: 30, T5: 40, T6: 40 };

type StatGain = { stat: string; from: number; gain: number; isWhite: boolean };
type ProjectionResult = { gains: StatGain[]; ovrBefore: number; ovrAfter: number; ovrGain: number; postCoachStats: Record<string, number> };



export default function CoachesScreen() {
  const { squad } = useSquad();
  const manager = useManager();
  const selectedId = manager.selectedPlayerId;
  const [sessions, setSessions] = useState('');
  const [selectedStats, setSelectedStats] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [selectedTier, setSelectedTier] = useState<TierName | null>(null);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [tierPointInputs, setTierPointInputs] = useState<Partial<Record<TierName, string>>>(() =>
    Object.fromEntries(
      TIER_ORDER.map(t => [t, manager.tierPoints[t] != null ? String(manager.tierPoints[t]) : ''])
    )
  );

  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  const { playerId: incomingPlayerId, sessions: incomingSessions } = useLocalSearchParams<{ playerId?: string; sessions?: string }>();

  useEffect(() => {
    if (incomingPlayerId) selectPlayer(incomingPlayerId);
    if (incomingSessions) setSessions(incomingSessions);
  }, [incomingPlayerId, incomingSessions]);

  // Auto-seed white stats when player resolves (covers single-player auto-select case)
  const seededPlayerIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!player) return;
    if (player.id === seededPlayerIdRef.current) return;
    seededPlayerIdRef.current = player.id;
    setSelectedStats(new Set(getWhiteStatKeys(player.role)));
    setResult(null);
    setSelectedTier(null);
    setSaveConfirmed(false);
  }, [player?.id]);

  async function scanCoach() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo library access in settings.'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (picked.canceled || !picked.assets[0]) return;
    setIsScanning(true);
    setScanStatus('');
    try {
      const scan = await scanCoachPreview(picked.assets[0].uri);
      const parts: string[] = [];
      if (scan.multiplier) { setSessions(String(scan.multiplier)); parts.push(`×${scan.multiplier}`); }
      if (scan.stats.length > 0) {
        parts.push(`${scan.stats.length} stats`);
        setSelectedStats(new Set(scan.stats.map(s => s.statName)));
      }
      setScanStatus(parts.length > 0 ? `SCANNED: ${parts.join(' · ')}` : 'NOTHING DETECTED');
    } catch {
      setScanStatus('SCAN FAILED');
    } finally {
      setIsScanning(false);
    }
  }

  const player = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  const { white, grey } = useMemo(() => {
    if (!player) return { white: [] as string[], grey: [] as string[] };
    const w = getWhiteStatKeys(player.role);
    const all = getAllStatKeys(player.role);
    const g = all.filter(s => !w.includes(s));
    return { white: w, grey: g };
  }, [player]);

  const upgradableTiers = useMemo(() => {
    if (!player) return TIER_ORDER;
    const currentIdx = TIER_ORDER.indexOf(player.tier as TierName);
    return TIER_ORDER.filter((_, i) => i > currentIdx);
  }, [player]);

  const selectPlayer = useCallback((id: string) => {
    manager.setSelectedPlayerId(id);
    const p = squad.find(s => s.id === id);
    setSelectedStats(p ? new Set(getWhiteStatKeys(p.role)) : new Set());
    setResult(null);
    setSelectedTier(null);
    setSaveConfirmed(false);
  }, [squad, manager]);

  const toggleStat = useCallback((stat: string) => {
    setSelectedStats(prev => {
      const next = new Set(prev);
      if (next.has(stat)) next.delete(stat);
      else next.add(stat);
      return next;
    });
    setResult(null);
    setSelectedTier(null);
    setSaveConfirmed(false);
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
      const gain = estimateStatGainPct(budget, from, player.age, 0, player.talent, isWhite, false, drillMult, profile);
      if (gain > 0) {
        postCoachStats[stat] = Math.min(from + gain, profile.statCap);
        gains.push({ stat, from, gain: Number(gain.toFixed(1)), isWhite });
      }
    }

    const ovrBefore = computeOvrFromStats(player, profile);
    const ovrAfter = computeOvrWithPadding(postCoachStats, player.overall, profile);
    setResult({ gains, ovrBefore, ovrAfter, ovrGain: Number((ovrAfter - ovrBefore).toFixed(1)), postCoachStats });
    setSelectedTier(null);
    setSaveConfirmed(false);
  }

  function tierOvr(tier: TierName): number | null {
    if (!player || !result) return null;
    const afterTierStats = applyTierBonusToStats(result.postCoachStats, getWhiteStatKeys(player.role), tier, profile, player.tier);
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
      newStats = applyTierBonusToStats(newStats, getWhiteStatKeys(player.role), selectedTier, profile, player.tier);
      newTier = selectedTier;
      newOvr = combinedOvr;
    }
    playerService.applyAndSnapshot(player, { stats: newStats, overall: Number(newOvr.toFixed(1)), tier: newTier });
    setResult(null);
    setSelectedStats(new Set());
    setSelectedTier(null);
    setSaveConfirmed(false);
  }

  function saveRun() {
    if (!player || !result) return;
    squadPlanService.saveRun(player.id, {
      sessions: parseInt(sessions, 10) || 0,
      selectedStats: Array.from(selectedStats),
      ovrBefore: result.ovrBefore,
      ovrAfter: result.ovrAfter,
      gains: result.gains,
      tier: selectedTier,
    });
    setSaveConfirmed(true);
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
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <MonoLabel color={theme.steelLight} style={{ flex: 1 }}>COACH CONFIG</MonoLabel>
              </View>

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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MonoLabel style={{ flex: 1 }}>TALENT</MonoLabel>
                <View style={{ paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: theme.steelLight }}>
                  <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: theme.steelLight }}>
                    {TALENT_LABEL[player.talent] ?? player.talent}
                  </Text>
                </View>
                <MonoLabel size={8} color={theme.inkGhost}>FROM CARD</MonoLabel>
              </View>
            </View>

            {/* Stat coverage */}
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 14, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <MonoLabel color={theme.steelLight} style={{ flex: 1 }}>STAT COVERAGE</MonoLabel>
                {selectedStats.size > 0 && (
                  <MonoLabel color={theme.hot}>{selectedStats.size} STAT{selectedStats.size !== 1 ? 'S' : ''}</MonoLabel>
                )}
              </View>

              <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 8 }}>HIGHLIGHTED = ESSENTIAL · DIM = SECONDARY</MonoLabel>
              <StatGrid3Col
                statKeys={[...white, ...grey]}
                roles={player.role}
                values={player.stats}
                selected={selectedStats}
                onToggle={toggleStat}
              />
            </View>

            {/* Project + Scan buttons */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <Pressable onPress={runProjection}
                style={{ flex: 1, borderWidth: 1, borderColor: selectedStats.size > 0 ? theme.steelLight : theme.hairline2, padding: 16, alignItems: 'center', backgroundColor: selectedStats.size > 0 ? theme.steelLight : 'transparent' }}>
                <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, color: selectedStats.size > 0 ? theme.bg : theme.inkGhost }}>
                  ▶ PROJECT
                </Text>
              </Pressable>
              <Pressable onPress={scanCoach} disabled={isScanning}
                style={{ borderWidth: 1, borderColor: theme.steelLight + '88', padding: 16, alignItems: 'center', minWidth: 80, backgroundColor: theme.surface2 }}>
                {isScanning
                  ? <ActivityIndicator size="small" color={theme.steelLight} />
                  : <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1, color: theme.steelLight }}>⊕ SCAN</Text>
                }
              </Pressable>
            </View>
            {scanStatus !== '' && (
              <MonoLabel size={9} color={scanStatus.startsWith('SCANNED') ? theme.pos : theme.neg} style={{ marginBottom: 10 }}>
                {scanStatus}
              </MonoLabel>
            )}

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

                  {/* Combined coach + tier banner */}
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

                  {/* Per-stat breakdown — 3-col grid */}
                  {result.gains.length > 0 ? (
                    <StatGrid3Col
                      statKeys={result.gains.map(g => g.stat)}
                      roles={player.role}
                      values={Object.fromEntries(result.gains.map(g => [g.stat, g.from]))}
                      gains={Object.fromEntries(result.gains.map(g => [g.stat, g.gain]))}
                    />
                  ) : (
                    <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                      <MonoLabel color={theme.inkGhost}>NO GAINS — ENTER STAT VALUES ON PLAYER PROFILE</MonoLabel>
                    </View>
                  )}
                </View>

                {/* Tier upgrade section */}
                <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
                  <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 3, height: 12, backgroundColor: theme.hot, marginRight: 8 }} />
                    <MonoLabel size={10} color={theme.steelLight} style={{ flex: 1 }}>TIER UPGRADE</MonoLabel>
                    {player.tier && player.tier !== 'T0' && (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: TIER_COLORS[player.tier] ?? theme.hairline2 }}>
                        <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 1, color: TIER_COLORS[player.tier] ?? theme.inkSec }}>
                          CURRENT: {player.tier.toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {(!player.tier || player.tier === 'T0') && (
                      <MonoLabel size={9} color={theme.inkGhost}>NO TIER</MonoLabel>
                    )}
                  </View>

                  {upgradableTiers.length === 0 ? (
                    <View style={{ padding: 16, alignItems: 'center' }}>
                      <MonoLabel color={theme.inkGhost}>ALREADY AT T6</MonoLabel>
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
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                              <Text style={{ fontFamily: theme.display, fontSize: 14, fontWeight: '700', color: c, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 90 }}>
                                {t}
                              </Text>
                              <MonoLabel size={9} color={theme.inkSec} style={{ flex: 1 }}>
                                +{TIER_INCREMENTS[t]} / WHITE STAT · NEED {cost} PTS
                              </MonoLabel>
                              <Text style={{ fontFamily: theme.mono, fontSize: 20, fontWeight: '700', color: canAfford ? theme.pos : theme.inkGhost }}>
                                {canAfford ? '✓' : '·'}
                              </Text>
                            </View>
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

                {/* Save run + apply */}
                {result.gains.length > 0 && (
                  <View style={{ gap: 8, marginBottom: 14 }}>
                    <Pressable onPress={saveRun}
                      style={{ borderWidth: 1, borderColor: saveConfirmed ? theme.pos : theme.steelLight, padding: 14, alignItems: 'center', backgroundColor: saveConfirmed ? theme.pos + '18' : 'transparent' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, color: saveConfirmed ? theme.pos : theme.steelLight, fontWeight: '700' }}>
                        {saveConfirmed ? '✓ RUN SAVED TO SQUAD PLAN' : '⊞ SAVE RUN TO SQUAD PLAN'}
                      </Text>
                    </Pressable>
                    <Pressable onPress={applyGains}
                      style={{ borderWidth: 1, borderColor: theme.pos, padding: 14, alignItems: 'center', backgroundColor: theme.pos + '18' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, color: theme.pos, fontWeight: '700' }}>
                        ✓ APPLY TO PLAYER CARD
                      </Text>
                      <MonoLabel size={8} color={theme.pos} style={{ marginTop: 4 }}>
                        {selectedTier ? `UPDATES STATS + TIER → ${selectedTier.toUpperCase()}` : 'UPDATES BASE STATS + OVR'}
                      </MonoLabel>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
