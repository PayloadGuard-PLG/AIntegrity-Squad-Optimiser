import { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { scanCoachPreview } from '../../src/logic/coachScanner';
import { resolveCoachStats } from '../../src/logic/coachPipeline';
import { useSquad } from '../../src/hooks/useSquad';
import { useManager } from '../../src/context/ManagerContext';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { Chip } from '../../src/components/atoms/Chip';
import { QualityMeter } from '../../src/components/atoms/QualityMeter';
import { theme, TIER_COLORS } from '../../src/constants/theme';
import { isWhiteStat, getWhiteStatKeys, getAllStatKeys, OUTFIELD_STATS, GK_STATS_ALL, STAT_COLUMNS } from '../../src/utils/roleWeights';
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
const TIER_COSTS: Record<TierName, number> = profile.tierPointsRequired as Record<TierName, number>;
const TIER_ADDITIONS: Record<TierName, number> = profile.tierAttrAdditions as Record<TierName, number>;
const TIER_INCREMENTS: Record<TierName, number> = profile.tierIncrements as Record<TierName, number>;

const STAT_COLS = {
  DEF: new Set(['TACKLING','MARKING','POSITIONING','HEADING','BRAVERY','REFLEXES','AGILITY','ANTICIPATION','RUSHING OUT','COMMUNICATION']),
  ATT: new Set(['PASSING','DRIBBLING','CROSSING','SHOOTING','FINISHING','THROWING','KICKING','PUNCHING','AERIAL REACH','CONCENTRATION']),
  PHY: new Set(['FITNESS','STRENGTH','AGGRESSION','SPEED','CREATIVITY']),
};
const COL_COLORS = { DEF: '#4A7FC1', ATT: '#7C3AED', PHY: '#C05621' } as const;
function statColor(stat: string): string {
  if (STAT_COLS.DEF.has(stat)) return COL_COLORS.DEF;
  if (STAT_COLS.ATT.has(stat)) return COL_COLORS.ATT;
  return COL_COLORS.PHY;
}

type StatGain = { stat: string; from: number; gain: number; isWhite: boolean };
type ProjectionResult = { gains: StatGain[]; ovrBefore: number; ovrAfter: number; ovrGain: number; postCoachStats: Record<string, number> };

export default function CoachesScreen() {
  const { squad } = useSquad();
  const manager = useManager();
  const selectedId = manager.selectedPlayerId;

  const [sessions, setSessions] = useState('');
  const [scannedStats, setScannedStats] = useState<string[]>([]);
  const [coachType, setCoachType] = useState('');
  const [coachCategory, setCoachCategory] = useState('');
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
    if (incomingPlayerId) manager.setSelectedPlayerId(incomingPlayerId);
  }, []);

  const player = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  const { white, grey, allStats } = useMemo(() => {
    if (!player) return { white: [] as string[], grey: [] as string[], allStats: OUTFIELD_STATS as readonly string[] };
    const isGK = player.role.some(r => r.includes('GK'));
    const allStats = isGK ? GK_STATS_ALL : OUTFIELD_STATS;
    const w = getWhiteStatKeys(player.role);
    const g = allStats.filter(s => !w.includes(s));
    return { white: w, grey: g, allStats };
  }, [player]);

  const upgradableTiers = useMemo(() => {
    if (!player) return TIER_ORDER;
    const currentIdx = TIER_ORDER.indexOf(player.tier as TierName);
    return TIER_ORDER.filter((_, i) => i > currentIdx);
  }, [player]);

  const selectPlayer = useCallback((id: string) => {
    manager.setSelectedPlayerId(id);
    setSessions('');
    setScannedStats([]);
    setCoachType('');
    setCoachCategory('');
    setResult(null);
    setSelectedTier(null);
    setSaveConfirmed(false);
    setScanStatus('');
  }, [manager]);

  async function scanCoach() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo library access in settings.'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (picked.canceled || !picked.assets[0]) return;
    setIsScanning(true);
    setScanStatus('');
    try {
      const scan = await scanCoachPreview(picked.assets[0].uri);
      const recognised = !!(scan.coachType || scan.coachCategory || scan.multiplier);

      if (!recognised && scan.stats.length === 0) {
        setScanStatus('SCAN REJECTED — UPLOAD A SCREEN RESOLUTION COACH PREVIEW');
        setScannedStats([]); setCoachType(''); setCoachCategory('');
        return;
      }

      if (scan.multiplier) setSessions(String(scan.multiplier));
      setCoachType(scan.coachType ?? '');
      setCoachCategory(scan.coachCategory ?? '');
      setResult(null); setSelectedTier(null); setSaveConfirmed(false);

      if (__DEV__ && scan._debugBlocks) console.log('[COACH SCAN] BLOCKS:', scan._debugBlocks);
      if (__DEV__) console.log('[COACH SCAN] stats raw:', scan.stats.map(s => `${s.statName} lo=${s.gainLo} hi=${s.gainHi}`).join(', '));

      const statNames = resolveCoachStats(scan, player!.stats, player!.role);
      setScannedStats(statNames);

      const parts: string[] = [];
      if (scan.multiplier) parts.push(`×${scan.multiplier}`);
      parts.push(`${statNames.length} STATS`);
      if (scan.coachType) parts.push(scan.coachType.toUpperCase());
      if (scan.coachCategory) parts.push(scan.coachCategory.toUpperCase());
      setScanStatus(`SCANNED: ${parts.join(' · ')}`);
    } catch {
      setScanStatus('SCAN FAILED');
    } finally {
      setIsScanning(false);
    }
  }

  function runProjection() {
    if (!player || scannedStats.length === 0) return;
    const sessionCount = parseInt(sessions, 10) || 0;
    if (sessionCount === 0) return;

    const drillMult = profile.drillLevelMultipliers[ACADEMY_DRILL_LEVEL] ?? 1.7;
    const budget = sessionCount * profile.baseXpPerSession / scannedStats.length;
    const gains: StatGain[] = [];
    const postCoachStats = { ...player.stats };

    for (const statName of scannedStats) {
      const from = player.stats[statName];
      if (from === undefined) continue;
      const isWhite = isWhiteStat(player.role, statName);
      const gain = estimateStatGainPct(budget, from, player.age, 0, player.talent, isWhite, false, drillMult, profile);
      if (gain > 0) {
        postCoachStats[statName] = Math.min(from + gain, profile.statCap);
        gains.push({ stat: statName, from, gain: Number(gain.toFixed(1)), isWhite });
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
    setScannedStats([]);
    setCoachType('');
    setCoachCategory('');
    setSessions('');
    setSelectedTier(null);
    setSaveConfirmed(false);
    setScanStatus('');
  }

  function saveRun() {
    if (!player || !result) return;
    squadPlanService.saveRun(player.id, {
      sessions: parseInt(sessions, 10) || 0,
      selectedStats: scannedStats,
      ovrBefore: result.ovrBefore,
      ovrAfter: result.ovrAfter,
      gains: result.gains,
      tier: selectedTier,
    });
    setSaveConfirmed(true);
  }

  const canProject = scannedStats.length > 0 && parseInt(sessions, 10) > 0;

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
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <QualityMeter ovr={p.overall} size="sm" />
                  <Chip active={p.id === player?.id} onPress={() => selectPlayer(p.id)}>
                    {p.name}
                  </Chip>
                </View>
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

              {/* Scanned coach identity — only shown after scan */}
              {(coachType || coachCategory) && (
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                  {coachType && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: theme.steelLight + '88' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: theme.steelLight }}>
                        {coachType.toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {coachCategory && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: theme.inkSec + '55' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: theme.inkSec }}>
                        {coachCategory.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Sessions */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <MonoLabel style={{ width: 80 }}>SESSIONS ×</MonoLabel>
                <View style={{ flex: 1, borderWidth: 1, borderColor: theme.hairline2 }}>
                  <TextInput
                    keyboardType="numeric"
                    value={sessions}
                    onChangeText={v => { setSessions(v.replace(/[^0-9]/g, '')); setResult(null); setSelectedTier(null); }}
                    placeholder="—"
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

              {/* Scan button lives here — separate from PROJECT */}
              <Pressable onPress={scanCoach} disabled={isScanning}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderWidth: 1, borderColor: theme.steelLight + '88', padding: 14, backgroundColor: theme.surface2 }}>
                {isScanning
                  ? <ActivityIndicator size="small" color={theme.steelLight} />
                  : <>
                      <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1, color: theme.steelLight }}>⊕ SCAN COACH</Text>
                      {scannedStats.length > 0 && (
                        <MonoLabel size={9} color={theme.inkGhost}>TAP TO RESCAN</MonoLabel>
                      )}
                    </>
                }
              </Pressable>

              {scanStatus !== '' && (
                <MonoLabel size={9} color={scanStatus.startsWith('SCANNED') ? theme.pos : theme.neg} style={{ marginTop: 8 }}>
                  {scanStatus}
                </MonoLabel>
              )}
            </View>

            {/* Table 1 — coach offering: boosted stats only, static after scan */}
            {scannedStats.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 14, marginBottom: 14 }}>
                <MonoLabel color={theme.steelLight} style={{ marginBottom: 10 }}>
                  COACH BOOSTS · {scannedStats.length} {scannedStats.length === 1 ? 'STAT' : 'STATS'}
                </MonoLabel>
                <StatGrid3Col
                  statKeys={scannedStats}
                  roles={player.role}
                  values={player.stats}
                />
              </View>
            )}

            {/* Player stats — read-only reference */}
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 14, marginBottom: 14 }}>
              <MonoLabel color={theme.steelLight} style={{ marginBottom: 8 }}>PLAYER STATS</MonoLabel>
              <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 8 }}>HIGHLIGHTED = ESSENTIAL · DIM = SECONDARY</MonoLabel>
              <StatGrid3Col
                statKeys={[...STAT_COLUMNS.DEF, ...STAT_COLUMNS.ATT, ...STAT_COLUMNS.PHY]
                  .filter(s => (allStats as readonly string[]).includes(s))}
                roles={player.role}
                values={player.stats}
              />
            </View>

            {/* Project button — standalone, only active after scan */}
            <Pressable onPress={runProjection} disabled={!canProject}
              style={{ borderWidth: 1, borderColor: canProject ? theme.steelLight : theme.hairline2,
                padding: 16, alignItems: 'center', marginBottom: 14,
                backgroundColor: canProject ? theme.steelLight : 'transparent' }}>
              <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2,
                color: canProject ? theme.bg : theme.inkGhost }}>
                ▶ PROJECT
              </Text>
              {!canProject && (
                <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 4 }}>
                  {scannedStats.length === 0 ? 'SCAN A COACH FIRST' : 'ENTER SESSION COUNT'}
                </MonoLabel>
              )}
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

                  {/* Table 3 — full player card with gains shown in-cell */}
                  <StatGrid3Col
                    statKeys={[...STAT_COLUMNS.DEF, ...STAT_COLUMNS.ATT, ...STAT_COLUMNS.PHY]
                      .filter(s => (allStats as readonly string[]).includes(s))}
                    roles={player.role}
                    values={player.stats}
                    gains={result.gains.length > 0
                      ? Object.fromEntries(result.gains.map(g => [g.stat, g.gain]))
                      : undefined}
                  />

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
