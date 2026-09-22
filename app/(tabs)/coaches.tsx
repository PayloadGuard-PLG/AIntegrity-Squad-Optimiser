import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { scanCoachPreview } from '../../src/logic/coachScanner';
import { resolveCoachStats, ALL_ROUND_SENTINEL } from '../../src/logic/coachPipeline';
import { buildOutcomeEvidence } from '../../src/logic/outcomeEvidence';
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
import { ResourceCoachLab } from '../../src/components/ResourceCoachLab';
import { OUTFIELD_STATS, GK_STATS_ALL, STAT_COLUMNS } from '../../src/utils/roleWeights';
import { StatGrid3Col } from '../../src/components/StatGrid3Col';
import type { CoachPreviewInterval, CoachTransferClass } from '../../src/logic/recommendation';
import type {
  CoachClassificationSource, CoachProgrammeFamily, CoachSourceFamily,
} from '../../src/logic/coachTransfer';
import { withManualStatSelection } from '../../src/logic/coachObservationState';
import { coachHistoryService, type CoachHistoryEntry } from '../../src/services/coachHistoryService';

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

export default function CoachesScreen() {
  const { squad } = useSquad();
  const manager = useManager();
  const selectedId = manager.selectedPlayerId;

  const [sessions, setSessions] = useState('');
  const [scannedStats, setScannedStats] = useState<string[]>([]);
  const [coachType, setCoachType] = useState('');
  const [coachCategory, setCoachCategory] = useState('');
  const [transferClass, setTransferClass] = useState<CoachTransferClass>('unresolved');
  const [sourceFamily, setSourceFamily] = useState<CoachSourceFamily>('unresolved');
  const [sourceFamilySource, setSourceFamilySource] = useState<CoachClassificationSource>('unresolved');
  const [transferClassSource, setTransferClassSource] = useState<CoachClassificationSource>('unresolved');
  const [programmeFamily, setProgrammeFamily] = useState<CoachProgrammeFamily>('unknown');
  const [programmeFamilySource, setProgrammeFamilySource] = useState<CoachClassificationSource>('unresolved');
  const [targetSource, setTargetSource] = useState<'ocr-observed' | 'manual-confirmed' | 'all-round-observed' | 'unresolved'>('unresolved');
  const [observationContext, setObservationContext] = useState('');
  const [observedGainIntervals, setObservedGainIntervals] = useState<CoachPreviewInterval[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
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
    setTransferClass('unresolved');
    setTransferClassSource('unresolved');
    setSourceFamily('unresolved');
    setSourceFamilySource('unresolved');
    setProgrammeFamily('unknown');
    setProgrammeFamilySource('unresolved');
    setTargetSource('unresolved');
    setObservedGainIntervals([]);
    setScannedIdentity({});
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

  // Type/category describe the coach offering; they are NOT evidence for which
  // rows are actually affected. Live Drill Session evidence falsifies the old
  // "Standard/Extensive = whole category" shortcut. Editing these labels must
  // therefore never invent or erase the target set or observed intervals.
  function selectCoachType(type: string) {
    const next = coachType === type ? '' : type;
    setCoachType(next);
    buildStatus(scannedStats, next, coachCategory, 'MANUAL METADATA');
  }

  function selectCoachCategory(cat: string) {
    const next = coachCategory === cat ? '' : cat;
    setCoachCategory(next);
    buildStatus(scannedStats, coachType, next, 'MANUAL METADATA');
  }

  function toggleAffectedStat(stat: string) {
    const next = new Set(scannedStats);
    if (next.has(stat)) { next.delete(stat); } else if (next.size < 15) { next.add(stat); }
    const observation = withManualStatSelection({
      transferClass, observedGainIntervals, selectedStats: scannedStats,
    }, [...next]);
    const stats = observation.selectedStats;
    setScannedStats(stats);
    setTargetSource('manual-confirmed');
    setTransferClass(observation.transferClass);
    setObservedGainIntervals(observation.observedGainIntervals);
    if (stats.length > 0) buildStatus(stats, coachType, coachCategory, 'MANUAL');
  }

  function selectTransferClass(next: Exclude<CoachTransferClass, 'unresolved'>) {
    if (sourceFamily === 'training-camp') return;
    setSourceFamily('resource-coach');
    setSourceFamilySource('manual-confirmed');
    setTransferClass(next);
    setTransferClassSource('manual-confirmed');
  }

  function previewContext(playerId: string, n: number, type: string, category: string, stats: string[]) {
    return JSON.stringify([playerId,n,type,category,[...stats].sort()]);
  }

  function saveToHistory(
    stats: string[], sessCount: number, type: string, cat: string, isManual: boolean,
    savedTransferClass: CoachTransferClass, savedSourceFamily: CoachSourceFamily,
    savedIntervals: CoachPreviewInterval[] = [],
  ) {
    if (!player || stats.length === 0 || sessCount === 0) return;
    setObservationContext(previewContext(player.id, sessCount, type, cat, stats));
    coachHistoryService.save({
      id: Date.now().toString(),
      playerId: player.id,
      timestamp: Date.now(),
      coachType: type,
      coachCategory: cat,
      sessions: sessCount,
      stats,
      transferClass: savedTransferClass,
      sourceFamily: savedSourceFamily,
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
      const recognised = !!(scan.coachType || scan.coachCategory || scan.multiplier || scan.programmeFamily !== 'unknown');

      if (!recognised && scan.stats.length === 0) {
        setScanStatus('SCAN REJECTED — UPLOAD A SCREEN RESOLUTION COACH PREVIEW');
        setScannedStats([]); setCoachType(''); setCoachCategory('');
        setTransferClass('unresolved'); setTransferClassSource('unresolved');
        setSourceFamily('unresolved'); setSourceFamilySource('unresolved');
        setProgrammeFamily('unknown'); setProgrammeFamilySource('unresolved');
        setTargetSource('unresolved'); setObservedGainIntervals([]);
        setScannedIdentity({});
        return;
      }

      setSessions(scan.multiplier ? String(scan.multiplier) : '');
      setCoachType(scan.coachType ?? '');
      setCoachCategory(scan.coachCategory ?? '');
      const scannedTransferClass = scan.transferClass;
      const scannedSourceFamily = scan.sourceFamily;
      setTransferClass(scannedTransferClass);
      setTransferClassSource(scannedTransferClass === 'unresolved' ? 'unresolved' : 'ocr-observed');
      setSourceFamily(scannedSourceFamily);
      setSourceFamilySource(scannedSourceFamily === 'unresolved' ? 'unresolved' : 'ocr-observed');
      setProgrammeFamily(scan.programmeFamily);
      setProgrammeFamilySource(scan.programmeFamily === 'unknown' ? 'unresolved' : 'ocr-observed');

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
        setTargetSource(allEnteredStats.length > 0 ? 'all-round-observed' : 'unresolved');
        const rangeCt = Object.keys(gainRanges).length;
        setScanStatus(allEnteredStats.length > 0
          ? `ALL-ROUND ×${scan.multiplier ?? parseInt(sessions, 10)} · ${allEnteredStats.length} STATS · ${rangeCt} RANGES`
          : 'ALL-ROUND — enter player stats to project');
        saveToHistory(allEnteredStats, scan.multiplier || 0,
          scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, scannedSourceFamily, intervals);
        setIsScanning(false);
        return;
      }

      setScannedStats(statNames);
      setTargetSource(statNames.length > 0 ? 'ocr-observed' : 'unresolved');

      const parts: string[] = [];
      if (scan.multiplier) parts.push(`×${scan.multiplier}`);
      if (scan.programmeFamily === 'drill-session') parts.push('DRILL SESSION');
      if (scan.programmeFamily === 'skill-seminar') parts.push('SKILL SEMINAR');
      if (scannedSourceFamily === 'training-camp') parts.push('TRAINING CAMP');
      else if (scannedTransferClass === 'reward') parts.push('REWARD COACH');
      else if (scannedTransferClass === 'ordinary') parts.push('ACADEMY COACH');
      else parts.push('TRANSFER UNRESOLVED');
      parts.push(`${statNames.length} STATS`);
      const rangeCt2 = Object.keys(gainRanges).length;
      if (rangeCt2 > 0) parts.push(`${rangeCt2} RANGES`);
      for (const interval of intervals.slice(0, 3)) {
        parts.push(`${interval.stat} [${interval.gainLo},${interval.gainHi}]`);
      }
      if (scan.coachType) parts.push(scan.coachType.toUpperCase());
      if (scan.coachCategory) parts.push(scan.coachCategory.toUpperCase());
      setScanStatus(`SCANNED: ${parts.join(' · ')}`);
      saveToHistory(statNames, scan.multiplier || 0,
        scan.coachType ?? '', scan.coachCategory ?? '', false, scannedTransferClass, scannedSourceFamily, intervals);
    } catch {
      setScanStatus('SCAN FAILED');
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
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
                {(['Attacking', 'Defending', 'Physical', 'Safeguard', 'Goalkeeping', 'All-Round'] as const).map(c => {
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

              {/* Transfer class is independent from Standard/Focused/Extensive. */}
              <View style={{ marginBottom: 12 }}>
                <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 6 }}>
                  TRANSFER CLASS — SELECT ONLY FROM EXPLICIT GAME LABEL
                </MonoLabel>
                <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                  {([
                    ['ordinary', 'ACADEMY COACH'],
                    ['reward', 'REWARD COACH'],
                  ] as const).map(([value, label]) => {
                    const active = transferClass === value;
                    return (
                      <Pressable key={value} onPress={() => selectTransferClass(value)} disabled={sourceFamily==='training-camp'}
                        style={{ paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, opacity: sourceFamily==='training-camp' ? 0.35 : 1,
                          borderColor: active ? theme.hot : theme.steel,
                          backgroundColor: active ? theme.hot + '22' : 'transparent' }}>
                        <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1,
                          color: active ? theme.hot : theme.inkMuted }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                  {sourceFamily !== 'training-camp' && transferClass === 'unresolved' && (
                    <MonoLabel size={8} color={theme.hot}>UNRESOLVED — PROJECTION BLOCKED</MonoLabel>
                  )}
                </View>
              </View>

              {/* Focused stat selector */}
              {coachType && (
                <View style={{ marginBottom: 12 }}>
                  <MonoLabel size={8} color={theme.inkGhost} style={{ marginBottom: 6 }}>
                    AFFECTED STATS — SELECT THE EXACT COACH TARGETS
                  </MonoLabel>
                  <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                    {allStats.map(stat => {
                      const sel = scannedStats.includes(stat);
                      const col = statColor(stat);
                      return (
                        <Pressable key={stat} onPress={() => toggleAffectedStat(stat)}
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
              <View style={{ gap: 8, marginBottom: 14 }}>
                <MonoLabel>DISPLAYED MULTIPLIER ×</MonoLabel>
                <View style={{ borderWidth: 1, borderColor: theme.hairline2 }}>
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

              <Text style={{ color: theme.inkSec, fontSize: 12, lineHeight: 18, marginBottom: 14 }}>
                Resource Coach V2 uses age, tier, starting stats and displayed multiplier.
                The app’s manual Training Rate classification is not used.
              </Text>

              {/* Scan button lives here — separate from PROJECT */}
              <Pressable onPress={scanCoach} disabled={isScanning}
                style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8,
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
              {sourceFamily === 'training-camp' && (
                <MonoLabel size={8} color={theme.hot} style={{ marginTop: 4 }}>
                  TRAINING CAMP · EVIDENCE ONLY · RESOURCE COACH V2 BLOCKED
                </MonoLabel>
              )}
              {transferClass === 'reward' && (
                <MonoLabel size={8} color={theme.hot} style={{ marginTop: 4 }}>
                  REWARD COACH · PREVIEW INTERVALS ONLY · XP TRANSFER UNRESOLVED
                </MonoLabel>
              )}
              {transferClass === 'unresolved' && (
                <MonoLabel size={8} color={theme.hot} style={{ marginTop: 4 }}>
                  TRANSFER CLASS UNRESOLVED · RE-SCAN OR SELECT AN EXPLICIT GAME LABEL
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

            <ResourceCoachLab player={player} stats={scannedStats} multiplier={Number(sessions)}
              coachLabel={[coachType,coachCategory].filter(Boolean).join(' ')} sourceFamily={sourceFamily} transferClass={transferClass}
              sourceFamilySource={sourceFamilySource} transferClassSource={transferClassSource}
              initialProgrammeFamily={programmeFamily} initialProgrammeFamilySource={programmeFamilySource}
              targetSource={targetSource}
              observed={observationContext === previewContext(player.id, Number(sessions), coachType, coachCategory, scannedStats) ? buildOutcomeEvidence(observedGainIntervals) : []}
              identityConflict={identityConflicts.length > 0} />
          {/* Scan history — per player */}
          {coachHistory.length > 0 && (
            <View style={{ marginTop: 8, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <View style={{ width: 3, height: 10, backgroundColor: theme.steel }} />
                <MonoLabel size={9} color={theme.steel}>SCAN HISTORY — {player.name.toUpperCase()}</MonoLabel>
              </View>
              {coachHistory.map(entry => (
                <Pressable key={entry.id} onPress={() => {
                  setObservationContext(previewContext(player.id, entry.sessions, entry.coachType, entry.coachCategory, entry.stats));
                  setScannedIdentity({});
                  setSessions(String(entry.sessions));
                  setCoachType(entry.coachType);
                  setCoachCategory(entry.coachCategory);
                  setTransferClass(entry.transferClass);
                  setTransferClassSource(entry.transferClass === 'unresolved' ? 'unresolved' : 'ocr-observed');
                  setSourceFamily(entry.sourceFamily);
                  setSourceFamilySource(entry.sourceFamily === 'unresolved' ? 'unresolved' : 'ocr-observed');
                  setProgrammeFamily('unknown');
                  setProgrammeFamilySource('unresolved');
                  setTargetSource('unresolved');
                  setObservedGainIntervals(entry.observedGainIntervals);
                  setScannedStats(entry.stats);
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
