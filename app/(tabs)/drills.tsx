import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSquad } from '../../src/hooks/useSquad';
import { PlayerCard } from '../../src/components/PlayerCard';
import { DrillTable } from '../../src/components/DrillTable';
import { EmptyState } from '../../src/components/EmptyState';
import { getBestDrillSelections } from '../../src/logic/controller';

export default function DrillsScreen() {
  const { squad } = useSquad();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fanClubLevel, setFanClubLevel] = useState(0);

  const selectedPlayer = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  if (squad.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f1117' }}>
        <EmptyState icon="barbell-outline" message="Add players to your squad first." ctaLabel="Add Player" onCta={() => router.push('/player/new')} />
      </View>
    );
  }

  const rawDrills = selectedPlayer ? getBestDrillSelections(selectedPlayer, fanClubLevel) : [];
  const drills = rawDrills.map((d: any) => ({
    name: d.drillName ?? d.name ?? 'Drill',
    type: d.type ?? 'Attack',
    statsHit: d.whiteStatsHit ?? d.statsHit ?? [],
    efficiency: d.efficiency ?? d.efficiencyPct ?? 0,
    conditionCost: d.conditionCost ?? d.cost ?? 0,
    isZeroDrain: (d.conditionCost ?? d.cost ?? 1) <= 0.01,
  }));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0f1117' }} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>

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

      {/* Fan Club level */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>FAN CLUB LEVEL</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[0, 1, 2, 3, 4].map(lvl => (
            <Pressable
              key={lvl}
              onPress={() => setFanClubLevel(lvl)}
              style={{
                flex: 1,
                backgroundColor: fanClubLevel === lvl ? '#6366f1' : '#1a1d27',
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: fanClubLevel === lvl ? '#fff' : '#9ca3af', fontWeight: '700', fontSize: 14 }}>L{lvl}</Text>
            </Pressable>
          ))}
        </View>
        {fanClubLevel === 4 && (
          <Text style={{ color: '#22c55e', fontSize: 12 }}>Zero-Drain protocol active — Very Easy drills cost 0% condition</Text>
        )}
      </View>

      {/* Drill results */}
      {selectedPlayer ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600' }}>RECOMMENDED DRILLS</Text>
          <DrillTable drills={drills} />
        </View>
      ) : (
        <Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 16 }}>Select a player to see drill recommendations.</Text>
      )}
    </ScrollView>
  );
}
