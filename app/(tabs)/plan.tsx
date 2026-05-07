import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useSquad } from '../../src/hooks/useSquad';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { Chip } from '../../src/components/atoms/Chip';
import { OvrMovement } from '../../src/components/atoms/OvrMovement';
import { planPlayerInvestment } from '../../src/logic/investmentEngine';
import { DrillSession, DrillLevel, TalentTier, ManagerStyle, TierName, InvestmentPlan, InvestmentStep } from '../../src/types/resources';
import { theme, TIER_COLORS } from '../../src/constants/theme';
import gameProfile from '../../profiles/game_2025.json';

const TALENT_TIERS: TalentTier[] = ['FT1', 'FT2', 'FT3', 'Normal', 'Slow'];
const DRILL_LEVELS: DrillLevel[] = ['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'];
const TIER_ORDER: TierName[] = ['Rare', 'Elite', 'Stellar', 'Master', 'Epic', 'Legendary'];
const TIER_ADDITIONS: Record<TierName, number> = { None: 0, Rare: 10, Elite: 30, Stellar: 50, Master: 80, Epic: 120, Legendary: 160 };
const TIER_COSTS: Record<TierName, number> = { None: 0, Rare: 100, Elite: 90, Stellar: 50, Master: 25, Epic: 15, Legendary: 10 };
const DRILL_NAMES = ['Skill Drill', 'Finishing School', 'Wing Play', 'Defensive Shape', 'Backline Press', 'Stamina Run', 'Strength Circuit'];

type Section = 'drills' | 'resources' | 'tier';

function newDrill(): DrillSession {
  return { drillName: 'Skill Drill', sessionCount: 6, drillLevel: 'Medium' };
}

