import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { playerService } from '../../src/services/playerService';
import { validateRoleAdjacency, isWhiteStat } from '../../src/utils/roleWeights';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { theme, TIER_COLORS } from '../../src/constants/theme';
import { TierName, TalentTier } from '../../src/types/resources';

const TIERS: TierName[] = ['None', 'Rare', 'Elite', 'Stellar', 'Master', 'Epic', 'Legendary'];
const TALENT_TIERS: TalentTier[] = ['FT1', 'FT2', 'FT3', 'Normal', 'Slow'];
const TALENT_LABEL: Record<TalentTier, string> = { FT1: 'FT1', FT2: 'FT2', FT3: 'FT3', Normal: 'NORM', Slow: 'SLOW' };

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
  'AERIAL REACH',  'FITNESS',
];

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

export default function EditPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['ST']);
  const [age, setAge] = useState('18');
  const [overall, setOverall] = useState('100');
  const [tier, setTier] = useState<TierName>('None');
  const [talent, setTalent] = useState<TalentTier>('Normal');
  const [mutant, setMutant] = useState(false);
  const [roleError, setRoleError] = useState('');
  const [statInputs, setStatInputs] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<import('../../src/database/playerSchema').PlayerSnapshot | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const isGK = selectedRoles.includes('GK');
  const statList = isGK ? GK_STATS : OUTFIELD_STATS;

  useEffect(() => {
    if (!id) return;
    const p = playerService.getById(id);
    if (!p) return;
    setName(p.name);
    setSelectedRoles(p.role);
    setAge(p.age.toString());
    setOverall(p.overall.toString());
    setTier(p.tier);
    setTalent(p.talent ?? 'Normal');
    setMutant(p.isMutantCandidate);
    setSnapshot(p.snapshot ?? null);
    if (p.stats && Object.keys(p.stats).length > 0) {
      setStatInputs(Object.fromEntries(Object.entries(p.stats).map(([k, v]) => [k, v.toString()])));
    }
  }, [id, reloadKey]);

  function toggleRole(role: string | null) {
    if (!role) return;
    setRoleError('');
    let next: string[];
    if (selectedRoles.includes(role)) {
      next = selectedRoles.filter(r => r !== role);
    } else {
      if (role === 'GK') { setSelectedRoles(['GK']); return; }
      if (selectedRoles.includes('GK')) { setRoleError('GK CANNOT COMBINE'); return; }
      next = [...selectedRoles, role];
    }
    if (next.length > 0 && !validateRoleAdjacency(next)) {
      setRoleError('NOT ADJACENT');
      return;
    }
    setSelectedRoles(next);
  }

  function save() {
    if (!id || !name.trim()) { Alert.alert('NAME REQUIRED'); return; }
    const ageNum = parseInt(age, 10);
    const ovrNum = parseFloat(overall);
    if (isNaN(ageNum) || ageNum < 14 || ageNum > 40) { Alert.alert('Age 14–40'); return; }
    if (isNaN(ovrNum) || ovrNum <= 0) { Alert.alert('Enter a valid OVR'); return; }

    const statsObj: Record<string, number> = {};
    for (const stat of statList) {
      const v = parseFloat(statInputs[stat] ?? '');
      if (!isNaN(v) && v > 0) statsObj[stat] = v;
    }

    playerService.update({
      id,
      name: name.trim(),
      role: selectedRoles,
      age: ageNum,
      overall: ovrNum,
      tier,
      talent,
      stats: statsObj,
      isMutantCandidate: mutant,
      snapshot,
    });
    router.back();
  }

  function confirmRevert() {
    if (!id || !snapshot) return;
    Alert.alert(
      'REVERT CARD',
      `Restore pre-apply snapshot?\n\nOVR ${snapshot.overall.toFixed(1)} · ${snapshot.tier}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revert',
          style: 'destructive',
          onPress: () => {
            playerService.revertToSnapshot(id);
            setSnapshot(null);
            setReloadKey(k => k + 1);
          },
        },
      ]
    );
  }

  function confirmDelete() {
    Alert.alert('DELETE ASSET', `Remove ${name} from your squad?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { if (id) { playerService.delete(id); router.dismiss(); } } },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader title="EDIT ASSET" subtitle="PROFILE · MUTABLE" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingHorizontal: 16, paddingBottom: 40 }}>

        {/* REVERT SNAPSHOT BANNER */}
        {snapshot && (
          <Pressable
            onPress={confirmRevert}
            style={{ borderWidth: 1, borderColor: theme.hot, backgroundColor: theme.hot + '18', padding: 12, marginBottom: 16 }}>
            <MonoLabel size={9} color={theme.hot} style={{ marginBottom: 2 }}>PRE-APPLY SNAPSHOT AVAILABLE</MonoLabel>
            <Text style={{ fontFamily: theme.mono, fontSize: 10, color: theme.hot }}>
              OVR {snapshot.overall.toFixed(1)} · {snapshot.tier.toUpperCase()} — TAP TO REVERT
            </Text>
          </Pressable>
        )}

        {/* IDENTITY */}
        <MonoLabel color={theme.steelLight} style={{ marginBottom: 8 }}>IDENTITY</MonoLabel>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor={theme.inkGhost}
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
            <MonoLabel size={9} style={{ marginBottom: 4 }}>OVR</MonoLabel>
            <TextInput
              keyboardType="decimal-pad"
              value={overall}
              onChangeText={setOverall}
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
                const sel = role !== null && selectedRoles.includes(role);
                return (
                  <Pressable
                    key={`${ri}-${ci}`}
                    onPress={() => toggleRole(role)}
                    disabled={role === null}
                    style={{
                      flex: 1,
                      paddingVertical: 13,
                      alignItems: 'center',
                      backgroundColor: sel ? theme.ink : 'transparent',
                      borderRightWidth: ci < 3 ? 1 : 0,
                      borderRightColor: theme.hairline,
                    }}
                  >
                    <Text style={{
                      fontFamily: theme.mono, fontSize: 11, letterSpacing: 1,
                      color: role ? (sel ? theme.bg : theme.inkSec) : 'transparent',
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
          <MonoLabel color={theme.steelLight} style={{ marginBottom: 8 }}>TALENT TIER</MonoLabel>
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
          <View style={{
            width: 14, height: 14,
            backgroundColor: mutant ? theme.hot : 'transparent',
            borderWidth: 1, borderColor: mutant ? theme.hot : theme.inkMuted,
          }} />
          <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.4, color: mutant ? theme.hot : theme.inkSec }}>
            ★ MUTANT CANDIDATE
          </Text>
        </Pressable>

        {/* STATS GRID */}
        {selectedRoles.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <MonoLabel color={theme.steelLight}>STATS</MonoLabel>
              <MonoLabel size={9} color={theme.inkMuted}>· ● ESSENTIAL</MonoLabel>
            </View>
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 24 }}>
              {statList.map((stat, i) => {
                const isRight = i % 2 === 1;
                const isLastRow = i >= statList.length - 2;
                if (isRight) return null;
                const nextStat = statList[i + 1];
                return (
                  <View key={stat} style={{ flexDirection: 'row', borderBottomWidth: isLastRow ? 0 : 1, borderBottomColor: theme.hairline }}>
                    {[stat, nextStat].map((s, idx) => {
                      if (!s) return <View key={idx} style={{ flex: 1 }} />;
                      const w = isWhiteStat(selectedRoles, s);
                      return (
                        <View key={s} style={{
                          flex: 1, padding: 10,
                          borderRightWidth: idx === 0 ? 1 : 0, borderRightColor: theme.hairline,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                            <Text style={{ fontSize: 8, color: w ? theme.steelLight : theme.inkGhost }}>●</Text>
                            <MonoLabel size={8} color={w ? theme.steelLight : theme.inkMuted}>{s}</MonoLabel>
                          </View>
                          <TextInput
                            keyboardType="numeric"
                            value={statInputs[s] ?? ''}
                            onChangeText={v => setStatInputs(prev => ({ ...prev, [s]: v }))}
                            placeholder="0"
                            placeholderTextColor={theme.inkGhost}
                            style={{
                              backgroundColor: 'transparent', padding: 0,
                              color: theme.ink, fontSize: 15, fontFamily: theme.display, fontWeight: '300',
                            }}
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

        {/* CTAs */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={save} style={{
            flex: 1, backgroundColor: theme.ink, paddingVertical: 13,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, fontWeight: '600', color: theme.bg }}>
              SAVE
            </Text>
          </Pressable>
          <Pressable onPress={confirmDelete} style={{
            width: 100, paddingVertical: 13,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: theme.neg + '55',
          }}>
            <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, fontWeight: '600', color: theme.neg }}>
              DELETE
            </Text>
          </Pressable>
        </View>

      </ScrollView>
    </View>
  );
}
