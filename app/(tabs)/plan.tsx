import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSquad } from '../../src/hooks/useSquad';
import { PlayerCard } from '../../src/components/PlayerCard';
import { DrillSessionRow } from '../../src/components/DrillSessionRow';
import { InvestmentStepTable } from '../../src/components/InvestmentStepTable';
import { EmptyState } from '../../src/components/EmptyState';
import { planPlayerInvestment } from '../../src/logic/investmentEngine';
import { DrillSession, DrillLevel, TalentTier, ManagerStyle, TierName, InvestmentPlan } from '../../src/types/resources';
import { AppHeader } from '../../src/components/AppHeader';
import gameProfile from '../../profiles/game_2025.json';

const STYLES: ManagerStyle[] = ['FTP', 'Hybrid', 'PTW'];
const TALENT_TIERS: TalentTier[] = ['FT1', 'FT2', 'FT3', 'Normal', 'Slow'];
const DRILL_LEVELS: DrillLevel[] = ['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'];
const TIER_COSTS: Partial<Record<TierName, number>> = { Rare: 100, Elite: 90, Stellar: 50, Master: 25, Epic: 15, Legendary: 10 };

function newSession(): DrillSession {
  return { drillName: 'Skill Drill', sessionCount: 10, drillLevel: 'Medium' };
}

