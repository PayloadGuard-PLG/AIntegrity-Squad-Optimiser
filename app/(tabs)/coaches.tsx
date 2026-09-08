import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { scanCoachPreview } from '../../src/logic/coachScanner';
import { resolveCoachStats, CATEGORY_STATS, ALL_ROUND_SENTINEL } from '../../src/logic/coachPipeline';
import {
  ingestScannedIdentity, identityMismatches, type ScannedIdentity,
} from '../../src/logic/coachIdentityParse';
import { useSquad } from '../../src/hooks/useSquad';
import { useManager } from '../../src/context/ManagerContext';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { Chip } from '../../src/components/atoms/Chip';
import { QualityMeter } from '../../src/components/atoms/QualityMeter';
import { theme } from '../../src/constants/theme';
import { TabBackground } from '../../src/components/TabBackground';
import { OUTFIELD_STATS, GK_STATS_ALL, STAT_COLUMNS } from '../../src/utils/roleWeights';
import { StatGrid3Col } from '../../src/components/StatGrid3Col';
import {
  projectCoachAction, type CoachPreviewInterval, type CoachTransferClass,
} from '../../src/logic/recommendation';
import gameProfileJson from '../../profiles/game_2025.json';
import { TalentTier, GameProfile } from '../../src/types/resources';
import { playerService } from '../../src/services/playerService';
import { squadPlanService } from '../../src/services/squadPlanService';
import { coachHistoryService, type CoachHistoryEntry } from '../../src/services/coachHistoryService';

const profile = gameProfileJson as unknown as GameProfile;

// Tier NAME only. The multiplier a projection actually used is reported by the
// domain result (RecommendationResult.talent), never asserted by this screen.
const TALENT_LABEL: Record<TalentTier, string> = {
  Fastest: 'FASTEST', Fast: 'FAST', Average: 'AVERAGE', Normal: 'NORMAL', Slow: 'SLOW', Unknown: 'UNKNOWN',
};

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
type ProjectionResult = { gains: StatGain[]; ovrBefore: number; ovrAfter: number; ovrGain: number; postCoachStats: Record<string, number>; reasons: string[]; trainingLocked: boolean };
type RewardPreviewResult = { intervals: CoachPreviewInterval[]; reasons: string[] };