function StepRail({ steps }: { steps: InvestmentStep[] }) {
  return (
    <View style={{ paddingLeft: 22, position: 'relative' }}>
      <View style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 1, backgroundColor: theme.hairline2 }} />
      {steps.map((s, i) => {
        const accent = s.action === 'drill' ? theme.steelLight : s.action === 'tier' ? theme.hot : theme.pos;
        const gain = s.ovrAfter - s.ovrBefore;
        return (
          <View key={i} style={{ position: 'relative', marginBottom: 8 }}>
            <View style={{ position: 'absolute', left: -19, top: 7, width: 13, height: 13, borderWidth: 1, borderColor: accent, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 5, height: 5, backgroundColor: accent }} />
            </View>
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, backgroundColor: theme.surface, padding: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <MonoLabel size={9} color={accent}>{s.action.toUpperCase()}</MonoLabel>
                  <Text style={{ color: theme.inkGhost, fontSize: 11 }}>·</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.ink, fontFamily: theme.display, flex: 1 }} numberOfLines={1}>{s.description}</Text>
                </View>
                {s.resourcesUsed && <MonoLabel size={10} style={{ letterSpacing: 0.4 }}>{s.resourcesUsed}</MonoLabel>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <MonoLabel size={10}>{s.ovrBefore.toFixed(1)} → {s.ovrAfter.toFixed(1)}</MonoLabel>
                <Text style={{ fontFamily: theme.display, fontSize: 16, fontWeight: '600', color: gain > 0 ? theme.pos : theme.inkMuted, marginTop: 2, letterSpacing: -0.3 }}>{gain > 0 ? '+' : ''}{gain.toFixed(1)}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function PlanScreen() {
  const { squad } = useSquad();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drillRows, setDrillRows] = useState<DrillSession[]>([newDrill()]);
  const [talent, setTalent] = useState<TalentTier>('Normal');
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('Medium');
  const [twoxAd, setTwoxAd] = useState(false);
  const [style, setStyle] = useState<ManagerStyle>('FTP');
  const [greens, setGreens] = useState(0);
  const [isPremiumSponsor, setIsPremiumSponsor] = useState(false);
  const [targetTier, setTargetTier] = useState<TierName | null>(null);
  const [tierPointInputs, setTierPointInputs] = useState<Partial<Record<TierName, string>>>({});
  const [section, setSection] = useState<Section>('drills');
  const [plan, setPlan] = useState<InvestmentPlan | null>(null);

  const selectedPlayer = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  function project() {
    if (!selectedPlayer) return;
    const managerProfile = {
      style,
      tierPoints: Object.fromEntries(Object.entries(tierPointInputs).map(([k, v]) => [k, parseInt(v ?? '0', 10) || 0])) as Partial<Record<TierName, number>>,
      greens, isPremiumSponsor, twoxAdActive: twoxAd, talentTier: talent, drillLevel,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPlan(planPlayerInvestment(selectedPlayer, managerProfile, drillRows, gameProfile as any, targetTier));
  }

  if (squad.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <AppHeader />
        <View style={{ padding: 60, alignItems: 'center' }}>
          <MonoLabel color={theme.steelLight} style={{ marginBottom: 12 }}>NO ASSET SELECTED</MonoLabel>
          <Text style={{ fontSize: 18, color: theme.ink, fontFamily: theme.display, marginBottom: 18 }}>Add a player to begin planning.</Text>
          <Pressable onPress={() => router.push('/player/new')} style={{ backgroundColor: theme.ink, paddingHorizontal: 22, paddingVertical: 12 }}>
            <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, fontWeight: '600', color: theme.bg }}>＋ ADD PLAYER</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {squad.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderBottomWidth: 1, borderBottomColor: theme.hairline }} contentContainerStyle={{ paddingLeft: 8 }}>
            {squad.map(p => {
              const sel = p.id === selectedId;
              return (
                <Pressable key={p.id} onPress={() => setSelectedId(p.id)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: sel ? theme.steelLight : 'transparent', marginBottom: -1 }}>
                  <Text style={{ fontSize: 12, color: sel ? theme.ink : theme.inkMuted, fontWeight: sel ? '600' : '400', fontFamily: theme.display, marginBottom: 2 }}>{p.name}</Text>
                  <MonoLabel size={8}>{p.overall} · {p.role[0]}</MonoLabel>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View style={{ padding: 14, paddingBottom: 0 }}>
          {selectedPlayer ? (
            <OvrMovement from={selectedPlayer.overall} to={plan?.finalOvr ?? selectedPlayer.overall} gain={(plan?.finalOvr ?? selectedPlayer.overall) - selectedPlayer.overall} name={selectedPlayer.name} age={selectedPlayer.age} tier={selectedPlayer.tier ?? 'None'} />
          ) : (
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 24, alignItems: 'center' }}>
              <MonoLabel color={theme.steelLight}>SELECT A SUBJECT ABOVE</MonoLabel>
            </View>
          )}
        </View>

        {plan && plan.steps.length > 0 && (
          <View style={{ padding: 18, paddingBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MonoLabel color={theme.steelLight}>EXECUTION SEQUENCE</MonoLabel>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.hairline }} />
              <MonoLabel>{plan.steps.length} STEPS</MonoLabel>
            </View>
            <StepRail steps={plan.steps} />
            {plan.warnings?.map((w, i) => (
              <View key={i} style={{ marginTop: 6, padding: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.neg + '55', backgroundColor: 'rgba(196,117,106,0.08)', flexDirection: 'row', gap: 8 }}>
                <MonoLabel size={10} color={theme.neg}>WARN</MonoLabel>
                <Text style={{ fontSize: 11, color: theme.inkSec, lineHeight: 16, flex: 1 }}>{w}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ padding: 16, paddingBottom: 0 }}>

          {/* Section tab bar */}
          <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
            {(['drills', 'resources', 'tier'] as Section[]).map((s, i) => {
              const active = section === s;
              return (
                <Pressable key={s} onPress={() => setSection(s)} style={{
                  flex: 1, paddingVertical: 11, alignItems: 'center',
                  backgroundColor: active ? theme.ink : theme.surface,
                  borderRightWidth: i < 2 ? 1 : 0, borderRightColor: theme.hairline2,
                }}>
                  <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.8, fontWeight: '700', color: active ? theme.bg : theme.inkSec, textTransform: 'uppercase' }}>{s}</Text>
                </Pressable>
              );
            })}
          </View>

          {section === 'drills' && (
            <>
              {/* TALENT card */}
              <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 10 }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 3, height: 12, backgroundColor: theme.steelLight, marginRight: 8 }} />
                  <MonoLabel size={10} color={theme.steelLight}>TALENT</MonoLabel>
                </View>
                <View style={{ padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {TALENT_TIERS.map(t => <Chip key={t} active={talent === t} onPress={() => setTalent(t)}>{t}</Chip>)}
                </View>
              </View>

              {/* DRILL LEVEL card */}
              <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 10 }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 3, height: 12, backgroundColor: theme.steelLight, marginRight: 8 }} />
                  <MonoLabel size={10} color={theme.steelLight}>DRILL LEVEL</MonoLabel>
                </View>
                <View style={{ padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {DRILL_LEVELS.map(l => <Chip key={l} active={drillLevel === l} onPress={() => setDrillLevel(l)}>{l}</Chip>)}
                </View>
              </View>

              {/* 2× AD toggle */}
              <Pressable onPress={() => setTwoxAd(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: twoxAd ? theme.surface2 : theme.surface, borderWidth: 1, borderColor: twoxAd ? theme.hot : theme.hairline2, padding: 12, paddingHorizontal: 14, marginBottom: 10 }}>
                <View style={{ width: 16, height: 16, backgroundColor: twoxAd ? theme.hot : 'transparent', borderWidth: 1, borderColor: twoxAd ? theme.hot : theme.hairline3 }} />
                <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.4, fontWeight: '700', color: twoxAd ? theme.hot : theme.ink, flex: 1 }}>2× AD MULTIPLIER</Text>
                <Text style={{ fontFamily: theme.mono, fontSize: 11, fontWeight: '700', color: twoxAd ? theme.hot : theme.inkSec }}>×2.00 XP</Text>
              </Pressable>

              {/* SESSIONS card */}
              <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 10 }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 3, height: 12, backgroundColor: theme.steelLight, marginRight: 8 }} />
                  <MonoLabel size={10} color={theme.steelLight}>SESSIONS</MonoLabel>
                </View>
                {drillRows.map((row, idx) => (
                  <View key={idx} style={{ borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: theme.hairline2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
                      <MonoLabel size={10} style={{ minWidth: 22 }}>{String(idx + 1).padStart(2, '0')}</MonoLabel>
                      <Text style={{ flex: 1, fontSize: 14, color: theme.ink, fontWeight: '700', fontFamily: theme.display }}>{row.drillName}</Text>
                      <Pressable onPress={() => setDrillRows(rows => rows.filter((_, i) => i !== idx))}>
                        <Text style={{ color: theme.neg, fontSize: 16, paddingHorizontal: 6 }}>×</Text>
                      </Pressable>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 5, padding: 8, paddingHorizontal: 10 }}>
                      {DRILL_NAMES.map(name => (
                        <Chip key={name} size="sm" active={row.drillName === name} onPress={() => setDrillRows(rows => rows.map((r, i) => i === idx ? { ...r, drillName: name } : r))}>{name}</Chip>
                      ))}
                    </ScrollView>
                    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.hairline2 }}>
                      <Pressable onPress={() => setDrillRows(rows => rows.map((r, i) => i === idx ? { ...r, sessionCount: Math.max(0, r.sessionCount - 1) } : r))} style={{ width: 44, borderRightWidth: 1, borderRightColor: theme.hairline2, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
                        <Text style={{ fontFamily: theme.mono, fontSize: 18, fontWeight: '300', color: theme.ink }}>−</Text>
                      </Pressable>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
                        <MonoLabel size={10}>SESSIONS</MonoLabel>
                        <Text style={{ fontFamily: theme.mono, fontSize: 22, fontWeight: '700', color: theme.ink }}>{String(row.sessionCount).padStart(2, '0')}</Text>
                      </View>
                      <Pressable onPress={() => setDrillRows(rows => rows.map((r, i) => i === idx ? { ...r, sessionCount: r.sessionCount + 1 } : r))} style={{ width: 44, borderLeftWidth: 1, borderLeftColor: theme.hairline2, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
                        <Text style={{ fontFamily: theme.mono, fontSize: 18, fontWeight: '300', color: theme.ink }}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                <Pressable onPress={() => setDrillRows(rows => [...rows, newDrill()])} style={{ borderTopWidth: 1, borderTopColor: theme.hairline2, padding: 12, alignItems: 'center', backgroundColor: theme.surface }}>
                  <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.6, fontWeight: '700', color: theme.steelLight }}>＋  ADD DRILL</Text>
                </Pressable>
              </View>
            </>
          )}

          {section === 'resources' && (
            <>
              {/* STYLE card */}
              <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 10 }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 3, height: 12, backgroundColor: theme.steelLight, marginRight: 8 }} />
                  <MonoLabel size={10} color={theme.steelLight}>MANAGER STYLE</MonoLabel>
                </View>
                <View style={{ padding: 12, flexDirection: 'row', gap: 6 }}>
                  {(['FTP', 'Hybrid', 'PTW'] as ManagerStyle[]).map(s => <Chip key={s} active={style === s} onPress={() => setStyle(s)}>{s}</Chip>)}
                </View>
              </View>

              {/* GREENS card */}
              <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 10 }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 3, height: 12, backgroundColor: theme.pos, marginRight: 8 }} />
                  <MonoLabel size={10} color={theme.steelLight}>GREENS</MonoLabel>
                  <View style={{ flex: 1 }} />
                  <MonoLabel size={10} color={theme.pos}>+{Math.min(100, greens * 15)}% COND</MonoLabel>
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <Pressable onPress={() => setGreens(v => Math.max(0, v - 1))} style={{ width: 52, borderRightWidth: 1, borderRightColor: theme.hairline2, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }}>
                    <Text style={{ fontFamily: theme.mono, fontSize: 20, fontWeight: '300', color: theme.ink }}>−</Text>
                  </Pressable>
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }}>
                    <Text style={{ fontFamily: theme.mono, fontSize: 28, fontWeight: '700', color: theme.ink }}>{greens}</Text>
                  </View>
                  <Pressable onPress={() => setGreens(v => v + 1)} style={{ width: 52, borderLeftWidth: 1, borderLeftColor: theme.hairline2, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }}>
                    <Text style={{ fontFamily: theme.mono, fontSize: 20, fontWeight: '300', color: theme.ink }}>+</Text>
                  </Pressable>
                </View>
              </View>

              {/* PREMIUM SPONSOR toggle */}
              <Pressable onPress={() => setIsPremiumSponsor(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: isPremiumSponsor ? theme.surface2 : theme.surface, borderWidth: 1, borderColor: isPremiumSponsor ? theme.hot : theme.hairline2, padding: 14, paddingHorizontal: 14 }}>
                <View style={{ width: 16, height: 16, backgroundColor: isPremiumSponsor ? theme.hot : 'transparent', borderWidth: 1, borderColor: isPremiumSponsor ? theme.hot : theme.hairline3 }} />
                <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.4, fontWeight: '700', color: isPremiumSponsor ? theme.hot : theme.ink }}>PREMIUM SPONSOR</Text>
              </Pressable>
            </>
          )}

          {section === 'tier' && (
            <>
              <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 10 }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 3, height: 12, backgroundColor: theme.hot, marginRight: 8 }} />
                  <MonoLabel size={10} color={theme.steelLight}>TIER UPGRADE</MonoLabel>
                </View>
                {TIER_ORDER.map((t, idx) => {
                  const cost = TIER_COSTS[t];
                  const have = parseInt(tierPointInputs[t] ?? '0', 10) || 0;
                  const canAfford = have >= cost;
                  const sel = targetTier === t;
                  const c = TIER_COLORS[t];
                  return (
                    <Pressable key={t} onPress={() => setTargetTier(sel ? null : t)} style={{ flexDirection: 'row', alignItems: 'stretch', backgroundColor: sel ? theme.surface2 : 'transparent', borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: theme.hairline2, borderLeftWidth: sel ? 3 : 0, borderLeftColor: c }}>
                      <View style={{ flex: 1, padding: 12, paddingHorizontal: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <Text style={{ fontFamily: theme.display, fontSize: 15, fontWeight: '700', color: c, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t}</Text>
                          <MonoLabel size={9} color={theme.inkSec}>+{TIER_ADDITIONS[t]} / STAT</MonoLabel>
                          <View style={{ flex: 1 }} />
                          <Text style={{ fontSize: 20, fontWeight: '700', color: canAfford ? theme.pos : theme.inkGhost }}>{canAfford ? '✓' : '·'}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <MonoLabel size={9} color={theme.inkSec}>NEED {cost} · HAVE</MonoLabel>
                          <TextInput keyboardType="numeric" value={tierPointInputs[t] ?? ''} onChangeText={v => setTierPointInputs(prev => ({ ...prev, [t]: v }))} placeholder="0" placeholderTextColor={theme.inkGhost}
                            style={{ backgroundColor: theme.surface3, color: theme.ink, fontFamily: theme.mono, fontSize: 13, fontWeight: '700', padding: 5, paddingHorizontal: 10, minWidth: 60, borderWidth: 1, borderColor: theme.hairline2 }} />
                          {!canAfford && have > 0 && <MonoLabel size={9} color={theme.neg}>{cost - have} SHORT</MonoLabel>}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <Pressable onPress={project} disabled={!selectedPlayer} style={{ marginTop: 16, backgroundColor: selectedPlayer ? theme.ink : theme.surface2, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: selectedPlayer ? theme.ink : theme.hairline2 }}>
            <Text style={{ fontFamily: theme.mono, fontSize: 12, letterSpacing: 2.5, fontWeight: '700', color: selectedPlayer ? theme.bg : theme.inkGhost }}>
              {selectedPlayer ? 'RUN PROJECTION' : 'SELECT A SUBJECT'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.push('/compare')} style={{ marginTop: 10, borderWidth: 1, borderColor: theme.hairline3, paddingVertical: 13, alignItems: 'center' }}>
            <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, fontWeight: '700', color: theme.steelLight }}>
              HEAD-TO-HEAD COMPARISON →
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