export default function PlanScreen() {
  const { squad } = useSquad();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drillRows, setDrillRows] = useState<DrillSession[]>([newSession()]);
  const [style, setStyle] = useState<ManagerStyle>('FTP');
  const [talentTier, setTalentTier] = useState<TalentTier>('Normal');
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('Medium');
  const [tierPointInputs, setTierPointInputs] = useState<Partial<Record<TierName, string>>>({});
  const [greens, setGreens] = useState('');
  const [isPremiumSponsor, setIsPremiumSponsor] = useState(false);
  const [twoxAd, setTwoxAd] = useState(false);
  const [targetTier, setTargetTier] = useState<TierName | null>(null);
  const [plan, setPlan] = useState<InvestmentPlan | null>(null);

  const selectedPlayer = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  if (squad.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f1117' }}>
        <AppHeader />
        <EmptyState icon="trending-up-outline" message="Add players to your squad first." ctaLabel="Add Player" onCta={() => router.push('/player/new')} />
      </View>
    );
  }

  function project() {
    if (!selectedPlayer) return;
    const profile = {
      style,
      tierPoints: Object.fromEntries(Object.entries(tierPointInputs).map(([k, v]) => [k, parseInt(v ?? '0', 10) || 0])) as Partial<Record<TierName, number>>,
      greens: parseInt(greens, 10) || 0,
      isPremiumSponsor,
      twoxAdActive: twoxAd,
      talentTier,
      drillLevel,
      storeBudget: style === 'Hybrid' ? 500 : undefined,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPlan(planPlayerInvestment(selectedPlayer, profile, drillRows, gameProfile as any, targetTier));
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0f1117' }}>
    <AppHeader />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>

      {/* Player selector */}
      {squad.length > 1 && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>SELECT PLAYER</Text>
          {squad.map(p => (
            <PlayerCard key={p.id} player={p} selected={p.id === selectedPlayer?.id} onPress={() => setSelectedId(p.id)} />
          ))}
        </View>
      )}
      {squad.length === 1 && selectedPlayer && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>PLAYER</Text>
          <PlayerCard player={selectedPlayer} selected onPress={() => {}} />
        </View>
      )}

      {/* Player attributes */}
      <View style={{ gap: 12 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>PLAYER ATTRIBUTES</Text>

        <View style={{ gap: 6 }}>
          <Text style={{ color: '#6b7280', fontSize: 11 }}>TALENT</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {TALENT_TIERS.map(t => (
              <Pressable key={t} onPress={() => setTalentTier(t)}
                style={{ backgroundColor: talentTier === t ? '#6366f1' : '#1a1d27', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: talentTier === t ? '#fff' : '#9ca3af', fontSize: 12, fontWeight: '600' }}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Drill sessions */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>DRILL SESSIONS</Text>
        {drillRows.map((s, i) => (
          <DrillSessionRow key={i} value={s}
            onChange={updated => setDrillRows(rows => rows.map((r, idx) => idx === i ? updated : r))}
            onRemove={() => setDrillRows(rows => rows.filter((_, idx) => idx !== i))} />
        ))}
        <Pressable onPress={() => setDrillRows(rows => [...rows, newSession()])}
          style={{ backgroundColor: '#1a1d27', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: '#6366f1', fontWeight: '700', fontSize: 14 }}>+ Add Drill</Text>
        </Pressable>
      </View>

      {/* Training settings */}
      <View style={{ gap: 12 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>TRAINING SETTINGS</Text>

        <Pressable onPress={() => setTwoxAd(v => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1d27', borderRadius: 10, padding: 12 }}>
          <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: twoxAd ? '#22c55e' : '#2a2d3a', alignItems: 'center', justifyContent: 'center' }}>
            {twoxAd && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
          </View>
          <Text style={{ color: '#e2e8f0', fontSize: 14 }}>2× Ad active (doubles XP this session)</Text>
        </Pressable>
      </View>

      {/* Manager profile */}
      <View style={{ gap: 12 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>RESOURCES</Text>

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

        <View style={{ gap: 6 }}>
          <Text style={{ color: '#6b7280', fontSize: 11 }}>GREENS</Text>
          <TextInput keyboardType="numeric" value={greens} onChangeText={setGreens} placeholder="0"
            placeholderTextColor="#4b5563"
            style={{ backgroundColor: '#1a1d27', color: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }} />
        </View>

        <Pressable onPress={() => setIsPremiumSponsor(v => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1d27', borderRadius: 10, padding: 12 }}>
          <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: isPremiumSponsor ? '#f59e0b' : '#2a2d3a', alignItems: 'center', justifyContent: 'center' }}>
            {isPremiumSponsor && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
          </View>
          <Text style={{ color: '#e2e8f0', fontSize: 14 }}>Premium Sponsor</Text>
        </Pressable>

        <View style={{ gap: 6 }}>
          <Text style={{ color: '#6b7280', fontSize: 11 }}>TIER UPGRADE — tap to select target</Text>
          {(Object.entries(TIER_COSTS) as [TierName, number][]).map(([t, threshold]) => {
            const have = parseInt(tierPointInputs[t] ?? '0', 10) || 0;
            const canAfford = have >= threshold;
            const isTarget = targetTier === t;
            return (
              <Pressable key={t} onPress={() => setTargetTier(isTarget ? null : t)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: isTarget ? '#6366f122' : '#1a1d27', borderRadius: 10, padding: 10,
                  borderWidth: isTarget ? 1 : 0, borderColor: '#6366f1' }}>
                <View style={{ width: 76 }}>
                  <Text style={{ color: isTarget ? '#a5b4fc' : '#e2e8f0', fontWeight: '700', fontSize: 13 }}>{t}</Text>
                  <Text style={{ color: canAfford ? '#22c55e' : '#6b7280', fontSize: 10 }}>need {threshold}</Text>
                </View>
                <TextInput keyboardType="numeric"
                  value={tierPointInputs[t] ?? ''}
                  onChangeText={v => setTierPointInputs(prev => ({ ...prev, [t]: v }))}
                  placeholder="0" placeholderTextColor="#4b5563"
                  style={{ flex: 1, backgroundColor: '#0f1117', color: '#e2e8f0', borderRadius: 8,
                    paddingHorizontal: 10, paddingVertical: 6, fontSize: 14 }} />
                {canAfford && <Text style={{ color: '#22c55e', fontSize: 16 }}>✓</Text>}
              </Pressable>
            );
          })}
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
    </View>
  );
}
