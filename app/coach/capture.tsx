import { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Alert, Image, Platform } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSquad } from '../../src/hooks/useSquad';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { Chip } from '../../src/components/atoms/Chip';
import { theme } from '../../src/constants/theme';
import { getWhiteStatKeys, getAllStatKeys } from '../../src/utils/roleWeights';
import { computeOvrWithPadding } from '../../src/logic/ovrProjector';
import gameProfileJson from '../../profiles/game_2025.json';
import { GameProfile, TalentTier } from '../../src/types/resources';
import { squadPlanService } from '../../src/services/squadPlanService';
import { Player } from '../../src/database/playerSchema';

const profile = gameProfileJson as unknown as GameProfile;

const TALENT_TIERS: TalentTier[] = ['FT1', 'FT2', 'FT3', 'Normal', 'Slow'];
const TALENT_LABEL: Record<TalentTier, string> = { FT1: 'FT1', FT2: 'FT2', FT3: 'FT3', Normal: 'NORM', Slow: 'SLOW' };

const COACH_TYPES = ['STANDARD', 'FOCUSED', 'EXTENSIVE'];
const COACH_CATEGORIES = ['ATTACKING', 'DEFENDING', 'PHYSICAL', 'SAFEGUARD'];

type GainEntry = { lo: string; hi: string };