export default function CoachesScreen() {
  const { squad } = useSquad();
  const manager = useManager();
  const selectedId = manager.selectedPlayerId;

  const [sessions, setSessions] = useState('');
  const [scannedStats, setScannedStats] = useState<string[]>([]);
  const [coachType, setCoachType] = useState('');
  const [coachCategory, setCoachCategory] = useState('');
  const [transferClass, setTransferClass] = useState<CoachTransferClass>('ordinary');
  const [observedGainIntervals, setObservedGainIntervals] = useState<CoachPreviewInterval[]>([]);
  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [rewardPreviewResult, setRewardPreviewResult] = useState<RewardPreviewResult | null>(null);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [focusedStatSel, setFocusedStatSel] = useState<Set<string>>(new Set());
  const [coachHistory, setCoachHistory] = useState<CoachHistoryEntry[]>([]);
  const [scannedIdentity, setScannedIdentity] = useState<ScannedIdentity>({});
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const { playerId: incomingPlayerId, sessions: incomingSessions } = useLocalSearchParams<{ playerId?: string; sessions?: string }>();

  // Declared before the effects below: their dependency arrays read player?.id
  // during render, so a const declared after them is a temporal-dead-zone throw.
  const player = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  useEffect(() => {
    if (incomingPlayerId) manager.setSelectedPlayerId(incomingPlayerId);
  }, []);

  useEffect(() => {
    setCoachHistory(player ? coachHistoryService.getForPlayer(player.id) : []);
  }, [player?.id]);

  // Auto-re-project when session count changes (if stats already scanned)
  useEffect(() => {
    if (!player || scannedStats.length === 0) return;
    const n = parseInt(sessions, 10);
    if (n > 0) runProjection();
    else { setResult(null); setRewardPreviewResult(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  const allStats = useMemo(() => {
    if (!player) return OUTFIELD_STATS as readonly string[];
    const isGK = player.role.some(r => r.includes('GK'));
    return isGK ? GK_STATS_ALL : OUTFIELD_STATS;
  }, [player]);

  const identityConflicts = useMemo(
    () => identityMismatches(scannedIdentity, player
      ? { name: player.name, age: player.age, talent: player.talent }
      : null),
    [scannedIdentity, player],
  );

  const selectPlayer = useCallback((id: string) => {
    manager.setSelectedPlayerId(id);
    setSessions('');
    setScannedStats([]);
    setCoachType('');
    setCoachCategory('');
    setTransferClass('ordinary');
    setObservedGainIntervals([]);
    setScannedIdentity({});
    setFocusedStatSel(new Set());
    setResult(null);
    setRewardPreviewResult(null);
    setSaveConfirmed(false);
    setScanStatus('');
  }, [manager]);

  function buildStatus(stats: string[], type: string, cat: string, prefix: string) {
    const parts: string[] = [];
    if (sessions) parts.push(`×${sessions}`);
    parts.push(`${stats.length} STATS`);
    if (type) parts.push(type.toUpperCase());
    if (cat) parts.push(cat.toUpperCase());
    setScanStatus(`${prefix}: ${parts.join(' · ')}`);
  }

  // Manual type/category selection resolves WHICH STATS the coach covers — the
  // ambiguity a human is here to settle. It is not an observation about which
  // CLASS of coach this is, and it says nothing about intervals already read.
  // These previously reset transferClass to 'ordinary' and wiped the intervals,
  // so one tap after a Reward scan silently reclassified it as ordinary and the
  // geometric transfer produced a number for a coach whose transfer function is
  // falsified. Class and intervals are scan-owned; selectPlayer and applyGains
  // remain the reset points.
  function selectCoachType(type: string) {
    const next = coachType === type ? '' : type;
    setCoachType(next);
    setFocusedStatSel(new Set());
    setResult(null);
    setRewardPreviewResult(null);
    if (next && next !== 'Focused' && coachCategory) {
      const stats = CATEGORY_STATS[coachCategory] ?? [];
      setScannedStats(stats);
      buildStatus(stats, next, coachCategory, 'MANUAL');
    } else {
      setScannedStats([]);
      setScanStatus('');
    }
  }

  function selectCoachCategory(cat: string) {
    setCoachCategory(cat);
    setFocusedStatSel(new Set());
    setResult(null);
    setRewardPreviewResult(null);
    if (coachType !== 'Focused') {
      const stats = CATEGORY_STATS[cat] ?? [];
      setScannedStats(stats);
      buildStatus(stats, coachType, cat, 'MANUAL');
    } else {
      setScannedStats([]);
      setScanStatus('');
    }
  }

  function toggleFocusedStat(stat: string) {
    const next = new Set(focusedStatSel);
    if (next.has(stat)) { next.delete(stat); } else if (next.size < 2) { next.add(stat); }
    setFocusedStatSel(next);
    const stats = [...next];
    setScannedStats(stats);
    setResult(null);
    setRewardPreviewResult(null);
    if (stats.length > 0) buildStatus(stats, coachType, coachCategory, 'MANUAL');
  }

  function saveToHistory(
    stats: string[], sessCount: number, type: string, cat: string, isManual: boolean,
    savedTransferClass: CoachTransferClass = 'ordinary',
    savedIntervals: CoachPreviewInterval[] = [],
  ) {
    if (!player || stats.length === 0 || sessCount === 0) return;
    coachHistoryService.save({
      id: Date.now().toString(),
      playerId: player.id,
      timestamp: Date.now(),
      coachType: type,
      coachCategory: cat,
      sessions: sessCount,
      stats,
      transferClass: savedTransferClass,
      observedGainIntervals: savedIntervals,
      isManual,
    });
    setCoachHistory(coachHistoryService.getForPlayer(player.id));
  }

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
        setTransferClass('ordinary'); setObservedGainIntervals([]);
        setScannedIdentity({});
        return;
      }

      if (scan.multiplier) setSessions(String(scan.multiplier));
      setCoachType(scan.coachType ?? '');
      setCoachCategory(scan.coachCategory ?? '');
      const scannedTransferClass: CoachTransferClass = scan.isRewardCoach ? 'reward' : 'ordinary';
      setTransferClass(scannedTransferClass);

      // Scanner-observed identity of the card IN THE IMAGE. Held, displayed and
      // compared — never written into the selected player's record. The preview
      // shows whichever card the game attached to the coach, so a disagreement
      // here means the stat intervals read from the same image describe someone
      // other than the player this screen is about to project. Each field is
      // written only when observed; an absent one leaves the prior read intact.
      setScannedIdentity(prev => ingestScannedIdentity(
        { name: scan.playerName, age: scan.playerAge, talent: scan.talentTier },
        prev,
      ));
      setFocusedStatSel(new Set());
      setResult(null); setRewardPreviewResult(null); setSaveConfirmed(false);

      if (__DEV__ && scan._debugBlocks) console.log('[COACH SCAN] BLOCKS:', scan._debugBlocks);
      if (__DEV__) console.log('[COACH SCAN] stats raw:', scan.stats.map(s => `${s.statName} lo=${s.gainLo} hi=${s.gainHi}`).join(', '));

      // Counted for the scan status line only. The projection does NOT consume
      // these: the game's displayed +lo-hi is an interval, and its midpoint is
      // not a stated expected value. Treating it as one is an assumption, not an
      // observation, so it never enters the math. See calibration_data.json →
      // bxps_recalibration.midpointAssumption.
      // The interval and the baseline are SEPARATE observations. `statBefore`
      // comes from a nearest-number search that returns 0 when the row's value
      // sits in another OCR block — routine in the three-column layout. Gating
      // the interval on it discarded a successful measurement because a
      // different one failed, which is why a scan could report stats and still
      // claim no usable interval was captured.
      const gainRanges: Record<string, { lo: number; hi: number; statBefore?: number }> = {};
      for (const cap of scan.stats) {
        if (cap.gainLo >= 0 && cap.gainHi >= cap.gainLo) {
          gainRanges[cap.statName] = {
            lo: cap.gainLo,
            hi: cap.gainHi,
            // Carried only when actually read. 0 means "not observed" here, and
            // an unobserved baseline is omitted rather than reported as zero.
            ...(cap.statBefore > 0 ? { statBefore: cap.statBefore } : {}),
          };
        }
      }
      const intervals: CoachPreviewInterval[] = Object.entries(gainRanges).map(([stat, range]) => ({
        stat,
        ...(range.statBefore !== undefined ? { statBefore: range.statBefore } : {}),
        gainLo: range.lo,
        gainHi: range.hi,
      }));
      setObservedGainIntervals(intervals);
      const statNames = resolveCoachStats(scan, player!.stats, player!.role);

      if (statNames[0] === ALL_ROUND_SENTINEL) {
        const allEnteredStats = Object.keys(player!.stats);
        setScannedStats(allEnteredStats.length > 0 ? allEnteredStats : []);
        const rangeCt = Object.keys(gainRanges).length;
        setScanStatus(allEnteredStats.length > 0
          ? `ALL-ROUND ×${scan.multiplier ?? parseInt(sessions, 10)} · ${allEnteredStats.length} STATS · ${rangeCt} RANGES`
          : 'ALL-ROUND — enter player stats to project');
        saveToHistory(allEnteredStats, (scan.multiplier ?? parseInt(sessions, 10)) || 0,
          scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, intervals);
        setIsScanning(false);
        return;
      }

      setScannedStats(statNames);


      const parts: string[] = [];
      if (scan.multiplier) parts.push(`×${scan.multiplier}`);
      parts.push(`${statNames.length} STATS`);
      const rangeCt2 = Object.keys(gainRanges).length;
      if (rangeCt2 > 0) parts.push(`${rangeCt2} RANGES`);
      if (scan.coachType) parts.push(scan.coachType.toUpperCase());
      if (scan.coachCategory) parts.push(scan.coachCategory.toUpperCase());
      setScanStatus(`SCANNED: ${parts.join(' · ')}`);
      saveToHistory(statNames, (scan.multiplier ?? parseInt(sessions, 10)) || 0,
        scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, intervals);
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

    // One domain answer. No budget, multiplier, talent or OVR math on this screen.
    const projection = projectCoachAction({
      player, stats: scannedStats, sessions: sessionCount, profile,
      transferClass, observedGainIntervals,
    });
    if (projection.projectionStatus === 'unavailable') {
      setResult(null);
      setRewardPreviewResult({
        intervals: projection.observedGainIntervals,
        reasons: projection.reasons.map(r => r.detail),
      });
      setSaveConfirmed(false);
      return;
    }
    const gains: StatGain[] = projection.statDeltas.map(d => ({
      stat: d.stat, from: d.from, gain: d.delta, isWhite: d.isWhite,
    }));

    setResult({
      gains,
      ovrBefore: projection.ovrBefore,
      // ovrAfter is the domain's unfloored view; ovrBefore stays floored to match
      // the game's displayed integer. Both are asserted by the projection.
      ovrAfter: projection.ovrAfterExact,
      ovrGain: projection.ovrDelta,
      postCoachStats: projection.projectedStats,
      reasons: projection.reasons.map(r => r.detail),
      trainingLocked: projection.trainingLocked,
    });
    setRewardPreviewResult(null);
    setSaveConfirmed(false);
    if (!scanStatus.startsWith('SCANNED')) {
      saveToHistory(scannedStats, sessionCount, coachType, coachCategory, true, 'ordinary', []);
    }
  }

  function applyGains() {
    if (!player || !result) return;
    playerService.applyAndSnapshot(player, { stats: result.postCoachStats, overall: Number(result.ovrAfter.toFixed(1)), tier: player.tier });
    setResult(null);
    setScannedStats([]);
    setCoachType('');
    setCoachCategory('');
    setTransferClass('ordinary');
    setObservedGainIntervals([]);
    setScannedIdentity({});
    setSessions('');
    setSaveConfirmed(false);
    setScanStatus('');
    setRewardPreviewResult(null);
  }

  function saveRun() {
    if (!player || !result) return;
    squadPlanService.saveRun(player.id, {
      sessions: parseInt(sessions, 10) || 0,
      selectedStats: scannedStats,
      ovrBefore: result.ovrBefore,
      ovrAfter: result.ovrAfter,
      gains: result.gains,
    });
    setSaveConfirmed(true);
  }

  const canProject = scannedStats.length > 0 && parseInt(sessions, 10) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <TabBackground tab="coaches" />
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 14, paddingHorizontal: 16, paddingBottom: 40 }}>

        {/* Player picker */}
        {squad.length > 0 && (
          <>
            <MonoLabel color={theme.steelLight} style={{ marginBottom: 8 }}>SUBJECT</MonoLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row', gap: 5, paddingBottom: 14 }}>
              {[...squad].sort((a, b) => (a.id === player?.id ? -1 : b.id === player?.id ? 1 : 0)).map(p => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <QualityMeter ovr={p.overall} size="sm" />
                  <Chip active={p.id === player?.id} onPress={() => {
                    const now = Date.now();
                    const last = lastTapRef.current;
                    if (last?.id === p.id && now - last.time < 350) {
                      lastTapRef.current = null;
                      router.push(`/player/${p.id}`);
                    } else {
                      lastTapRef.current = { id: p.id, time: now };
                      selectPlayer(p.id);
                    }
                  }}>
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

              {/* Type chips — always interactive */}
              <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
                {(['Standard', 'Focused', 'Extensive'] as const).map(t => {
                  const active = coachType === t;
                  return (
                    <Pressable key={t} onPress={() => selectCoachType(t)}
                      style={{ paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1,
                        borderColor: active ? theme.steelLight : theme.steel,
                        backgroundColor: active ? theme.steelLight + '22' : 'transparent' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1,
                        color: active ? theme.steelLight : theme.inkMuted }}>
                        {t.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Category chips — always interactive */}
              <View style={{ flexDirection: 'row', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
                {(['Attacking', 'Defending', 'Physical', 'Safeguard', 'Goalkeeping'] as const).map(c => {
                  const active = coachCategory === c;
                  const label = c === 'Goalkeeping' ? 'GK' : c.toUpperCase();
                  return (
                    <Pressable key={c} onPress={() => selectCoachCategory(c)}
                      style={{ paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1,
                        borderColor: active ? theme.inkSec : theme.steel,
                        backgroundColor: active ? theme.inkSec + '22' : 'transparent' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1,
                        color: active ? theme.inkSec : theme.inkMuted }}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Focused stat selector */}
              {coachType === 'Focused' && coachCategory && (
                <View style={{ marginBottom: 12 }}>
                  <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 6 }}>
                    BOOSTED STATS — TAP TO SELECT (MAX 2)
                  </MonoLabel>
                  <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                    {(CATEGORY_STATS[coachCategory] ?? []).map(stat => {
                      const sel = focusedStatSel.has(stat);
                      const col = statColor(stat);
                      return (
                        <Pressable key={stat} onPress={() => toggleFocusedStat(stat)}
                          style={{ paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1,
                            borderColor: sel ? theme.pos : col + '88',
                            backgroundColor: sel ? theme.pos + '22' : 'transparent' }}>
                          <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 1,
                            color: sel ? theme.pos : col }}>
                            {stat}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Sessions */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <MonoLabel style={{ width: 80 }}>SESSIONS ×</MonoLabel>
                <View style={{ flex: 1, borderWidth: 1, borderColor: theme.hairline2 }}>
                  <TextInput
                    keyboardType="numeric"
                    value={sessions}
                    onChangeText={v => setSessions(v.replace(/[^0-9]/g, ''))}
                    placeholder="—"
                    placeholderTextColor={theme.inkGhost}
                    style={{ fontFamily: theme.mono, fontSize: 22, fontWeight: '700', color: theme.ink, padding: 10, textAlign: 'center' }}
                  />
                </View>
              </View>

              {/* Talent — informational display from player card */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <MonoLabel style={{ flex: 1 }}>TALENT</MonoLabel>
                <View style={{ paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: theme.steelLight }}>
                  <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: theme.steelLight }}>
                    {TALENT_LABEL[player.talent as TalentTier] ?? player.talent}
                  </Text>
                </View>
                <MonoLabel size={8} color={theme.steelLight}>FROM CARD</MonoLabel>
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

              {/* Scanned card identity — an observation about the IMAGE, not a
                  write to the selected player. See coachIdentityParse.ts. */}
              {(scannedIdentity.name || scannedIdentity.age !== undefined || scannedIdentity.talent) && (
                <View style={{ borderWidth: 1, borderColor: identityConflicts.length > 0 ? theme.neg : theme.hairline2, padding: 10, marginTop: 8 }}>
                  <MonoLabel size={8} color={theme.inkGhost}>SCANNED CARD</MonoLabel>
                  <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: theme.inkSec, marginTop: 4 }}>
                    {[
                      scannedIdentity.name,
                      scannedIdentity.age !== undefined ? `AGE ${scannedIdentity.age}` : undefined,
                      scannedIdentity.talent ? scannedIdentity.talent.toUpperCase() : undefined,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                  {identityConflicts.length > 0 && (
                    <View style={{ marginTop: 6 }}>
                      <MonoLabel size={8} color={theme.neg}>DOES NOT MATCH SELECTED PLAYER</MonoLabel>
                      {identityConflicts.map(c => (
                        <Text key={c.field} style={{ fontFamily: theme.mono, fontSize: 9, color: theme.neg, marginTop: 2 }}>
                          {c.field.toUpperCase()}: CARD {c.observed} · SELECTED {c.selected}
                        </Text>
                      ))}
                      <Text style={{ fontFamily: theme.mono, fontSize: 8, color: theme.inkMuted, marginTop: 4, letterSpacing: 0.5 }}>
                        The ranges read from this image belong to the card shown in it.
                        Select that player, or re-scan a preview for {player.name}.
                      </Text>
                    </View>
                  )}
                </View>
              )}
              {transferClass === 'reward' && (
                <MonoLabel size={8} color={theme.hot} style={{ marginTop: 4 }}>
                  REWARD COACH · PREVIEW INTERVALS ONLY · XP TRANSFER UNRESOLVED
                </MonoLabel>
              )}
              {transferClass === 'unknown' && (
                <MonoLabel size={8} color={theme.hot} style={{ marginTop: 4 }}>
                  UNCLASSIFIED ENTRY · PREDATES COACH CLASSIFICATION · RE-SCAN TO PROJECT
                </MonoLabel>
              )}
              {scanStatus.startsWith('SCANNED') && coachType === 'Focused' && scannedStats.length === 0 && (
                <>
                  <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 4 }}>
                    FOCUSED: ADD ANY PLAYER TO THE COACH IN-GAME BEFORE SCANNING
                  </MonoLabel>
                  <MonoLabel size={8} color={theme.hot} style={{ marginTop: 3 }}>
                    OR TAP THE BOOSTED STATS ABOVE TO SELECT MANUALLY
                  </MonoLabel>
                </>
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
            {rewardPreviewResult && (
              <View style={{ borderWidth: 1, borderColor: theme.hot + '66', padding: 14, marginBottom: 14 }}>
                <MonoLabel color={theme.hot} style={{ marginBottom: 8 }}>REWARD COACH — NO NUMERIC PROJECTION</MonoLabel>
                {rewardPreviewResult.reasons.map((reason, i) => (
                  <MonoLabel key={i} size={8} color={theme.inkMuted} style={{ marginBottom: 4 }}>{reason}</MonoLabel>
                ))}
                {rewardPreviewResult.intervals.map(interval => (
                  <MonoLabel key={interval.stat} size={9} color={theme.inkSec} style={{ marginTop: 4 }}>
                    {interval.stat}{interval.statBefore !== undefined ? ` ${interval.statBefore}` : ''} · +{interval.gainLo}–{interval.gainHi} OBSERVED
                  </MonoLabel>
                ))}
              </View>
            )}
            {result && (
              <>
                <View style={{ borderWidth: 1, borderColor: result.ovrGain > 0 ? theme.pos + '55' : theme.hairline2, padding: 14, marginBottom: 14 }}>
                  {result.reasons.map((reason, i) => (
                    <MonoLabel key={i} size={8} color={theme.inkMuted} style={{ marginBottom: 4 }}>{reason}</MonoLabel>
                  ))}
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
                        UPDATES BASE STATS + OVR
                      </MonoLabel>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          {/* Scan history — per player */}
          {coachHistory.length > 0 && (
            <View style={{ marginTop: 8, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <View style={{ width: 3, height: 10, backgroundColor: theme.steel }} />
                <MonoLabel size={9} color={theme.steel}>SCAN HISTORY — {player.name.toUpperCase()}</MonoLabel>
              </View>
              {coachHistory.map(entry => (
                <Pressable key={entry.id} onPress={() => {
                  setSessions(String(entry.sessions));
                  setCoachType(entry.coachType);
                  setCoachCategory(entry.coachCategory);
                  setTransferClass(entry.transferClass);
                  setObservedGainIntervals(entry.observedGainIntervals);
                  setScannedStats(entry.stats);
                  setFocusedStatSel(new Set());
                  setResult(null);
                  setRewardPreviewResult(null);
                  setScanStatus(`HISTORY: ${entry.label}`);
                }}
                  style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 10, marginBottom: 5,
                    flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <MonoLabel size={9} color={theme.inkSec}>{entry.label}</MonoLabel>
                    <MonoLabel size={8} color={theme.inkGhost}>
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </MonoLabel>
                  </View>
                  <MonoLabel size={9} color={theme.steelLight}>▶ USE</MonoLabel>
                </Pressable>
              ))}
            </View>
          )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
