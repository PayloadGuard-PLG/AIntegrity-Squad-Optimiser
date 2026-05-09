import { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { playerService } from '../../src/services/playerService';
import { validateRoleAdjacency, isWhiteStat, OUTFIELD_STATS, GK_STATS } from '../../src/utils/roleWeights';
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
  const [name, setName]             = useState('');
  const [selectedRoles, setRoles]   = useState<string[]>([]);
  const [age, setAge]               = useState('18');
  const [overall, setOverall]       = useState('');
  const [ovrManual, setOvrManual]   = useState(false); // true once user edits OVR field directly
  const [tier, setTier]             = useState<TierName>('None');
  const [talent, setTalent]         = useState<TalentTier>('Normal');
  const [mutant, setMutant]         = useState(false);
  const [roleError, setRoleError]   = useState('');
  const [statInputs, setStatInputs] = useState<Record<string, string>>({});

  const isGK = selectedRoles.includes('GK');
  const statList = isGK ? GK_STATS : OUTFIELD_STATS;

  // Auto-OVR: floor(sum of all 15 stats / 15). Only suggests when ≥10 stats entered.
  const computedOvr = useMemo(() => {
    const values = statList.map(s => parseFloat(statInputs[s] ?? '') || 0);
    const filled = values.filter(v => v > 0).length;
    if (filled < 10) return null;
    return Math.floor(values.reduce((a, b) => a + b, 0) / 15);
  }, [statInputs, statList]);

  function toggleRole(role: string | null) {
    if (!role) return;
    setRoleError('');
    let next: string[];
    if (selectedRoles.includes(role)) {
      next = selectedRoles.filter(r => r !== role);
    } else {
      if (role === 'GK') { setRoles(['GK']); return; }
      if (selectedRoles.includes('GK')) { setRoleError('GK CANNOT COMBINE'); return; }
      next = [...selectedRoles, role];
    }
    if (next.length > 0 && !validateRoleAdjacency(next)) {
      setRoleError('NOT ADJACENT');
      return;
    }
    setRoles(next);
  }

  function save() {
    if (!name.trim()) { Alert.alert('NAME REQUIRED'); return; }
    if (selectedRoles.length === 0) { Alert.alert('PICK A ROLE'); return; }
    const ageNum = parseInt(age, 10);
    const ovrNum = ovrManual ? parseFloat(overall) : (computedOvr ?? parseFloat(overall));
    if (isNaN(ageNum) || ageNum < 14 || ageNum > 40) { Alert.alert('Age 14–40'); return; }
    if (isNaN(ovrNum) || ovrNum <= 0) { Alert.alert('Enter stats or an OVR value'); return; }

    const statsObj: Record<string, number> = {};
    for (const stat of statList) {
      const v = parseFloat(statInputs[stat] ?? '');
      if (!isNaN(v) && v > 0) statsObj[stat] = v;
    }

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
    router.dismiss();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader title="NEW ASSET" subtitle="INTAKE FORM" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingHorizontal: 16, paddingBottom: 40 }}>

        {/* IDENTITY */}
        <MonoLabel color={theme.steelLight} style={{ marginBottom: 8 }}>IDENTITY</MonoLabel>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Player name"
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
            <MonoLabel size={9} style={{ marginBottom: 4 }}>
              OVR{computedOvr && !ovrManual ? ' (AUTO)' : ''}
            </MonoLabel>
            <TextInput
              keyboardType="decimal-pad"
              value={ovrManual ? overall : (computedOvr != null ? String(computedOvr) : overall)}
              onChangeText={v => { setOverall(v); setOvrManual(true); }}
              placeholder={computedOvr != null ? String(computedOvr) : '—'}
              placeholderTextColor={theme.inkGhost}
              style={{
                ...inputStyle,
                borderColor: computedOvr && !ovrManual ? theme.pos + '66' : theme.hairline2,
                color: computedOvr && !ovrManual ? theme.pos : theme.ink,
              }}
            />
            {computedOvr && ovrManual && (
              <Pressable onPress={() => { setOvrManual(false); setOverall(''); }}>
                <MonoLabel size={7} color={theme.pos} style={{ marginTop: 3 }}>↩ USE AUTO ({computedOvr})</MonoLabel>
              </Pressable>
            )}
          </View>
        </View>

        {/* GAME CARD STATS — shown first, drives OVR auto-compute */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <MonoLabel color={theme.steelLight}>STAT PROFILE</MonoLabel>
          <MonoLabel size={8} color={theme.inkGhost}>FROM GAME CARD · ● WHITE</MonoLabel>
        </View>

        {/* snapshot banner */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          borderWidth: 1, borderColor: theme.steelDeep,
          backgroundColor: theme.steelDeep + '22',
          padding: 10, marginBottom: 12,
        }}>
          <Text style={{ fontFamily: theme.mono, fontSize: 14, color: theme.steelLight }}>⊕</Text>
          <View>
            <MonoLabel size={9} color={theme.steelLight}>ENTER ALL 15 STATS FROM PLAYER CARD SCREENSHOT</MonoLabel>
            <MonoLabel size={7} color={theme.inkGhost} style={{ marginTop: 2 }}>
              OVR AUTO-COMPUTES · PICK ROLE FOR WHITE/GREY COLOURING
            </MonoLabel>
          </View>
        </View>

        <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 20 }}>
          {statList.map((stat, i) => {
            if (i % 2 === 1) return null;
            const nextStat = statList[i + 1];
            const isLastRow = i >= statList.length - 2;
            return (
              <View key={stat} style={{ flexDirection: 'row', borderBottomWidth: isLastRow ? 0 : 1, borderBottomColor: theme.hairline }}>
                {[stat, nextStat].map((s, idx) => {
                  if (!s) return <View key={idx} style={{ flex: 1 }} />;
                  const w = selectedRoles.length > 0 ? isWhiteStat(selectedRoles, s) : false;
                  return (
                    <View key={s} style={{
                      flex: 1, padding: 10,
                      borderRightWidth: idx === 0 ? 1 : 0, borderRightColor: theme.hairline,
                      backgroundColor: w ? theme.steelDeep + '18' : 'transparent',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        {selectedRoles.length > 0 && (
                          <Text style={{ fontSize: 8, color: w ? theme.steelLight : theme.inkGhost }}>●</Text>
                        )}
                        <MonoLabel size={8} color={w ? theme.steelLight : theme.inkMuted}>{s}</MonoLabel>
                      </View>
                      <TextInput
                        keyboardType="numeric"
                        value={statInputs[s] ?? ''}
                        onChangeText={v => setStatInputs(prev => ({ ...prev, [s]: v.replace(/[^0-9]/g, '') }))}
                        placeholder="—"
                        placeholderTextColor={theme.inkGhost}
                        style={{
                          backgroundColor: 'transparent', padding: 0,
                          color: theme.ink, fontSize: 16, fontFamily: theme.display, fontWeight: '300',
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            );
          })}
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
                      flex: 1, paddingVertical: 13, alignItems: 'center',
                      backgroundColor: sel ? theme.ink : 'transparent',
                      borderRightWidth: ci < 3 ? 1 : 0, borderRightColor: theme.hairline,
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

        {/* SAVE CTA */}
        <Pressable onPress={save} style={{
          backgroundColor: theme.ink, paddingVertical: 13,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, fontWeight: '600', color: theme.bg }}>
            SAVE TO SQUAD
          </Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}
