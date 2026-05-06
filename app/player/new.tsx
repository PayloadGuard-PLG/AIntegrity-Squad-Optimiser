import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { playerService } from '../../src/services/playerService';
import { validateRoleAdjacency, ROLE_CONSTRAINTS } from '../../src/utils/roleWeights';
import { TierName } from '../../src/types/resources';

const ALL_ROLES = ['GK', 'DR', 'DC', 'DL', 'DMC', 'MR', 'MC', 'ML', 'AMR', 'AMC', 'AML', 'ST'];
const TIERS: TierName[] = ['None', 'Rare', 'Elite', 'Stellar', 'Master', 'Epic', 'Legendary'];

function buildDefaultStats(roles: string[]): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const role of roles.slice(0, 3)) {
    const data = ROLE_CONSTRAINTS[role.toUpperCase()];
    if (!data) continue;
    for (const s of data.essential) stats[s] = stats[s] ?? 100;
    for (const s of data.secondary) stats[s] = stats[s] ?? 80;
  }
  return stats;
}

export default function NewPlayerScreen() {
  const [name, setName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['ST']);
  const [age, setAge] = useState('18');
  const [overall, setOverall] = useState('100');
  const [tier, setTier] = useState<TierName>('None');
  const [mutant, setMutant] = useState(false);
  const [roleError, setRoleError] = useState('');

  function toggleRole(role: string) {
    let next: string[];
    if (selectedRoles.includes(role)) {
      next = selectedRoles.filter(r => r !== role);
    } else {
      next = [...selectedRoles, role];
    }
    if (next.length > 0 && !validateRoleAdjacency(next)) {
      setRoleError(`${next.join('+')} — roles must be adjacent`);
      return;
    }
    setRoleError('');
    setSelectedRoles(next);
  }

  function save() {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    if (selectedRoles.length === 0) { Alert.alert('Select at least one role'); return; }
    const ageNum = parseInt(age, 10);
    const ovrNum = parseFloat(overall);
    if (isNaN(ageNum) || ageNum < 14 || ageNum > 40) { Alert.alert('Age must be between 14 and 40'); return; }
    if (isNaN(ovrNum) || ovrNum < 40 || ovrNum > 200) { Alert.alert('OVR must be between 40 and 200'); return; }

    playerService.create({
      name: name.trim(),
      role: selectedRoles,
      age: ageNum,
      overall: ovrNum,
      tier,
      stats: buildDefaultStats(selectedRoles),
      isMutantCandidate: mutant,
    });
    router.dismiss();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0f1117' }} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>

      {/* Name */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>PLAYER NAME</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Alpha Striker"
          placeholderTextColor="#4b5563"
          autoFocus
          style={{ backgroundColor: '#1a1d27', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
        />
      </View>

      {/* Role grid */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>POSITION(S)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ALL_ROLES.map(r => {
            const active = selectedRoles.includes(r);
            return (
              <Pressable
                key={r}
                onPress={() => toggleRole(r)}
                style={{
                  backgroundColor: active ? '#6366f1' : '#1a1d27',
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: active ? '#fff' : '#9ca3af', fontWeight: '600', fontSize: 13 }}>{r}</Text>
              </Pressable>
            );
          })}
        </View>
        {roleError ? <Text style={{ color: '#ef4444', fontSize: 12 }}>{roleError}</Text> : null}
      </View>

      {/* Age + OVR row */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>AGE</Text>
          <TextInput
            keyboardType="numeric"
            value={age}
            onChangeText={setAge}
            style={{ backgroundColor: '#1a1d27', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
          />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>OVERALL</Text>
          <TextInput
            keyboardType="decimal-pad"
            value={overall}
            onChangeText={setOverall}
            style={{ backgroundColor: '#1a1d27', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
          />
        </View>
      </View>

      {/* Tier */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>TIER</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {TIERS.map(t => (
            <Pressable
              key={t}
              onPress={() => setTier(t)}
              style={{ backgroundColor: tier === t ? '#6366f1' : '#1a1d27', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: tier === t ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: '600' }}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Mutant toggle */}
      <Pressable
        onPress={() => setMutant(v => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1d27', borderRadius: 10, padding: 14 }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: mutant ? '#f59e0b' : '#2a2d3a', alignItems: 'center', justifyContent: 'center' }}>
          {mutant && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>✓</Text>}
        </View>
        <Text style={{ color: '#e2e8f0', fontSize: 14 }}>Mutant Candidate</Text>
      </Pressable>

      {/* Save */}
      <Pressable
        onPress={save}
        style={({ pressed }) => ({
          backgroundColor: pressed ? '#4f46e5' : '#6366f1',
          borderRadius: 12,
          paddingVertical: 14,
          alignItems: 'center',
          marginTop: 8,
        })}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Save Player</Text>
      </Pressable>
    </ScrollView>
  );
}
