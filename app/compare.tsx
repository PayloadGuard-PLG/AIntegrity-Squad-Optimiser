import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useSquad } from '../src/hooks/useSquad';
import { PlayerCard } from '../src/components/PlayerCard';
import { CoachInputRow } from '../src/components/CoachInputRow';
import { OVRBadge } from '../src/components/OVRBadge';
import { compareInvestmentScenarios } from '../src/logic/scenarioComparator';
import { Coach, ManagerProfile, ManagerStyle, TierName, ScenarioComparison } from '../src/types/resources';
import { nanoid } from 'nanoid/non-secure';

const STYLES: ManagerStyle[] = ['FTP', 'Hybrid', 'PTW'];
const TIERS: (TierName | null)[] = [null, 'Rare', 'Elite', 'Stellar', 'Master', 'Epic', 'Legendary'];

function newCoach(): Partial<Coach> {
  return { id: nanoid(), type: 'Attacking', sessionType: 'Training', multiplier: 30, attributes: ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING'], source: 'Academy', cost: { currency: 'free', amount: 0 }, durationDays: 1 };
}

export default function CompareScreen() {
  const { squad } = useSquad();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [coachRows, setCoachRows] = useState<Partial<Coach>[]>([newCoach()]);
  const [style, setStyle] = useState<ManagerStyle>('FTP');
  const [tierPoints, setTierPoints] = useState('');
  const [greens, setGreens] = useState('');
  const [isPremiumSponsor, setIsPremiumSponsor] = useState(false);
  const [targetTier, setTargetTier] = useState<TierName | null>(null);
  const [comparison, setComparison] = useState<ScenarioComparison | null>(null);

  function togglePlayer(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function compare() {
    const players = squad.filter(p => selectedIds.includes(p.id));
    if (players.length < 2) return;
    const coaches = coachRows.filter(c => c.type && c.multiplier) as Coach[];
    const profile: ManagerProfile = {
      style, coaches,
      tierPoints: parseInt(tierPoints, 10) || 0,
      greens: parseInt(greens, 10) || 0,
      isPremiumSponsor,
    };
    setComparison(compareInvestmentScenarios(players, profile, targetTier));
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0f1117' }} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>

      {/* Player multi-select */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>SELECT PLAYERS TO COMPARE</Text>
        {squad.map(p => (
          <PlayerCard key={p.id} player={p} selected={selectedIds.includes(p.id)} onPress={() => togglePlayer(p.id)} />
        ))}
        {selectedIds.length < 2 && (
          <Text style={{ color: '#6b7280', fontSize: 12 }}>Select at least 2 players</Text>
        )}
      </View>

      {/* Coaches */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>SHARED COACHES</Text>
        {coachRows.map((c, i) => (
          <CoachInputRow key={c.id ?? i} value={c}
            onChange={updated => setCoachRows(rows => rows.map((r, idx) => idx === i ? updated : r))}
            onRemove={() => setCoachRows(rows => rows.filter((_, idx) => idx !== i))} />
        ))}
        <Pressable onPress={() => setCoachRows(rows => [...rows, newCoach()])}
          style={{ backgroundColor: '#1a1d27', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: '#6366f1', fontWeight: '700', fontSize: 14 }}>+ Add Coach</Text>
        </Pressable>
      </View>

      {/* Profile */}
      <View style={{ gap: 12 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>MANAGER PROFILE</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {STYLES.map(s => (
            <Pressable key={s} onPress={() => setStyle(s)}
              style={{ flex: 1, backgroundColor: style === s ? '#6366f1' : '#1a1d27', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}>
              <Text style={{ color: style === s ? '#fff' : '#9ca3af', fontWeight: '700', fontSize: 13 }}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: '#6b7280', fontSize: 11 }}>TIER POINTS</Text>
            <TextInput keyboardType="numeric" value={tierPoints} onChangeText={setTierPoints} placeholder="0"
              placeholderTextColor="#4b5563"
              style={{ backgroundColor: '#1a1d27', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: '#6b7280', fontSize: 11 }}>GREENS</Text>
            <TextInput keyboardType="numeric" value={greens} onChangeText={setGreens} placeholder="0"
              placeholderTextColor="#4b5563"
              style={{ backgroundColor: '#1a1d27', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }} />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ color: '#6b7280', fontSize: 11 }}>TARGET TIER</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {TIERS.map(t => (
              <Pressable key={t ?? 'none'} onPress={() => setTargetTier(t)}
                style={{ backgroundColor: targetTier === t ? '#6366f1' : '#1a1d27', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: targetTier === t ? '#fff' : '#9ca3af', fontSize: 12, fontWeight: '600' }}>{t ?? 'None'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Compare button */}
      <Pressable onPress={compare} disabled={selectedIds.length < 2}
        style={({ pressed }) => ({
          backgroundColor: selectedIds.length < 2 ? '#2a2d3a' : pressed ? '#4f46e5' : '#6366f1',
          borderRadius: 12, paddingVertical: 14, alignItems: 'center',
        })}>
        <Text style={{ color: selectedIds.length < 2 ? '#6b7280' : '#fff', fontWeight: '700', fontSize: 16 }}>Compare</Text>
      </Pressable>

      {/* Results */}
      {comparison && (
        <View style={{ gap: 12 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>RESULTS</Text>

          {/* Recommendation banner */}
          <View style={{ backgroundColor: '#22c55e22', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#22c55e44' }}>
            <Text style={{ color: '#22c55e', fontWeight: '700', fontSize: 14 }}>✓ Recommended: {comparison.recommendedPlayer}</Text>
            <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 4, lineHeight: 18 }}>{comparison.reasoning}</Text>
          </View>

          {/* Ranked table */}
          {comparison.results.map(r => (
            <View key={r.playerName} style={{ backgroundColor: '#1a1d27', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: r.rank === 1 ? '#6366f1' : '#2a2d3a', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>#{r.rank}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#e2e8f0', fontWeight: '700', fontSize: 14 }}>{r.playerName}</Text>
                <Text style={{ color: '#6b7280', fontSize: 12 }}>OVR {r.currentOvr.toFixed(0)} → {r.projectedOvr.toFixed(0)}</Text>
              </View>
              <Text style={{ color: '#22c55e', fontWeight: '800', fontSize: 16 }}>+{r.ovrGain.toFixed(1)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