export default function CoachCaptureScreen() {
  const { squad } = useSquad();

  const [coachType, setCoachType] = useState('STANDARD');
  const [coachCategory, setCoachCategory] = useState('ATTACKING');
  const [multiplier, setMultiplier] = useState('30');

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [ageInput, setAgeInput] = useState('');
  const [ovrInput, setOvrInput] = useState('');
  const [talent, setTalent] = useState<TalentTier>('Normal');

  // stat values and gain ranges — keyed by stat name
  const [statValues, setStatValues] = useState<Record<string, string>>({});
  const [gains, setGains] = useState<Record<string, GainEntry>>({});
  const [expandedStat, setExpandedStat] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const player: Player | null = squad.find(p => p.id === selectedPlayerId) ?? null;

  const { white, grey } = useMemo(() => {
    if (!player) return { white: [] as string[], grey: [] as string[] };
    const w = getWhiteStatKeys(player.role);
    const all = getAllStatKeys(player.role);
    const g = all.filter(s => !w.includes(s));
    return { white: w, grey: g };
  }, [player]);

  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo library access in settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled && result.assets[0]) setCapturedImage(result.assets[0].uri);
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow camera access in settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled && result.assets[0]) setCapturedImage(result.assets[0].uri);
  }

  function selectPlayer(p: Player) {
    setSelectedPlayerId(p.id);
    setPlayerName(p.name);
    setAgeInput(p.age.toString());
    setOvrInput(p.overall.toFixed(0));
    setTalent(p.talent ?? 'Normal');
    const vals: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.stats)) {
      vals[k] = Math.round(v).toString();
    }
    setStatValues(vals);
    setGains({});
    setExpandedStat(null);
    setSaved(false);
  }

  const ovrBefore = parseFloat(ovrInput) || 0;

  const { ovrBoostLo, ovrBoostHi } = useMemo(() => {
    if (!player || ovrBefore === 0) return { ovrBoostLo: null, ovrBoostHi: null };
    const baseStats: Record<string, number> = {};
    for (const [k, v] of Object.entries(statValues)) {
      const n = parseFloat(v);
      if (!isNaN(n)) baseStats[k] = n;
    }

    let boostedLo = { ...baseStats };
    let boostedHi = { ...baseStats };
    for (const [stat, g] of Object.entries(gains)) {
      const lo = parseFloat(g.lo);
      const hi = parseFloat(g.hi);
      const cur = baseStats[stat] ?? 0;
      if (!isNaN(lo)) boostedLo[stat] = Math.min(cur + lo, profile.statCap);
      if (!isNaN(hi)) boostedHi[stat] = Math.min(cur + hi, profile.statCap);
    }

    const loOvr = computeOvrWithPadding(boostedLo, ovrBefore, profile);
    const hiOvr = computeOvrWithPadding(boostedHi, ovrBefore, profile);
    return {
      ovrBoostLo: Math.round(loOvr - ovrBefore),
      ovrBoostHi: Math.round(hiOvr - ovrBefore),
    };
  }, [gains, statValues, ovrBefore, player]);

  function saveToLog() {
    if (!player) { Alert.alert('Select a player first'); return; }
    const gainEntries = Object.entries(gains)
      .filter(([, g]) => g.lo || g.hi)
      .map(([stat, g]) => ({
        stat,
        from: parseFloat(statValues[stat] ?? '0') || 0,
        gain: ((parseFloat(g.hi) || 0) + (parseFloat(g.lo) || 0)) / 2,
        isWhite: white.includes(stat),
      }));

    squadPlanService.saveRun(player.id, {
      sessions: parseInt(multiplier, 10) || 30,
      selectedStats: Object.keys(gains).filter(k => gains[k].lo || gains[k].hi),
      ovrBefore,
      ovrAfter: ovrBefore + ((ovrBoostLo ?? 0) + (ovrBoostHi ?? 0)) / 2,
      gains: gainEntries,
      label: `${coachType} ${coachCategory}`,
    });
    setSaved(true);
  }

  function renderStatRow(stat: string, isWhite: boolean) {
    const expanded = expandedStat === stat;
    const g = gains[stat] ?? { lo: '', hi: '' };
    const hasGain = g.lo || g.hi;
    const accentColor = isWhite ? theme.steelLight : theme.inkMuted;

    return (
      <View key={stat} style={{ borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
        <Pressable onPress={() => setExpandedStat(expanded ? null : stat)}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 }}>
          <View style={{ width: 8, height: 8, backgroundColor: hasGain ? accentColor : 'transparent', borderWidth: 1, borderColor: accentColor + '66', marginRight: 10 }} />
          <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.8, color: hasGain ? accentColor : theme.inkMuted, flex: 1 }}>{stat}</Text>
          {hasGain ? (
            <MonoLabel size={9} color={accentColor}>+{g.lo}–{g.hi}</MonoLabel>
          ) : (
            <MonoLabel size={9} color={theme.inkGhost}>TAP</MonoLabel>
          )}
        </Pressable>

        {expanded && (
          <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingTop: 4, backgroundColor: theme.surface2 }}>
            <View style={{ flex: 1 }}>
              <MonoLabel size={8} style={{ marginBottom: 4 }}>CURRENT</MonoLabel>
              <TextInput
                keyboardType="numeric"
                value={statValues[stat] ?? ''}
                onChangeText={v => setStatValues(prev => ({ ...prev, [stat]: v }))}
                placeholder="0"
                placeholderTextColor={theme.inkGhost}
                style={{ fontFamily: theme.mono, fontSize: 14, fontWeight: '700', color: theme.ink, borderWidth: 1, borderColor: theme.hairline2, padding: 8, textAlign: 'center' }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <MonoLabel size={8} color={theme.pos} style={{ marginBottom: 4 }}>+GAIN LO</MonoLabel>
              <TextInput
                keyboardType="numeric"
                value={g.lo}
                onChangeText={v => setGains(prev => ({ ...prev, [stat]: { ...prev[stat] ?? { lo: '', hi: '' }, lo: v } }))}
                placeholder="0"
                placeholderTextColor={theme.inkGhost}
                style={{ fontFamily: theme.mono, fontSize: 14, fontWeight: '700', color: theme.pos, borderWidth: 1, borderColor: theme.pos + '55', padding: 8, textAlign: 'center' }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <MonoLabel size={8} color={theme.pos} style={{ marginBottom: 4 }}>+GAIN HI</MonoLabel>
              <TextInput
                keyboardType="numeric"
                value={g.hi}
                onChangeText={v => setGains(prev => ({ ...prev, [stat]: { ...prev[stat] ?? { lo: '', hi: '' }, hi: v } }))}
                placeholder="0"
                placeholderTextColor={theme.inkGhost}
                style={{ fontFamily: theme.mono, fontSize: 14, fontWeight: '700', color: theme.pos, borderWidth: 1, borderColor: theme.pos + '55', padding: 8, textAlign: 'center' }}
              />
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingHorizontal: 16, paddingBottom: 40 }}>

        {/* 0. SCREENSHOT UPLOAD */}
        <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
          {capturedImage ? (
            <>
              <Image source={{ uri: capturedImage }} style={{ width: '100%', height: 220, resizeMode: 'contain', backgroundColor: theme.surface }} />
              <Pressable onPress={() => setCapturedImage(null)}
                style={{ padding: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.hairline }}>
                <MonoLabel size={9} color={theme.neg}>✕ CLEAR IMAGE</MonoLabel>
              </Pressable>
            </>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <Pressable onPress={pickFromCamera}
                style={{ flex: 1, padding: 16, alignItems: 'center', borderRightWidth: 1, borderRightColor: theme.hairline }}>
                <Text style={{ fontFamily: theme.mono, fontSize: 18, color: theme.steelLight, marginBottom: 4 }}>◉</Text>
                <MonoLabel size={9} color={theme.steelLight}>CAMERA</MonoLabel>
              </Pressable>
              <Pressable onPress={pickFromGallery}
                style={{ flex: 1, padding: 16, alignItems: 'center' }}>
                <Text style={{ fontFamily: theme.mono, fontSize: 18, color: theme.steelLight, marginBottom: 4 }}>⊞</Text>
                <MonoLabel size={9} color={theme.steelLight}>GALLERY</MonoLabel>
              </Pressable>
            </View>
          )}
        </View>

        {/* 1. COACH TYPE */}
        <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 14, marginBottom: 14 }}>
          <MonoLabel color={theme.steelLight} style={{ marginBottom: 12 }}>COACH TYPE</MonoLabel>

          <MonoLabel size={9} color={theme.inkGhost} style={{ marginBottom: 6 }}>TYPE</MonoLabel>
          <View style={{ flexDirection: 'row', gap: 5, marginBottom: 12 }}>
            {COACH_TYPES.map(t => (
              <Pressable key={t} onPress={() => setCoachType(t)}
                style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: coachType === t ? theme.ink : theme.hairline2, backgroundColor: coachType === t ? theme.ink : 'transparent' }}>
                <Text style={{ fontFamily: theme.mono, fontSize: 8, letterSpacing: 0.8, color: coachType === t ? theme.bg : theme.inkSec }}>{t}</Text>
              </Pressable>
            ))}
          </View>

          <MonoLabel size={9} color={theme.inkGhost} style={{ marginBottom: 6 }}>CATEGORY</MonoLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
            {COACH_CATEGORIES.map(c => (
              <Pressable key={c} onPress={() => setCoachCategory(c)}
                style={{ paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: coachCategory === c ? theme.steelLight : theme.hairline2, backgroundColor: coachCategory === c ? theme.steelLight + '18' : 'transparent' }}>
                <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.8, color: coachCategory === c ? theme.steelLight : theme.inkSec }}>{c}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MonoLabel style={{ flex: 1 }}>MULTIPLIER ×</MonoLabel>
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, width: 80 }}>
              <TextInput
                keyboardType="numeric"
                value={multiplier}
                onChangeText={v => setMultiplier(v.replace(/[^0-9]/g, ''))}
                placeholder="30"
                placeholderTextColor={theme.inkGhost}
                style={{ fontFamily: theme.mono, fontSize: 16, fontWeight: '700', color: theme.ink, padding: 8, textAlign: 'center' }}
              />
            </View>
          </View>
        </View>

        {/* 2. PLAYER CARD */}
        <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 14, marginBottom: 14 }}>
          <MonoLabel color={theme.steelLight} style={{ marginBottom: 12 }}>PLAYER CARD</MonoLabel>

          {squad.length > 0 && (
            <>
              <MonoLabel size={9} color={theme.inkGhost} style={{ marginBottom: 6 }}>AUTO-FILL FROM SQUAD</MonoLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row', gap: 5, marginBottom: 14 }}>
                {squad.map(p => (
                  <Chip key={p.id} active={p.id === selectedPlayerId} onPress={() => selectPlayer(p)}>
                    {p.name}
                  </Chip>
                ))}
              </ScrollView>
            </>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <View style={{ flex: 2 }}>
              <MonoLabel size={9} style={{ marginBottom: 4 }}>PLAYER NAME</MonoLabel>
              <TextInput
                value={playerName}
                onChangeText={setPlayerName}
                placeholder="Name"
                placeholderTextColor={theme.inkGhost}
                editable={!selectedPlayerId}
                style={{ fontFamily: theme.mono, fontSize: 13, color: theme.ink, borderWidth: 1, borderColor: theme.hairline2, padding: 8, opacity: selectedPlayerId ? 0.6 : 1 }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <MonoLabel size={9} style={{ marginBottom: 4 }}>AGE</MonoLabel>
              <TextInput
                keyboardType="numeric"
                value={ageInput}
                onChangeText={setAgeInput}
                placeholder="18"
                placeholderTextColor={theme.inkGhost}
                style={{ fontFamily: theme.mono, fontSize: 13, color: theme.ink, borderWidth: 1, borderColor: theme.hairline2, padding: 8, textAlign: 'center' }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <MonoLabel size={9} style={{ marginBottom: 4 }}>OVR BEFORE</MonoLabel>
              <TextInput
                keyboardType="numeric"
                value={ovrInput}
                onChangeText={setOvrInput}
                placeholder="100"
                placeholderTextColor={theme.inkGhost}
                style={{ fontFamily: theme.mono, fontSize: 13, color: theme.ink, borderWidth: 1, borderColor: theme.hairline2, padding: 8, textAlign: 'center' }}
              />
            </View>
          </View>

          {/* OVR boost preview */}
          {(ovrBoostLo != null || ovrBoostHi != null) && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <View style={{ flex: 1, padding: 8, borderWidth: 1, borderColor: theme.pos + '55', backgroundColor: theme.pos + '0d', alignItems: 'center' }}>
                <MonoLabel size={8} color={theme.pos} style={{ marginBottom: 2 }}>OVR BOOST LO</MonoLabel>
                <Text style={{ fontFamily: theme.mono, fontSize: 16, fontWeight: '700', color: theme.pos }}>{ovrBoostLo != null ? `+${ovrBoostLo}` : '—'}</Text>
              </View>
              <View style={{ flex: 1, padding: 8, borderWidth: 1, borderColor: theme.pos + '55', backgroundColor: theme.pos + '0d', alignItems: 'center' }}>
                <MonoLabel size={8} color={theme.pos} style={{ marginBottom: 2 }}>OVR BOOST HI</MonoLabel>
                <Text style={{ fontFamily: theme.mono, fontSize: 16, fontWeight: '700', color: theme.pos }}>{ovrBoostHi != null ? `+${ovrBoostHi}` : '—'}</Text>
              </View>
            </View>
          )}

          <MonoLabel size={9} color={theme.inkGhost} style={{ marginBottom: 6 }}>TALENT TIER</MonoLabel>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {TALENT_TIERS.map(t => (
              <Pressable key={t} onPress={() => setTalent(t)}
                style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderColor: talent === t ? theme.ink : theme.hairline2, backgroundColor: talent === t ? theme.ink : 'transparent' }}>
                <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.5, color: talent === t ? theme.bg : theme.inkSec }}>{TALENT_LABEL[t]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 3. HIGHLIGHTED STATS */}
        {(white.length > 0 || grey.length > 0) && (
          <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
            <View style={{ padding: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.hairline2 }}>
              <MonoLabel color={theme.steelLight} style={{ marginBottom: 4 }}>HIGHLIGHTED STATS</MonoLabel>
              <MonoLabel size={8} color={theme.inkGhost}>TAP EACH STAT SHOWN WITH A GAIN RANGE ON THE PREVIEW SCREEN</MonoLabel>
            </View>

            {white.length > 0 && (
              <>
                <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
                  <MonoLabel size={8} color={theme.steelLight}>WHITE — ESSENTIAL</MonoLabel>
                </View>
                {white.map(stat => renderStatRow(stat, true))}
              </>
            )}

            {grey.length > 0 && (
              <>
                <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
                  <MonoLabel size={8} color={theme.inkMuted}>GREY — SECONDARY / NON-ROLE</MonoLabel>
                </View>
                {grey.map(stat => renderStatRow(stat, false))}
              </>
            )}
          </View>
        )}

        {/* 4. ACTIONS */}
        <View style={{ gap: 8 }}>
          <Pressable onPress={saveToLog}
            style={{ borderWidth: 1, borderColor: saved ? theme.pos : theme.steelLight, padding: 14, alignItems: 'center', backgroundColor: saved ? theme.pos + '18' : 'transparent' }}>
            <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, color: saved ? theme.pos : theme.steelLight, fontWeight: '700' }}>
              {saved ? '✓ SAVED TO SQUAD PLAN' : '⊞ SAVE TO LOG'}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/coaches' as any)}
            style={{ borderWidth: 1, borderColor: theme.ink, padding: 14, alignItems: 'center', backgroundColor: theme.surface2 }}>
            <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, color: theme.ink, fontWeight: '700' }}>
              ▶ PROJECT
            </Text>
            <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 3 }}>GO TO COACHES TAB</MonoLabel>
          </Pressable>
        </View>

      </ScrollView>
    </View>
  );
}
