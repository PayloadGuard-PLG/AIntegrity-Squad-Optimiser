import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { playerService } from '../../src/services/playerService';
import { validateRoleAdjacency, isWhiteStat } from '../../src/utils/roleWeights';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { theme, TIER_COLORS } from '../../src/constants/theme';
import { TierName, TalentTier } from '../../src/types/resources';
import { useScanner } from '../../src/hooks/useScanner';
import { computeOvrFromStats } from '../../src/logic/ovrProjector';
import gameProfileJson from '../../profiles/game_2025.json';
import { GameProfile } from '../../src/types/resources';

const profile = gameProfileJson as unknown as GameProfile;

const TIERS: TierName[] = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
const TALENT_TIERS: TalentTier[] = ['Fastest', 'Fast', 'Average', 'Normal', 'Slow'];
const TALENT_LABEL: Record<TalentTier, string> = { Fastest: '×1.5', Fast: '×1.25', Average: '×1.1', Normal: '×1.0', Slow: '×0.7' };
const TALENT_INFO = 'Training rate multiplier — how quickly this player gains stats per session.\n\nFastest ×1.5 — +50% vs normal\nFast ×1.25 — +25%\nAverage ×1.1 — +10%\nNormal ×1.0 — baseline\nSlow ×0.7 — -30%\n\nDetected automatically from player card scan.';

const ROLE_GRID = [
  [null, 'DR', 'DC', 'DL'],
  ['GK', 'MR', 'MC', 'ML'],
  [null, 'AMR', 'AMC', 'AML'],
  [null, null, 'ST', null],
];

const OUTFIELD_STATS = [
  'SHOOTING',    'PASSING',
  'CROSSING',    'DRIBBLING',
  'FINISHING',   'HEADING',
  'TACKLING',    'MARKING',
  'POSITIONING', 'BRAVERY',
  'AGGRESSION',  'STRENGTH',
  'SPEED',       'FITNESS',
  'CREATIVITY',
];

const GK_STATS = [
  'REFLEXES',      'AGILITY',
  'ANTICIPATION',  'RUSHING OUT',
  'COMMUNICATION', 'THROWING',
  'KICKING',       'PUNCHING',
  'AERIAL REACH',  'CONCENTRATION',
  'FITNESS',       'STRENGTH',
  'AGGRESSION',    'SPEED',
  'CREATIVITY',
];

// DEF / ATT / PHY groupings for the scanned stats display
const STAT_COLUMNS = {
  DEF: ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION'],
  ATT: ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING', 'THROWING', 'KICKING', 'PUNCHING', 'AERIAL REACH', 'CONCENTRATION'],
  PHY: ['FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY'],
};

const COL_COLORS = {
  DEF: '#4A7FC1',
  ATT: '#7C3AED',
  PHY: '#C05621',
} as const;

const inputStyle = {
  backgroundColor: theme.surface,
  borderWidth: 1,
  borderColor: theme.hairline2,
  color: theme.ink,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
  fontFamily: theme.mono,
};

