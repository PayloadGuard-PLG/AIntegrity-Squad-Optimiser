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

        <View style={{ padding: 24, paddingBottom: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <MonoLabel color={theme.steelLight}>CONFIGURATION</MonoLabel>
            <View style={{ flex: 1, height: 1, backgroundColor: theme.hairline }} />
            {(['drills', 'resources', 'tier'] as Section[]).map(s => (
              <Pressable key={s} onPress={() => setSection(s)} style={{ marginLeft: 10, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: section === s ? theme.steelLight : 'transparent' }}>
                <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1.4, color: section === s ? theme.ink : theme.inkMuted, textTransform: 'uppercase' }}>{s}</Text>
              </Pressable>
            ))}
          </View>

          {section === 'drills' && (
            <>
              <View style={{ gap: 14, marginBottom: 16 }}>
                <View>
                  <MonoLabel style={{ marginBottom: 6 }}>TALENT</MonoLabel>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                    {TALENT_TIERS.map(t => <Chip key={t} active={talent === t} onPress={() => setTalent(t)}>{t}</Chip>)}
                  </View>
                </View>
                <View>
                  <MonoLabel style={{ marginBottom: 6 }}>DRILL LEVEL</MonoLabel>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                    {DRILL_LEVELS.map(l => <Chip key={l} active={drillLevel === l} onPress={() => setDrillLevel(l)}>{l}</Chip>)}
                  </View>
                </View>
              </View>

              <Pressable onPress={() => setTwoxAd(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: twoxAd ? theme.surface2 : theme.surface, borderWidth: 1, borderColor: twoxAd ? theme.hot : theme.hairline2, padding: 10, paddingHorizontal: 12, marginBottom: 18 }}>
                <View style={{ width: 14, height: 14, backgroundColor: twoxAd ? theme.hot : 'transparent', borderWidth: 1, borderColor: twoxAd ? theme.hot : theme.inkMuted }} />
                <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.4, color: twoxAd ? theme.hot : theme.inkSec }}>2× AD MULTIPLIER</Text>
                <View style={{ flex: 1 }} />
                <MonoLabel size={9}>×2.00 XP</MonoLabel>
              </Pressable>

              <MonoLabel style={{ marginBottom: 8 }}>SESSIONS</MonoLabel>
              {drillRows.map((row, idx) => (
                <View key={idx} style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 6, backgroundColor: theme.surface }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
                    <MonoLabel size={9} style={{ minWidth: 20 }}>{String(idx + 1).padStart(2, '0')}</MonoLabel>
                    <Text style={{ flex: 1, fontSize: 13, color: theme.ink, fontWeight: '500', fontFamily: theme.display }}>{row.drillName}</Text>
                    <Pressable onPress={() => setDrillRows(rows => rows.filter((_, i) => i !== idx))}>
                      <Text style={{ color: theme.inkMuted, fontSize: 14, padding: 4 }}>×</Text>
                    </Pressable>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 5, padding: 8, paddingHorizontal: 10 }}>
                    {DRILL_NAMES.map(name => (
                      <Chip key={name} size="sm" active={row.drillName === name} onPress={() => setDrillRows(rows => rows.map((r, i) => i === idx ? { ...r, drillName: name } : r))}>{name}</Chip>
                    ))}
                  </ScrollView>
                  <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.hairline }}>
                    <Pressable onPress={() => setDrillRows(rows => rows.map((r, i) => i === idx ? { ...r, sessionCount: Math.max(0, r.sessionCount - 1) } : r))} style={{ width: 38, backgroundColor: theme.surface, borderRightWidth: 1, borderRightColor: theme.hairline, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 14, color: theme.ink }}>−</Text>
                    </Pressable>
                    <View style={{ flex: 1, padding: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <MonoLabel size={9}>SESSIONS</MonoLabel>
                      <Text style={{ fontFamily: theme.display, fontSize: 18, color: theme.ink, fontWeight: '300' }}>{String(row.sessionCount).padStart(2, '0')}</Text>
                    </View>
                    <Pressable onPress={() => setDrillRows(rows => rows.map((r, i) => i === idx ? { ...r, sessionCount: r.sessionCount + 1 } : r))} style={{ width: 38, backgroundColor: theme.surface, borderLeftWidth: 1, borderLeftColor: theme.hairline, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 14, color: theme.ink }}>+</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              <Pressable onPress={() => setDrillRows(rows => [...rows, newDrill()])} style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 10, alignItems: 'center' }}>
                <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.4, color: theme.inkSec }}>＋  ADD DRILL</Text>
              </Pressable>
            </>
          )}

          {section === 'resources' && (
            <>
              <View style={{ marginBottom: 18 }}>
                <MonoLabel style={{ marginBottom: 6 }}>STYLE</MonoLabel>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {(['FTP', 'Hybrid', 'PTW'] as ManagerStyle[]).map(s => <Chip key={s} active={style === s} onPress={() => setStyle(s)}>{s}</Chip>)}
                </View>
              </View>
              <View style={{ marginBottom: 18 }}>
                <MonoLabel style={{ marginBottom: 6 }}>GREENS</MonoLabel>
                <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: theme.hairline2 }}>
                  <Pressable onPress={() => setGreens(v => Math.max(0, v - 1))} style={{ width: 36, backgroundColor: theme.surface, borderRightWidth: 1, borderRightColor: theme.hairline, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: theme.mono, fontSize: 14, color: theme.ink }}>−</Text>
                  </Pressable>
                  <View style={{ flex: 1, padding: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <MonoLabel size={9}>QTY</MonoLabel>
                    <Text style={{ fontFamily: theme.display, fontSize: 20, color: theme.ink, fontWeight: '300' }}>{greens}</Text>
                    <View style={{ flex: 1 }} />
                    <MonoLabel size={9} color={theme.pos}>+{Math.min(100, greens * 15)}% COND</MonoLabel>
                  </View>
                  <Pressable onPress={() => setGreens(v => v + 1)} style={{ width: 36, backgroundColor: theme.surface, borderLeftWidth: 1, borderLeftColor: theme.hairline, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: theme.mono, fontSize: 14, color: theme.ink }}>+</Text>
                  </Pressable>
                </View>
              </View>
              <Pressable onPress={() => setIsPremiumSponsor(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: isPremiumSponsor ? theme.surface2 : theme.surface, borderWidth: 1, borderColor: isPremiumSponsor ? theme.hot : theme.hairline2, padding: 10, paddingHorizontal: 12 }}>
                <View style={{ width: 14, height: 14, backgroundColor: isPremiumSponsor ? theme.hot : 'transparent', borderWidth: 1, borderColor: isPremiumSponsor ? theme.hot : theme.inkMuted }} />
                <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 1.4, color: isPremiumSponsor ? theme.hot : theme.inkSec }}>PREMIUM SPONSOR</Text>
              </Pressable>
            </>
          )}

          {section === 'tier' && (
            <>
              <MonoLabel style={{ marginBottom: 8 }}>TIER UPGRADE</MonoLabel>
              {TIER_ORDER.map(t => {
                const cost = TIER_COSTS[t];
                const have = parseInt(tierPointInputs[t] ?? '0', 10) || 0;
                const canAfford = have >= cost;
                const sel = targetTier === t;
                const c = TIER_COLORS[t];
                return (
                  <Pressable key={t} onPress={() => setTargetTier(sel ? null : t)} style={{ flexDirection: 'row', alignItems: 'stretch', backgroundColor: sel ? theme.surface2 : theme.surface, borderWidth: 1, borderColor: sel ? c : theme.hairline2, marginBottom: 5 }}>
                    <View style={{ width: 6, backgroundColor: c }} />
                    <View style={{ flex: 1, padding: 10, paddingHorizontal: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                        <Text style={{ fontFamily: theme.display, fontSize: 14, fontWeight: '600', color: c, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t}</Text>
                        <MonoLabel size={9}>+{TIER_ADDITIONS[t]}/STAT</MonoLabel>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <MonoLabel size={9}>NEED {cost} · HAVE</MonoLabel>
                        <TextInput keyboardType="numeric" value={tierPointInputs[t] ?? ''} onChangeText={v => setTierPointInputs(prev => ({ ...prev, [t]: v }))} placeholder="0" placeholderTextColor={theme.inkGhost} style={{ backgroundColor: theme.surface3, color: theme.ink, fontFamily: theme.mono, fontSize: 11, padding: 4, paddingHorizontal: 8, minWidth: 50 }} />
                        {!canAfford && have > 0 && <MonoLabel size={9} color={theme.neg}>{cost - have} SHORT</MonoLabel>}
                      </View>
                    </View>
                    <View style={{ width: 50, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: theme.hairline2 }}>
                      <Text style={{ fontSize: 18, fontWeight: '300', color: canAfford ? theme.pos : theme.inkGhost }}>{canAfford ? '✓' : '·'}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}

          <Pressable onPress={project} disabled={!selectedPlayer} style={{ marginTop: 24, backgroundColor: selectedPlayer ? theme.ink : theme.surface2, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2.5, fontWeight: '600', color: selectedPlayer ? theme.bg : theme.inkGhost }}>
              {selectedPlayer ? 'RUN PROJECTION' : 'SELECT A SUBJECT'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.push('/compare')} style={{ marginTop: 12, borderWidth: 1, borderColor: theme.hairline3, paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, fontWeight: '600', color: theme.steelLight }}>
              HEAD-TO-HEAD COMPARISON →
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
