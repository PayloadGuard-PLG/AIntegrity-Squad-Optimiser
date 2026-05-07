import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { playerService } from '../../src/services/playerService';
import { validateRoleAdjacency, isWhiteStat } from '../../src/utils/roleWeights';
import { TierName } from '../../src/types/resources';

const ALL_ROLES = ['GK', 'DR', 'DC', 'DL', 'DMC', 'MR', 'MC', 'ML', 'AMR', 'AMC', 'AML', 'ST'];
const TIERS: TierName[] = ['None', 'Rare', 'Elite', 'Stellar', 'Master', 'Epic', 'Legendary'];

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
  'REFLEXES',     'AGILITY',
  'ANTICIPATION', 'RUSHING OUT',
  'COMMUNICATION','THROWING',
  'KICKING',      'PUNCHING',
  'AERIAL REACH', 'FITNESS',
];

export default function EditPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['ST']);
  const [age, setAge] = useState('18');
  const [overall, setOverall] = useState('100');
  const [tier, setTier] = useState<TierName>('None');
  const [mutant, setMutant] = useState(false);
  const [roleError, setRoleError] = useState('');
  const [statInputs, setStatInputs] = useState<Record<string, string>>({});

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
    setMutant(p.isMutantCandidate);
    if (p.stats && Object.keys(p.stats).length > 0) {
      setStatInputs(Object.fromEntries(Object.entries(p.stats).map(([k, v]) => [k, v.toString()])));
    }
  }, [id]);

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
    if (!id || !name.trim()) { Alert.alert('Name required'); return; }
    const ageNum = parseInt(age, 10);
    const ovrNum = parseFloat(overall);
    if (isNaN(ageNum) || ageNum < 14 || ageNum > 40) { Alert.alert('Age must be between 14 and 40'); return; }
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
      stats: statsObj,
      isMutantCandidate: mutant,
    });
    router.dismiss();
  }

  function confirmDelete() {
    Alert.alert('Delete Player', `Remove ${name} from your squad?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { if (id) { playerService.delete(id); router.dismiss(); } } },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0f1117' }} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>

      <View style={{ gap: 6 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>PLAYER NAME</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={{ backgroundColor: '#1a1d27', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>POSITION(S)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ALL_ROLES.map(r => {
            const active = selectedRoles.includes(r);
            return (
              <Pressable key={r} onPress={() => toggleRole(r)} style={{ backgroundColor: active ? '#6366f1' : '#1a1d27', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: active ? '#fff' : '#9ca3af', fontWeight: '600', fontSize: 13 }}>{r}</Text>
              </Pressable>
            );
          })}
        </View>
        {roleError ? <Text style={{ color: '#ef4444', fontSize: 12 }}>{roleError}</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>AGE</Text>
          <TextInput keyboardType="numeric" value={age} onChangeText={setAge}
            style={{ backgroundColor: '#1a1d27', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>OVERALL</Text>
          <TextInput keyboardType="decimal-pad" value={overall} onChangeText={setOverall}
            style={{ backgroundColor: '#1a1d27', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }} />
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>TIER</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {TIERS.map(t => (
            <Pressable key={t} onPress={() => setTier(t)} style={{ backgroundColor: tier === t ? '#6366f1' : '#1a1d27', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: tier === t ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: '600' }}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable onPress={() => setMutant(v => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1d27', borderRadius: 10, padding: 14 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: mutant ? '#f59e0b' : '#2a2d3a', alignItems: 'center', justifyContent: 'center' }}>
          {mutant && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>✓</Text>}
        </View>
        <Text style={{ color: '#e2e8f0', fontSize: 14 }}>Mutant Candidate</Text>
      </Pressable>

      {/* Individual Stats */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>INDIVIDUAL STATS</Text>
        <Text style={{ color: '#6b7280', fontSize: 11 }}>Purple = white (essential)  ·  Grey = secondary. Leave blank to skip drill projection.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {statList.map(stat => {
            const white = isWhiteStat(selectedRoles, stat);
            return (
              <View key={stat} style={{ width: '47%', gap: 4 }}>
                <Text style={{ color: white ? '#a5b4fc' : '#6b7280', fontSize: 11, fontWeight: '600' }}>{stat}</Text>
                <TextInput
                  keyboardType="numeric"
                  value={statInputs[stat] ?? ''}
                  onChangeText={v => setStatInputs(prev => ({ ...prev, [stat]: v }))}
                  placeholder="—"
                  placeholderTextColor="#4b5563"
                  style={{
                    backgroundColor: '#1a1d27',
                    color: '#e2e8f0',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 14,
                    borderWidth: white ? 1 : 0,
                    borderColor: '#6366f133',
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>

      <Pressable onPress={save} style={({ pressed }) => ({ backgroundColor: pressed ? '#4f46e5' : '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 })}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Save Changes</Text>
      </Pressable>

      <Pressable onPress={confirmDelete} style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#ef444466' }}>
        <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 15 }}>Delete Player</Text>
      </Pressable>
    </ScrollView>
  );
}
