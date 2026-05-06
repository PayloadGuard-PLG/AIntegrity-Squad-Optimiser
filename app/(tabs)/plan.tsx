import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSquad } from '../../src/hooks/useSquad';
import { PlayerCard } from '../../src/components/PlayerCard';
import { CoachInputRow } from '../../src/components/CoachInputRow';
import { InvestmentStepTable } from '../../src/components/InvestmentStepTable';
import { EmptyState } from '../../src/components/EmptyState';
import { planPlayerInvestment } from '../../src/logic/investmentEngine';
import { Coach, ManagerProfile, ManagerStyle, TierName, InvestmentPlan } from '../../src/types/resources';
import { nanoid } from 'nanoid/non-secure';

const STYLES: ManagerStyle[] = ['FTP', 'Hybrid', 'PTW'];
const TIERS: (TierName | null)[] = [null, 'Rare', 'Elite', 'Stellar', 'Master', 'Epic', 'Legendary'];

function newCoach(): Partial<Coach> {
  return { id: nanoid(), type: 'Attacking', sessionType: 'Training', multiplier: 30, attributes: ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING'], source: 'Academy', cost: { currency: 'free', amount: 0 }, durationDays: 1 };
}

export default function PlanScreen() {
  const { squad } = useSquad();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coachRows, setCoachRows] = useState<Partial<Coach>[]>([newCoach()]);
  const [style, setStyle] = useState<ManagerStyle>('FTP');
  const [tierPoints, setTierPoints] = useState('');
  const [greens, setGreens] = useState('');
  const [isPremiumSponsor, setIsPremiumSponsor] = useState(false);
  const [targetTier, setTargetTier] = useState<TierName | null>(null);
  const [plan, setPlan] = useState<InvestmentPlan | null>(null);

  const selectedPlayer = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  if (squad.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f1117' }}>
        <EmptyState icon="trending-up-outline" message="Add players to your squad first." ctaLabel="Add Player" onCta={() => router.push('/player/new')} />
      </View>
    );
  }

  function project() {
    if (!selectedPlayer) return;
    const coaches = coachRows.filter(c => c.type && c.multiplier) as Coach[];
    const profile: ManagerProfile = {
      style,
      coaches,
      tierPoints: parseInt(tierPoints, 10) || 0,
      greens: parseInt(greens, 10) || 0,
      isPremiumSponsor,
      storeBudget: style === 'Hybrid' ? 500 : undefined,
    };
    setPlan(planPlayerInvestment(selectedPlayer, profile, targetTier));
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0f1117' }} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>

      {/* Player selector */}
      {squad.length > 1 && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>SELECT PLAYER</Text>
          {squad.map(p => (
            <PlayerCard key={p.id} player={p} selected={p.id === (selectedPlayer?.id)} onPress={() => setSelectedId(p.id)} />
          ))}
        </View>
      )}
      {squad.length === 1 && selectedPlayer && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>PLAYER</Text>
          <PlayerCard player={selectedPlayer} selected onPress={() => {}} />
        </View>
      )}

      {/* Coaches */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>COACHES</Text>
        {coachRows.map((c, i) => (
          <CoachInputRow
            key={c.id ?? i}
            value={c}
            onChange={updated => setCoachRows(rows => rows.map((r, idx) => idx === i ? updated : r))}
            onRemove={() => setCoachRows(rows => rows.filter((_, idx) => idx !== i))}
          />
        ))}
        <Pressable onPress={() => setCoachRows(rows => [...rows, newCoach()])}
          style={{ backgroundColor: '#1a1d27', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: '#6366f1', fontWeight: '700', fontSize: 14 }}>+ Add Coach</Text>
        </Pressable>
      </View>

      {/* Manager profile */}
      <View style={{ gap: 12 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>MANAGER PROFILE</Text>

        <View style={{ gap: 6 }}>
          <Text style={{ color: '#6b7280', fontSize: 11 }}>STYLE</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {STYLES.map(s => (
              <Pressable key={s} onPress={() => setStyle(s)}
                style={{ flex: 1, backgroundColor: style === s ? '#6366f1' : '#1a1d27', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}>
                <Text style={{ color: style === s ? '#fff' : '#9ca3af', fontWeight: '700', fontSize: 13 }}>{s}</Text>
              </Pressable>
            ))}
          </View>
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

        <Pressable onPress={() => setIsPremiumSponsor(v => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1d27', borderRadius: 10, padding: 12 }}>
          <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: isPremiumSponsor ? '#f59e0b' : '#2a2d3a', alignItems: 'center', justifyContent: 'center' }}>
            {isPremiumSponsor && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
          </View>
          <Text style={{ color: '#e2e8f0', fontSize: 14 }}>Premium Sponsor (Elite Chest)</Text>
        </Pressable>

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

      {/* Project button */}
      <Pressable onPress={project} disabled={!selectedPlayer}
        style={({ pressed }) => ({
          backgroundColor: !selectedPlayer ? '#2a2d3a' : pressed ? '#4f46e5' : '#6366f1',
          borderRadius: 12, paddingVertical: 14, alignItems: 'center',
        })}>
        <Text style={{ color: !selectedPlayer ? '#6b7280' : '#fff', fontWeight: '700', fontSize: 16 }}>
          {selectedPlayer ? 'Project OVR' : 'Select a player first'}
        </Text>
      </Pressable>

      {/* Compare link */}
      <Pressable onPress={() => router.push('/compare')} style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ color: '#6366f1', fontSize: 14, fontWeight: '600' }}>Compare multiple players →</Text>
      </Pressable>

      {/* Results */}
      {plan && (
        <View style={{ gap: 12 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>PROJECTION</Text>
          <Text style={{ color: '#e2e8f0', fontSize: 13, lineHeight: 20 }}>{plan.recommendation}</Text>
          <InvestmentStepTable steps={plan.steps} finalOvr={plan.finalOvr} totalOvrGain={plan.totalOvrGain} />
          {plan.warnings.map((w, i) => (
            <Text key={i} style={{ color: '#f59e0b', fontSize: 12 }}>⚠ {w}</Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
