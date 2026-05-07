import { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSquad } from '../../src/hooks/useSquad';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { Chip } from '../../src/components/atoms/Chip';
import { getDrillRecommendations } from '../../src/logic/controller';
import { theme } from '../../src/constants/theme';

export default function DrillsScreen() {
  const { squad } = useSquad();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fanLevel, setFanLevel] = useState(2);
  const [drillLevel, setDrillLevel] = useState<string>('Very Easy');

  const selectedPlayer = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  const drills = useMemo(() => {
    if (!selectedPlayer) return [];
    return getDrillRecommendations(selectedPlayer, fanLevel, drillLevel);
  }, [selectedPlayer, fanLevel, drillLevel]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 14, paddingHorizontal: 16, paddingBottom: 30 }}>

        {squad.length > 1 && (
          <>
            <MonoLabel color={theme.steelLight} style={{ marginBottom: 8 }}>SUBJECT</MonoLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 5, paddingBottom: 14 }}>
              {squad.map(p => (
                <Chip key={p.id} active={p.id === selectedId} onPress={() => setSelectedId(p.id)}>{p.name}</Chip>
              ))}
            </ScrollView>
          </>
        )}

        {/* Drill level selector */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <MonoLabel color={theme.steelLight}>DRILL LEVEL</MonoLabel>
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 14, gap: 6, flexWrap: 'wrap' }}>
          {['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'].map(l => {
            const sel = drillLevel === l;
            return (
              <Pressable key={l} onPress={() => setDrillLevel(l)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: sel ? theme.ink : theme.hairline2, backgroundColor: sel ? theme.ink : 'transparent' }}>
                <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: sel ? theme.bg : theme.inkSec }}>{l.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Fan Club selector */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <MonoLabel color={theme.steelLight}>FAN CLUB</MonoLabel>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.hairline }} />
          {fanLevel === 4 && <MonoLabel size={9} color={theme.pos}>ZERO-DRAIN UNLOCKED</MonoLabel>}
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 18, borderWidth: 1, borderColor: theme.hairline2 }}>
          {[0, 1, 2, 3, 4].map(l => {
            const sel = fanLevel === l;
            return (
              <Pressable key={l} onPress={() => setFanLevel(l)} style={{
                flex: 1, paddingVertical: 12, alignItems: 'center',
                backgroundColor: sel ? theme.ink : 'transparent',
                borderRightWidth: l < 4 ? 1 : 0, borderRightColor: theme.hairline2,
                position: 'relative',
              }}>
                {l === 4 && !sel && (
                  <View style={{ position: 'absolute', top: 3, right: 4, width: 5, height: 5, backgroundColor: theme.pos, borderRadius: 3 }} />
                )}
                <Text style={{ fontFamily: theme.mono, fontSize: 12, letterSpacing: 1, color: sel ? theme.bg : theme.inkSec }}>L{l}</Text>
              </Pressable>
            );
          })}
        </View>

        {!selectedPlayer ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <MonoLabel>SELECT A PLAYER</MonoLabel>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <MonoLabel color={theme.steelLight}>RECOMMENDATIONS</MonoLabel>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.hairline }} />
              <MonoLabel size={9}>SORT ROI ▼</MonoLabel>
            </View>

            {drills.map((d, i) => {
              const tc = d.type === 'Attack' ? theme.steelLight : d.type === 'Defence' ? '#86c5d6' : theme.hot;
              const eff = Math.round(d.efficiency * 100);
              const condCost = d.conditionCost;
              const isZero = d.isZeroDrain;
              const avgStat = (d as any).avgWhiteStatValue;
              const avgStatLabel = isFinite(avgStat) ? `AVG ${Math.round(avgStat)}` : null;
              return (
                <View key={d.name} style={{
                  borderWidth: 1, borderColor: theme.hairline2,
                  borderTopWidth: i > 0 ? 0 : 1,
                  backgroundColor: theme.surface, padding: 12, paddingHorizontal: 14,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <MonoLabel size={9} style={{ minWidth: 18 }}>{String(i + 1).padStart(2, '0')}</MonoLabel>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: tc + '55' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 1.2, color: tc }}>{((d as any).type ?? 'DRILL').toUpperCase()}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: theme.ink, fontWeight: '600', fontFamily: theme.display }}>{d.name}</Text>
                    {avgStatLabel && (
                      <Text style={{ fontFamily: theme.mono, fontSize: 9, color: theme.inkGhost }}>{avgStatLabel}</Text>
                    )}
                    {isZero && (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: theme.pos + '55' }}>
                        <Text style={{ fontFamily: theme.mono, fontSize: 8, letterSpacing: 1, color: theme.pos }}>ZERO·DRAIN</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {d.whiteHits.map(({ stat, white }) => (
                      <Text key={stat} style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.8, color: white ? theme.steelLight : theme.inkGhost }}>
                        {white ? '●' : '○'} {stat}
                      </Text>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                        <MonoLabel size={9}>EFFICIENCY</MonoLabel>
                        <Text style={{ fontFamily: theme.mono, fontSize: 11, fontWeight: '600', color: theme.pos }}>{eff}%</Text>
                      </View>
                      <View style={{ height: 3, backgroundColor: theme.surface3 }}>
                        <View style={{ width: `${eff}%` as any, height: '100%', backgroundColor: theme.pos }} />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                        <MonoLabel size={9}>COND·LOSS</MonoLabel>
                        <Text style={{ fontFamily: theme.mono, fontSize: 11, fontWeight: '600', color: condCost === 0 ? theme.pos : condCost < 2 ? theme.hot : theme.neg }}>{condCost.toFixed(2)}%</Text>
                      </View>
                      <View style={{ height: 3, backgroundColor: theme.surface3 }}>
                        <View style={{ width: `${Math.min(100, condCost * 20)}%` as any, height: '100%', backgroundColor: condCost === 0 ? theme.pos : condCost < 2 ? theme.hot : theme.neg }} />
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}
