import { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal } from 'react-native';
import { useSquad } from '../../src/hooks/useSquad';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { Chip } from '../../src/components/atoms/Chip';
import { getDrillRecommendations } from '../../src/logic/controller';
import { drillPresetService } from '../../src/services/drillPresetService';
import { theme } from '../../src/constants/theme';

const INTENSITY_COLORS: Record<string, string> = {
  'Very Easy': '#34d399',
  'Easy':      '#60a5fa',
  'Medium':    '#fbbf24',
  'Hard':      '#fb923c',
  'Very Hard': '#f87171',
};

export default function DrillsScreen() {
  const { squad } = useSquad();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fanLevel, setFanLevel] = useState(2);
  const [drillLevel, setDrillLevel] = useState<string>('Very Easy');

  // Preset mode
  const [presetMode, setPresetMode] = useState(false);
  const [presetSelection, setPresetSelection] = useState<string[]>([]);
  const [presetName, setPresetName] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const selectedPlayer = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  const drills = useMemo(() => {
    if (!selectedPlayer) return [];
    return getDrillRecommendations(selectedPlayer, fanLevel)
      .filter(d => d.intensity === drillLevel);
  }, [selectedPlayer, fanLevel, drillLevel]);

  function togglePresetDrill(name: string) {
    setPresetSelection(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name);
      if (prev.length >= 6) {
        // drop the last one (lowest ROI, as drills are sorted by ROI)
        return [...prev.slice(0, 5), name];
      }
      return [...prev, name];
    });
  }

  function savePreset() {
    if (!presetName.trim() || presetSelection.length === 0) return;
    drillPresetService.save(presetName.trim(), presetSelection);
    setSaveSuccess(true);
    setTimeout(() => {
      setPresetMode(false);
      setPresetSelection([]);
      setPresetName('');
      setSaveSuccess(false);
    }, 800);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 14, paddingHorizontal: 16, paddingBottom: presetMode ? 120 : 30 }}>

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
          {drills.some(d => d.isZeroDrain) && <MonoLabel size={9} color={theme.pos}>ZERO-DRAIN UNLOCKED</MonoLabel>}
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
              {presetMode ? (
                <>
                  <MonoLabel size={9} color={theme.hot}>{presetSelection.length}/6 SELECTED</MonoLabel>
                  <Pressable onPress={() => { setPresetMode(false); setPresetSelection([]); setPresetName(''); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: theme.hairline2 }}>
                    <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 1, color: theme.inkSec }}>CANCEL</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <MonoLabel size={9}>SORT ROI ▼</MonoLabel>
                  <Pressable onPress={() => setPresetMode(true)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: theme.steelLight + '88' }}>
                    <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 1, color: theme.steelLight }}>BUILD PRESET</Text>
                  </Pressable>
                </>
              )}
            </View>

            {drills.map((d, i) => {
              const tc = d.type === 'Attack' ? theme.steelLight : d.type === 'Defence' ? '#86c5d6' : d.type === 'Possession' ? '#a78bfa' : theme.hot;
              const ic = INTENSITY_COLORS[d.intensity] ?? theme.inkGhost;
              const eff = Math.round(d.efficiency * 100);
              const condCost = d.conditionCost;
              const isZero = d.isZeroDrain;
              const avgStat = (d as any).avgWhiteStatValue;
              const avgStatLabel = isFinite(avgStat) ? `AVG ${Math.round(avgStat)}` : null;
              const isSelected = presetSelection.includes(d.name);
              const selRank = presetSelection.indexOf(d.name) + 1;

              return (
                <Pressable key={d.name} onPress={presetMode ? () => togglePresetDrill(d.name) : undefined} style={{
                  borderWidth: 1, borderColor: presetMode && isSelected ? theme.hot : theme.hairline2,
                  borderTopWidth: i > 0 ? 0 : 1,
                  backgroundColor: presetMode && isSelected ? 'rgba(251,146,60,0.08)' : theme.surface,
                  padding: 12, paddingHorizontal: 14,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {presetMode ? (
                      <View style={{ width: 22, height: 22, borderWidth: 1, borderColor: isSelected ? theme.hot : theme.hairline2, alignItems: 'center', justifyContent: 'center', backgroundColor: isSelected ? theme.hot : 'transparent' }}>
                        {isSelected ? (
                          <Text style={{ fontFamily: theme.mono, fontSize: 10, fontWeight: '700', color: theme.bg }}>{selRank}</Text>
                        ) : (
                          <Text style={{ fontFamily: theme.mono, fontSize: 9, color: theme.inkGhost }}>{i + 1}</Text>
                        )}
                      </View>
                    ) : (
                      <MonoLabel size={9} style={{ minWidth: 18 }}>{String(i + 1).padStart(2, '0')}</MonoLabel>
                    )}
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: tc + '55' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 1.2, color: tc }}>{((d as any).type ?? 'DRILL').toUpperCase()}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: ic + '55' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 1, color: ic }}>{d.intensity.toUpperCase()}</Text>
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
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Preset save bar — floats at bottom when in preset mode */}
      {presetMode && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.hairline2, padding: 14, paddingHorizontal: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MonoLabel size={9} color={theme.inkSec}>
              {presetSelection.length === 0 ? 'TAP DRILLS ABOVE TO SELECT (MAX 6)' : presetSelection.join('  ·  ')}
            </MonoLabel>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TextInput
              value={presetName}
              onChangeText={setPresetName}
              placeholder="PRESET NAME"
              placeholderTextColor={theme.inkGhost}
              style={{ flex: 1, backgroundColor: theme.surface3, borderWidth: 1, borderColor: theme.hairline2, fontFamily: theme.mono, fontSize: 12, letterSpacing: 1, color: theme.ink, paddingHorizontal: 12, paddingVertical: 10 }}
            />
            <Pressable
              onPress={savePreset}
              disabled={!presetName.trim() || presetSelection.length === 0}
              style={{ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: saveSuccess ? theme.pos : (presetName.trim() && presetSelection.length > 0 ? theme.ink : theme.surface2), borderWidth: 1, borderColor: saveSuccess ? theme.pos : (presetName.trim() && presetSelection.length > 0 ? theme.ink : theme.hairline2) }}
            >
              <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.4, fontWeight: '700', color: saveSuccess ? theme.bg : (presetName.trim() && presetSelection.length > 0 ? theme.bg : theme.inkGhost) }}>
                {saveSuccess ? 'SAVED ✓' : 'SAVE'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