export default function NewPlayerScreen() {
  const [name, setName] = useState('');
  const [positionStates, setPositionStates] = useState<Record<string, 0 | 1 | 2>>({});
  const selectedRoles = Object.entries(positionStates).filter(([, s]) => s === 2).map(([r]) => r);
  const [age, setAge] = useState('18');
  const [overall, setOverall] = useState('100');
  const [ovrIsAuto, setOvrIsAuto] = useState(false);
  const [tier, setTier] = useState<TierName>('T0');
  const [talent, setTalent] = useState<TalentTier>('Normal');
  const [mutant, setMutant] = useState(false);
  const [roleError, setRoleError] = useState('');
  const [statInputs, setStatInputs] = useState<Record<string, string>>({});
  const [scanned, setScanned] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  const { scanPlayerScreenshot, isScanning, scanError } = useScanner();

  const isGK = selectedRoles.includes('GK');
  const statList = isGK ? GK_STATS : OUTFIELD_STATS;

  // Auto-compute OVR from scanned stats
  function recomputeOvr(inputs: Record<string, string>) {
    const statsObj: Record<string, number> = {};
    for (const [k, v] of Object.entries(inputs)) {
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) statsObj[k] = n;
    }
    if (Object.keys(statsObj).length >= 10) {
      const enteredVals = Object.values(statsObj);
      const mean = Math.floor(enteredVals.reduce((a, b) => a + b, 0) / enteredVals.length);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fakePlayer = { stats: statsObj, overall: mean, role: selectedRoles.length > 0 ? selectedRoles : ['ST'] } as any;
      const auto = computeOvrFromStats(fakePlayer, profile);
      setOverall(auto.toFixed(1));
      setOvrIsAuto(true);
    }
  }

  async function pickAndScan() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo library access in settings.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const uri = result.assets[0].uri;
      setScanned(false);
      setScanMsg('');

      const data = await scanPlayerScreenshot(uri);
      if (!data) return;

      if (data.name) setName(data.name);
      if (data.age) setAge(data.age.toString());
      const TIER_MAP: Record<string, TierName> = {
        None: 'T0', Rare: 'T1', Elite: 'T2', Stellar: 'T3', Master: 'T4', Epic: 'T5', Legendary: 'T6',
        T0: 'T0', T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5', T6: 'T6',
      };
      setTier(TIER_MAP[data.tier ?? ''] ?? 'T0');
      const TALENT_MAP: Record<string, TalentTier> = {
        FT1: 'Fastest', FT2: 'Fast', FT3: 'Average', Normal: 'Normal', Slow: 'Slow',
        Fastest: 'Fastest', Fast: 'Fast', Average: 'Average',
      };
      if (data.talent) setTalent(TALENT_MAP[data.talent] ?? 'Normal');
      if (data.roles && data.roles.length > 0) setPositionStates(Object.fromEntries(data.roles.map(r => [r, 2 as const])));

      if (data.stats && Object.keys(data.stats).length > 0) {
        const inputs = Object.fromEntries(
          Object.entries(data.stats).map(([k, v]) => [k, Math.round(v).toString()])
        );
        setStatInputs(inputs);
        recomputeOvr(inputs);
        setScanned(true);
        setScanMsg(`SCANNED ${Object.keys(inputs).length} STATS — REVIEW AND SAVE.`);
      } else if (data.overall) {
        setOverall(data.overall.toString());
        setOvrIsAuto(false);
        setScanMsg('OVR FOUND — NO STATS DETECTED. ENTER MANUALLY.');
      } else {
        setScanMsg('NO STATS FOUND — TRY A CLEARER SCREENSHOT.');
      }
    } catch (err) {
      setScanMsg('SCAN ERROR — TRY AGAIN.');
    }
  }

  function toggleRole(role: string | null) {
    if (!role) return;
    setRoleError('');

    const current = (positionStates[role] ?? 0) as 0 | 1 | 2;

    // Active → off (deselect entirely)
    if (current === 2) {
      setPositionStates(prev => ({ ...prev, [role]: 0 }));
      return;
    }

    // Off → partial, or partial → active
    const next = (current + 1) as 1 | 2;

    if (next === 2) {
      // Activating — run all constraints
      if (role === 'GK') {
        if (Object.entries(positionStates).some(([r, s]) => r !== 'GK' && s === 2)) {
          setRoleError('GK CANNOT COMBINE');
          return;
        }
        // Demote any other active roles to partial so GK stands alone
        setPositionStates(prev => {
          const updated: Record<string, 0 | 1 | 2> = {};
          for (const [r, s] of Object.entries(prev)) {
            updated[r] = r === 'GK' ? 2 : (s === 2 ? 1 : s as 0 | 1);
          }
          updated['GK'] = 2;
          return updated;
        });
        return;
      }
      if ((positionStates['GK'] ?? 0) === 2) {
        setRoleError('GK CANNOT COMBINE');
        return;
      }
      const newActive = [...selectedRoles, role];
      if (newActive.length > 3) { setRoleError('MAX 3 ROLES'); return; }
      if (!validateRoleAdjacency(newActive)) { setRoleError('NOT ADJACENT'); return; }
    }

    setPositionStates(prev => ({ ...prev, [role]: next }));
  }

  function save() {
    if (!name.trim()) { Alert.alert('NAME REQUIRED'); return; }
    if (selectedRoles.length === 0) { Alert.alert('PICK A ROLE'); return; }
    const ageNum = parseInt(age, 10);
    const ovrNum = parseFloat(overall);
    if (isNaN(ageNum) || ageNum < 14 || ageNum > 40) { Alert.alert('Age 14–40'); return; }
    if (isNaN(ovrNum) || ovrNum <= 0) { Alert.alert('Enter a valid OVR'); return; }

    const statsObj: Record<string, number> = {};
    for (const stat of statList) {
      const v = parseFloat(statInputs[stat] ?? '');
      if (!isNaN(v) && v > 0) statsObj[stat] = v;
    }

    try {
      playerService.create({
        name: name.trim(),
        role: selectedRoles,
        age: ageNum,
        overall: ovrNum,
        tier,
        talent,
        stats: statsObj,
        isMutantCandidate: mutant,
      });
      router.back();
    } catch (err) {
      Alert.alert('SAVE FAILED', String(err));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader title="NEW ASSET" subtitle="INTAKE FORM" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingHorizontal: 16, paddingBottom: 40 }}>

        {/* STAT PROFILE — scan section */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <MonoLabel color={theme.steelLight} style={{ flex: 1 }}>STAT PROFILE</MonoLabel>
          <MonoLabel size={8} color={theme.inkGhost}>FROM SCREENSHOT · ● WHITE</MonoLabel>
        </View>

        <Pressable onPress={pickAndScan}
          disabled={isScanning}
          style={{ borderWidth: 1, borderColor: theme.steelLight, padding: 18, alignItems: 'center', marginBottom: 12, backgroundColor: theme.surface2 }}>
          {isScanning ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color={theme.steelLight} size="small" />
              <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.5, color: theme.steelLight }}>SCANNING...</Text>
            </View>
          ) : (
            <>
              <Text style={{ fontFamily: theme.mono, fontSize: 22, color: theme.steelLight, marginBottom: 6 }}>⊞</Text>
              <Text style={{ fontFamily: theme.mono, fontSize: 12, letterSpacing: 1.5, color: theme.steelLight, fontWeight: '700' }}>SCAN PLAYER CARD</Text>
              <MonoLabel size={9} color={theme.inkGhost} style={{ marginTop: 4 }}>Import stats automatically from a screenshot</MonoLabel>
            </>
          )}
        </Pressable>

        {scanMsg !== '' && (
          <View style={{ padding: 10, borderWidth: 1, borderColor: (scanned ? theme.pos : theme.neg) + '55', backgroundColor: (scanned ? theme.pos : theme.neg) + '0d', marginBottom: 8 }}>
            <MonoLabel size={9} color={scanned ? theme.pos : theme.neg}>{scanMsg}</MonoLabel>
            {scanned && <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 3 }}>OR ENTER MANUALLY BELOW · OVR AUTO-COMPUTES · PICK ROLE FOR WHITE/GREY</MonoLabel>}
          </View>
        )}

        {scanError && (
          <MonoLabel size={9} color={theme.neg} style={{ marginBottom: 8 }}>⚠ {scanError}</MonoLabel>
        )}

        {/* Scanned stats preview — DEF / ATT / PHY 3-col */}
        {scanned && Object.keys(statInputs).length > 0 && (
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 16 }}>
            {(['DEF', 'ATT', 'PHY'] as const).map(col => {
              const cc = COL_COLORS[col];
              return (
                <View key={col} style={{ flex: 1, borderWidth: 1, borderColor: cc }}>
                  <View style={{ padding: 6, borderBottomWidth: 1, borderBottomColor: cc, backgroundColor: cc + '28' }}>
                    <MonoLabel size={8} color={cc}>{col}</MonoLabel>
                  </View>
                  {STAT_COLUMNS[col].filter(s => statInputs[s]).map(s => {
                    const white = isWhiteStat(selectedRoles, s);
                    return (
                      <View key={s} style={{
                        paddingHorizontal: 8, paddingVertical: 7,
                        borderBottomWidth: 1, borderBottomColor: white ? cc + '44' : theme.hairline,
                        borderLeftWidth: white ? 3 : 1,
                        borderLeftColor: white ? cc : theme.hairline2,
                        backgroundColor: white ? cc + '1a' : cc + '0a',
                      }}>
                        <MonoLabel size={7} color={white ? cc : theme.inkMuted}>{s}</MonoLabel>
                        <Text style={{ fontFamily: theme.mono, fontSize: 13, fontWeight: white ? '700' : '400', color: white ? theme.ink : theme.inkMuted, marginTop: 2 }}>
                          {statInputs[s]}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}


        {/* IDENTITY */}
        <MonoLabel color={theme.steelLight} style={{ marginBottom: 8, marginTop: 4 }}>IDENTITY</MonoLabel>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor={theme.inkGhost}
          autoFocus
          style={{ ...inputStyle, fontFamily: theme.display, fontSize: 15, marginBottom: 8 }}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          <View style={{ flex: 1 }}>
            <MonoLabel size={9} style={{ marginBottom: 4 }}>AGE</MonoLabel>
            <TextInput
              keyboardType="numeric"
              value={age}
              onChangeText={setAge}
              style={inputStyle}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 }}>
              <MonoLabel size={9}>OVR</MonoLabel>
              {ovrIsAuto && <MonoLabel size={7} color={theme.pos}>(AUTO)</MonoLabel>}
            </View>
            <TextInput
              keyboardType="decimal-pad"
              value={overall}
              onChangeText={v => { setOverall(v); setOvrIsAuto(false); }}
              style={inputStyle}
            />
          </View>
        </View>

        {/* POSITION GRID */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <MonoLabel color={theme.steelLight}>POSITION GRID</MonoLabel>
          <MonoLabel size={9} color={theme.inkMuted}>· MAX 3</MonoLabel>
        </View>
        <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 4, backgroundColor: theme.surface }}>
          {ROLE_GRID.map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', borderBottomWidth: ri < ROLE_GRID.length - 1 ? 1 : 0, borderBottomColor: theme.hairline }}>
              {row.map((role, ci) => {
                const st = (positionStates[role ?? ''] ?? 0) as 0 | 1 | 2;
                return (
                  <Pressable
                    key={`${ri}-${ci}`}
                    onPress={() => toggleRole(role)}
                    disabled={role === null}
                    style={{
                      flex: 1, paddingVertical: 13, alignItems: 'center',
                      backgroundColor: st === 2 ? theme.ink : st === 1 ? theme.surface3 : 'transparent',
                      borderRightWidth: ci < 3 ? 1 : 0, borderRightColor: theme.hairline,
                    }}
                  >
                    <Text style={{
                      fontFamily: theme.mono, fontSize: 11, letterSpacing: 1,
                      color: role
                        ? (st === 2 ? theme.bg : st === 1 ? theme.inkSec : theme.hairline2)
                        : 'transparent',
                    }}>{role ?? '·'}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        {roleError ? (
          <MonoLabel size={10} color={theme.neg} style={{ marginBottom: 6 }}>⚠ {roleError}</MonoLabel>
        ) : null}

        {/* TIER */}
        <View style={{ marginTop: 18 }}>
          <MonoLabel color={theme.steelLight} style={{ marginBottom: 8 }}>TIER</MonoLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
            {TIERS.map(t => {
              const c = TIER_COLORS[t] ?? theme.inkMuted;
              const sel = tier === t;
              return (
                <Pressable key={t} onPress={() => setTier(t)} style={{
                  paddingHorizontal: 11, paddingVertical: 7,
                  backgroundColor: sel ? c : 'transparent',
                  borderWidth: 1, borderColor: sel ? c : c + '55',
                }}>
                  <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: sel ? theme.bg : c }}>
                    {t.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* TALENT */}
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <MonoLabel color={theme.steelLight}>TRAINING RATE</MonoLabel>
            <Pressable onPress={() => Alert.alert('Training Rate', TALENT_INFO)} style={{ marginLeft: 8, width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.steelLight, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: theme.mono, fontSize: 9, color: theme.steelLight }}>?</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {TALENT_TIERS.map(t => {
              const sel = talent === t;
              return (
                <Pressable key={t} onPress={() => setTalent(t)} style={{
                  flex: 1, paddingVertical: 9, alignItems: 'center',
                  borderWidth: 1, borderColor: sel ? theme.ink : theme.hairline2,
                  backgroundColor: sel ? theme.ink : 'transparent',
                }}>
                  <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: sel ? theme.bg : theme.inkSec }}>
                    {TALENT_LABEL[t]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* MUTANT TOGGLE */}
        <Pressable onPress={() => setMutant(v => !v)} style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          backgroundColor: mutant ? theme.surface2 : theme.surface,
          borderWidth: 1, borderColor: mutant ? theme.hot : theme.hairline2,
          padding: 12, marginBottom: 20,
        }}>
          <View style={{ width: 14, height: 14, backgroundColor: mutant ? theme.hot : 'transparent', borderWidth: 1, borderColor: mutant ? theme.hot : theme.inkMuted }} />
          <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.4, color: mutant ? theme.hot : theme.inkSec }}>
            ★ MUTANT CANDIDATE
          </Text>
        </Pressable>

        {/* STATS GRID */}
        {selectedRoles.length > 0 && (
          <>
            <MonoLabel color={theme.steelLight} style={{ marginBottom: 8 }}>STATS</MonoLabel>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 24 }}>
              {(['DEF', 'ATT', 'PHY'] as const).map(col => {
                const cc = COL_COLORS[col];
                const colStats = STAT_COLUMNS[col].filter(s => (statList as readonly string[]).includes(s));
                return (
                  <View key={col} style={{ flex: 1, borderWidth: 1, borderColor: cc + '55' }}>
                    <View style={{ paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: cc, backgroundColor: cc + '28' }}>
                      <MonoLabel size={8} color={cc}>{col}</MonoLabel>
                    </View>
                    {colStats.map(s => {
                      const w = isWhiteStat(selectedRoles, s);
                      return (
                        <View key={s} style={{
                          paddingHorizontal: 8, paddingVertical: 7,
                          borderBottomWidth: 1,
                          borderBottomColor: w ? cc + '44' : theme.hairline,
                          borderLeftWidth: w ? 3 : 1,
                          borderLeftColor: w ? cc : theme.hairline2,
                          backgroundColor: w ? cc + '1a' : cc + '0a',
                        }}>
                          <MonoLabel size={7} color={w ? cc : theme.inkMuted}>{s}</MonoLabel>
                          <TextInput
                            keyboardType="numeric"
                            value={statInputs[s] ?? ''}
                            onChangeText={v => {
                              const next = { ...statInputs, [s]: v };
                              setStatInputs(next);
                              recomputeOvr(next);
                            }}
                            placeholder="—"
                            placeholderTextColor={theme.inkMuted}
                            style={{ padding: 0, marginTop: 2, color: w ? theme.ink : theme.inkMuted, fontSize: 14, fontFamily: theme.mono, fontWeight: w ? '700' : '400' }}
                          />
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* SAVE CTA */}
        <Pressable onPress={save} style={{ backgroundColor: theme.ink, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, fontWeight: '600', color: theme.bg }}>SAVE</Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}
