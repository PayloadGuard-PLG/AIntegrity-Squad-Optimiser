import { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { useSquad } from '../../src/hooks/useSquad';
import { useManager } from '../../src/context/ManagerContext';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { Chip } from '../../src/components/atoms/Chip';
import { theme, TIER_COLORS } from '../../src/constants/theme';
import { isWhiteStat, getWhiteStatKeys, getAllStatKeys } from '../../src/utils/roleWeights';
import { StatGrid3Col } from '../../src/components/StatGrid3Col';
import { estimateStatGainPct, applyTierBonusToStats } from '../../src/logic/xpEngine';
import { playerService } from '../../src/services/playerService';
import { computeOvrFromStats, computeOvrWithPadding } from '../../src/logic/ovrProjector';
import gameProfileJson from '../../profiles/game_2025.json';
import { DrillLevel, TalentTier, TierName, GameProfile } from '../../src/types/resources'; // DrillLevel used by ACADEMY_DRILL_LEVEL

const profile = gameProfileJson as unknown as GameProfile;

// Academy coaches always run at Very Hard rate — no difficulty picker needed
const ACADEMY_DRILL_LEVEL: DrillLevel = 'Very Hard';
const TALENT_LABEL: Record<TalentTier, string> = { Fastest: '×1.5', Fast: '×1.25', Average: '×1.1', Normal: '×1.0', Slow: '×0.7' };
const TIER_ORDER: TierName[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
const TIER_COSTS: Record<TierName, number> = { T0: 0, T1: 100, T2: 90, T3: 50, T4: 25, T5: 15, T6: 10 };
const TIER_ADDITIONS: Record<TierName, number> = { T0: 0, T1: 10, T2: 30, T3: 50, T4: 80, T5: 120, T6: 160 };
const CONDITION_PER_RESTORER = 15;
const CONDITION_PER_RECOVERY = 25; // recovery kit restores ~25% condition

type SessionEntry = {
  id: string;
  stats: string[];
  sessions: string;
};

type StepResult = {
  label: string;
  ovrBefore: number;
  ovrAfter: number;
  detail?: string;
  color?: string;
};

let _uid = 0;
function uid() { return String(++_uid); }

export default function ResultsScreen() {
  const { squad } = useSquad();
  const manager = useManager();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [twoxAd, setTwoxAd] = useState(false);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [selectedTier, setSelectedTier] = useState<TierName | null>(null);
  const [tierPointInputs, setTierPointInputs] = useState<Partial<Record<TierName, string>>>(() =>
    Object.fromEntries(TIER_ORDER.map(t => [t, manager.tierPoints[t] != null ? String(manager.tierPoints[t]) : '']))
  );
  const [restorers, setRestorers] = useState('');
  const [restPacks, setRestPacks] = useState('');
  const [result, setResult] = useState<StepResult[] | null>(null);
  const [finalStats, setFinalStats] = useState<Record<string, number> | null>(null);

  const player = squad.find(p => p.id === selectedId) ?? (squad.length === 1 ? squad[0] : null);

  const { white, grey } = useMemo(() => {
    if (!player) return { white: [] as string[], grey: [] as string[] };
    const w = getWhiteStatKeys(player.role);
    const all = getAllStatKeys(player.role);
    return { white: w, grey: all.filter(s => !w.includes(s)) };
  }, [player]);

  const upgradableTiers = useMemo(() => {
    if (!player) return TIER_ORDER;
    const idx = TIER_ORDER.indexOf(player.tier as TierName);
    return TIER_ORDER.filter((_, i) => i > idx);
  }, [player]);

  function selectPlayer(id: string) {
    setSelectedId(id);
    setSessions([]);
    setSelectedTier(null);
    setResult(null);
    setFinalStats(null);
  }

  function addSession() {
    setSessions(prev => [...prev, { id: uid(), stats: [], sessions: '30' }]);
    setResult(null);
  }

  function removeSession(id: string) {
    setSessions(prev => prev.filter(s => s.id !== id));
    setResult(null);
  }

  function updateSession(id: string, patch: Partial<SessionEntry>) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    setResult(null);
  }

  function toggleSessionStat(id: string, stat: string) {
    setSessions(prev => prev.map(s => {
      if (s.id !== id) return s;
      const next = s.stats.includes(stat) ? s.stats.filter(x => x !== stat) : [...s.stats, stat];
      return { ...s, stats: next };
    }));
    setResult(null);
  }

  function runProjection() {
    if (!player) return;
    const steps: StepResult[] = [];
    let currentStats = { ...player.stats };
    let currentOvr = computeOvrFromStats(player, profile);

    // 1. Each coaching session in order
    for (const session of sessions) {
      if (session.stats.length === 0) continue;
      const n = parseInt(session.sessions, 10) || 0;
      if (n === 0) continue;
      const drillMult = profile.drillLevelMultipliers[ACADEMY_DRILL_LEVEL] ?? 1.7;
      const budget = n * profile.baseXpPerSession / session.stats.length;
      const updatedStats = { ...currentStats };
      const gainParts: string[] = [];

      for (const stat of session.stats) {
        const from = currentStats[stat];
        if (from === undefined) continue;
        const isWhite = isWhiteStat(player.role, stat);
        const gain = estimateStatGainPct(budget, from, player.age, 0, player.talent, isWhite, twoxAd, drillMult, profile);
        if (gain > 0) {
          updatedStats[stat] = Math.min(from + gain, profile.statCap);
          gainParts.push(`${stat} +${gain.toFixed(1)}`);
        }
      }

      const ovrAfter = computeOvrWithPadding(updatedStats, player.overall, profile);
      steps.push({
        label: `COACHING ×${n} (VH) — ${session.stats.length} STAT${session.stats.length !== 1 ? 'S' : ''}`,
        ovrBefore: currentOvr,
        ovrAfter: Number(ovrAfter.toFixed(1)),
        detail: gainParts.length > 0 ? gainParts.join(' · ') : 'no gains — enter stat values',
        color: theme.steelLight,
      });
      currentStats = updatedStats;
      currentOvr = ovrAfter;
    }

    // 2. Tier upgrade
    if (selectedTier) {
      const roleKeys = getAllStatKeys(player.role);
      const afterTier = applyTierBonusToStats(currentStats, roleKeys, selectedTier, profile, player.tier);
      const ovrAfter = Number(computeOvrWithPadding(afterTier, player.overall, profile).toFixed(1));
      steps.push({
        label: `TIER → ${selectedTier.toUpperCase()} (+${TIER_ADDITIONS[selectedTier]} / ROLE STAT)`,
        ovrBefore: currentOvr,
        ovrAfter,
        detail: `${roleKeys.length} role stats +${TIER_ADDITIONS[selectedTier]}, off-role +1`,
        color: TIER_COLORS[selectedTier] ?? theme.hot,
      });
      currentStats = afterTier;
      currentOvr = ovrAfter;
    }

    // 3. Restorers — condition restore (informational)
    const restorerCount = parseInt(restorers, 10) || 0;
    if (restorerCount > 0) {
      const condPct = Math.min(restorerCount * CONDITION_PER_RESTORER, 100);
      steps.push({
        label: `RESTORERS ×${restorerCount} → +${condPct}% CONDITION`,
        ovrBefore: currentOvr,
        ovrAfter: currentOvr,
        detail: 'condition restore — no OVR change',
        color: theme.pos,
      });
    }

    // 4. Recovery kits — condition restore (informational)
    const recoveryCount = parseInt(restPacks, 10) || 0;
    if (recoveryCount > 0) {
      const condPct = Math.min(recoveryCount * CONDITION_PER_RECOVERY, 100);
      steps.push({
        label: `RECOVERY KITS ×${recoveryCount} → +${condPct}% CONDITION`,
        ovrBefore: currentOvr,
        ovrAfter: currentOvr,
        detail: 'enables additional training sessions',
        color: theme.inkSec,
      });
    }

    setResult(steps);
    setFinalStats(currentStats);
  }

  const finalOvr = result ? result[result.length - 1]?.ovrAfter ?? null : null;
  const baseOvr = result ? result[0]?.ovrBefore ?? null : null;
  const totalGain = finalOvr != null && baseOvr != null ? Number((finalOvr - baseOvr).toFixed(1)) : null;
  const ready = player && (sessions.some(s => s.stats.length > 0 && parseInt(s.sessions, 10) > 0) || selectedTier);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 14, paddingHorizontal: 16, paddingBottom: 60 }}>

        {/* Player */}
        {squad.length > 1 && (
          <>
            <MonoLabel color={theme.steelLight} style={{ marginBottom: 8 }}>SUBJECT</MonoLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row', gap: 5, paddingBottom: 14 }}>
              {squad.map(p => (
                <Chip key={p.id} active={p.id === player?.id} onPress={() => selectPlayer(p.id)}>
                  {p.name}
                </Chip>
              ))}
            </ScrollView>
          </>
        )}

        {!player ? (
          <View style={{ padding: 32, borderWidth: 1, borderColor: theme.hairline, alignItems: 'center' }}>
            <MonoLabel color={theme.inkGhost}>ADD A PLAYER TO BEGIN</MonoLabel>
          </View>
        ) : (
          <>
            {/* Player info strip */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.display, fontSize: 17, fontWeight: '700', color: theme.ink }}>{player.name}</Text>
                <MonoLabel size={9} color={theme.inkSec}>AGE {player.age} · {player.role.join(' / ')} · {player.tier ?? 'NO TIER'}</MonoLabel>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: theme.display, fontSize: 24, fontWeight: '700', color: theme.ink }}>{player.overall}</Text>
                <MonoLabel size={8} color={theme.inkGhost}>OVR NOW</MonoLabel>
              </View>
            </View>

            {/* Talent (from card) + 2× ad */}
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 12, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <MonoLabel style={{ width: 56 }}>TALENT</MonoLabel>
                <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.steelLight }}>
                  <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: theme.steelLight }}>
                    {TALENT_LABEL[player.talent] ?? player.talent}
                  </Text>
                </View>
                <MonoLabel size={8} color={theme.inkGhost}>FROM CARD</MonoLabel>
              </View>
              <Pressable onPress={() => { setTwoxAd(v => !v); setResult(null); setFinalStats(null); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: twoxAd ? theme.hot : theme.hairline2, padding: 8, backgroundColor: twoxAd ? theme.surface2 : 'transparent' }}>
                <View style={{ width: 12, height: 12, backgroundColor: twoxAd ? theme.hot : 'transparent', borderWidth: 1, borderColor: twoxAd ? theme.hot : theme.hairline3 }} />
                <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1.2, color: twoxAd ? theme.hot : theme.inkSec }}>2× AD ACTIVE</Text>
                {twoxAd && <Text style={{ fontFamily: theme.mono, fontSize: 10, color: theme.hot, marginLeft: 'auto' }}>×2.0</Text>}
              </Pressable>
            </View>

            {/* Coaching sessions */}
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 3, height: 12, backgroundColor: theme.steelLight, marginRight: 8 }} />
                <MonoLabel size={10} color={theme.steelLight} style={{ flex: 1 }}>COACHING SESSIONS</MonoLabel>
                <Pressable onPress={addSession}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: theme.steelLight }}>
                  <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: theme.steelLight }}>+ ADD</Text>
                </Pressable>
              </View>

              {sessions.length === 0 && (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <MonoLabel color={theme.inkGhost}>TAP + ADD TO ADD A COACHING SESSION</MonoLabel>
                </View>
              )}

              {sessions.map((sess, idx) => (
                <View key={sess.id} style={{ borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: theme.hairline2, padding: 12 }}>
                  {/* Session header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <MonoLabel size={9} color={theme.steelLight} style={{ flex: 1 }}>SESSION {idx + 1}</MonoLabel>
                    <Pressable onPress={() => removeSession(sess.id)}
                      style={{ paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: theme.neg + '66' }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 9, color: theme.neg }}>REMOVE</Text>
                    </Pressable>
                  </View>

                  {/* Sessions × and intensity */}
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <MonoLabel size={9} style={{ width: 24 }}>×</MonoLabel>
                    <View style={{ width: 72, borderWidth: 1, borderColor: theme.hairline2 }}>
                      <TextInput
                        keyboardType="numeric"
                        value={sess.sessions}
                        onChangeText={v => updateSession(sess.id, { sessions: v.replace(/[^0-9]/g, '') })}
                        placeholder="30"
                        placeholderTextColor={theme.inkGhost}
                        style={{ fontFamily: theme.mono, fontSize: 16, fontWeight: '700', color: theme.ink, padding: 7, textAlign: 'center' }}
                      />
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: theme.ink, backgroundColor: theme.ink }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 9, letterSpacing: 0.5, color: theme.bg }}>VERY HARD</Text>
                    </View>
                    <MonoLabel size={8} color={theme.inkGhost}>ACADEMY</MonoLabel>
                  </View>

                  {/* Stat picker — 3-col grid */}
                  <StatGrid3Col
                    statKeys={[...white, ...grey]}
                    roles={player.role}
                    values={player.stats}
                    selected={new Set(sess.stats)}
                    onToggle={stat => toggleSessionStat(sess.id, stat)}
                  />

                  {/* Summary chip */}
                  {sess.stats.length > 0 && (
                    <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.steelLight }} />
                      <MonoLabel size={8} color={theme.inkSec}>
                        {sess.stats.length} STAT{sess.stats.length !== 1 ? 'S' : ''} · ×{sess.sessions || '0'} SESSIONS · VERY HARD ({profile.drillLevelMultipliers[ACADEMY_DRILL_LEVEL]}×)
                      </MonoLabel>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Tier upgrade */}
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 3, height: 12, backgroundColor: theme.hot, marginRight: 8 }} />
                <MonoLabel size={10} color={theme.steelLight} style={{ flex: 1 }}>TIER UPGRADE</MonoLabel>
                {player.tier && player.tier !== 'T0' && (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: TIER_COLORS[player.tier] ?? theme.hairline2 }}>
                    <Text style={{ fontFamily: theme.mono, fontSize: 8, letterSpacing: 1, color: TIER_COLORS[player.tier] ?? theme.inkSec }}>
                      NOW: {player.tier.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>

              {upgradableTiers.length === 0 ? (
                <View style={{ padding: 14, alignItems: 'center' }}>
                  <MonoLabel color={theme.inkGhost}>LEGENDARY — MAXED</MonoLabel>
                </View>
              ) : (
                upgradableTiers.map((t, idx) => {
                  const cost = TIER_COSTS[t];
                  const have = parseInt(tierPointInputs[t] ?? '0', 10) || 0;
                  const canAfford = have >= cost;
                  const sel = selectedTier === t;
                  const c = TIER_COLORS[t] ?? theme.inkSec;
                  return (
                    <Pressable key={t}
                      onPress={() => { setSelectedTier(sel ? null : t); setResult(null); }}
                      style={{ borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: theme.hairline2, borderLeftWidth: sel ? 3 : 0, borderLeftColor: c, backgroundColor: sel ? theme.surface2 : 'transparent', padding: 11, paddingHorizontal: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontFamily: theme.display, fontSize: 13, fontWeight: '700', color: c, textTransform: 'uppercase', minWidth: 82 }}>{t}</Text>
                        <MonoLabel size={9} color={theme.inkSec} style={{ flex: 1 }}>+{TIER_ADDITIONS[t]}/STAT · NEED {cost}</MonoLabel>
                        <TextInput
                          keyboardType="numeric"
                          value={tierPointInputs[t] ?? ''}
                          onChangeText={v => {
                            const clean = v.replace(/[^0-9]/g, '');
                            setTierPointInputs(prev => ({ ...prev, [t]: clean }));
                            manager.setTierPoints({ ...manager.tierPoints, [t]: parseInt(clean, 10) || 0 });
                            setResult(null); setFinalStats(null);
                          }}
                          placeholder="0"
                          placeholderTextColor={theme.inkGhost}
                          style={{ color: canAfford ? theme.pos : theme.ink, fontFamily: theme.mono, fontSize: 12, fontWeight: '700', padding: 5, paddingHorizontal: 8, minWidth: 52, borderWidth: 1, borderColor: canAfford ? theme.pos + '66' : theme.hairline2, backgroundColor: theme.surface2, textAlign: 'center' }}
                        />
                        <Text style={{ fontFamily: theme.mono, fontSize: 18, fontWeight: '700', color: canAfford ? theme.pos : theme.inkGhost, minWidth: 20, textAlign: 'center' }}>
                          {canAfford ? '✓' : '·'}
                        </Text>
                      </View>
                      {!canAfford && have > 0 && (
                        <MonoLabel size={8} color={theme.neg} style={{ marginTop: 4, marginLeft: 92 }}>
                          {cost - have} SHORT
                        </MonoLabel>
                      )}
                      {canAfford && !sel && (
                        <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 4, marginLeft: 92 }}>
                          TAP TO INCLUDE IN PLAN
                        </MonoLabel>
                      )}
                    </Pressable>
                  );
                })
              )}
            </View>

            {/* Condition — restorers + recovery kits */}
            <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 3, height: 12, backgroundColor: theme.pos, marginRight: 8 }} />
                <MonoLabel size={10} color={theme.steelLight}>CONDITION RESTORE</MonoLabel>
              </View>
              <View style={{ flexDirection: 'row' }}>
                {/* Restorers */}
                <View style={{ flex: 1, padding: 12, borderRightWidth: 1, borderRightColor: theme.hairline2 }}>
                  <MonoLabel size={9} color={theme.inkSec} style={{ marginBottom: 6 }}>RESTORERS (+{CONDITION_PER_RESTORER}% EA)</MonoLabel>
                  <TextInput
                    keyboardType="numeric"
                    value={restorers}
                    onChangeText={v => { setRestorers(v.replace(/[^0-9]/g, '')); setResult(null); }}
                    placeholder="0"
                    placeholderTextColor={theme.inkGhost}
                    style={{ fontFamily: theme.mono, fontSize: 20, fontWeight: '700', color: theme.ink, borderWidth: 1, borderColor: theme.hairline2, padding: 8, textAlign: 'center' }}
                  />
                </View>
                {/* Recovery kits */}
                <View style={{ flex: 1, padding: 12 }}>
                  <MonoLabel size={9} color={theme.inkSec} style={{ marginBottom: 6 }}>RECOVERY KITS (+{CONDITION_PER_RECOVERY}% EA)</MonoLabel>
                  <TextInput
                    keyboardType="numeric"
                    value={restPacks}
                    onChangeText={v => { setRestPacks(v.replace(/[^0-9]/g, '')); setResult(null); }}
                    placeholder="0"
                    placeholderTextColor={theme.inkGhost}
                    style={{ fontFamily: theme.mono, fontSize: 20, fontWeight: '700', color: theme.ink, borderWidth: 1, borderColor: theme.hairline2, padding: 8, textAlign: 'center' }}
                  />
                </View>
              </View>
            </View>

            {/* Project button */}
            <Pressable onPress={runProjection}
              style={{ borderWidth: 1, borderColor: ready ? theme.ink : theme.hairline2, padding: 18, alignItems: 'center', marginBottom: 14, backgroundColor: ready ? theme.surface2 : 'transparent' }}>
              <Text style={{ fontFamily: theme.mono, fontSize: 13, letterSpacing: 2.5, color: ready ? theme.ink : theme.inkGhost }}>
                ▶ PROJECT FULL PLAN
              </Text>
            </Pressable>

            {/* Results */}
            {result && result.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: totalGain != null && totalGain > 0 ? theme.pos + '66' : theme.hairline2 }}>
                {/* Final OVR banner */}
                <View style={{ padding: 16, backgroundColor: theme.surface2, borderBottomWidth: 1, borderBottomColor: theme.hairline2, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <MonoLabel size={8} color={theme.steelLight} style={{ marginBottom: 4 }}>FULL PLAN RESULT</MonoLabel>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                      <Text style={{ fontFamily: theme.display, fontSize: 34, fontWeight: '700', color: theme.inkGhost }}>{baseOvr?.toFixed(0)}</Text>
                      <Text style={{ fontFamily: theme.mono, fontSize: 20, color: theme.inkGhost }}>→</Text>
                      <Text style={{ fontFamily: theme.display, fontSize: 34, fontWeight: '700', color: theme.pos }}>{finalOvr?.toFixed(1)}</Text>
                    </View>
                  </View>
                  {totalGain != null && (
                    <View style={{ borderWidth: 1, borderColor: totalGain > 0 ? theme.pos + '66' : theme.hairline2, padding: 12, alignItems: 'center', minWidth: 72 }}>
                      <Text style={{ fontFamily: theme.mono, fontSize: 22, fontWeight: '700', color: totalGain > 0 ? theme.pos : theme.inkMuted }}>
                        {totalGain > 0 ? '+' : ''}{totalGain}
                      </Text>
                      <MonoLabel size={8} color={totalGain > 0 ? theme.pos : theme.inkMuted}>TOTAL</MonoLabel>
                    </View>
                  )}
                </View>

                {/* Step-by-step chain */}
                {result.map((step, i) => {
                  const stepGain = Number((step.ovrAfter - step.ovrBefore).toFixed(1));
                  return (
                    <View key={i} style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i < result.length - 1 ? 1 : 0, borderBottomColor: theme.hairline, flexDirection: 'row', alignItems: 'flex-start', borderLeftWidth: 3, borderLeftColor: step.color ?? theme.hairline2 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 0.8, color: theme.inkSec, marginBottom: 3 }}>{step.label}</Text>
                        {step.detail && <MonoLabel size={8} color={theme.inkGhost}>{step.detail}</MonoLabel>}
                      </View>
                      <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                        <Text style={{ fontFamily: theme.display, fontSize: 14, fontWeight: '700', color: step.color ?? theme.ink }}>{step.ovrAfter.toFixed(1)}</Text>
                        {stepGain !== 0 && (
                          <MonoLabel size={8} color={stepGain > 0 ? theme.pos : theme.inkGhost}>
                            {stepGain > 0 ? '+' : ''}{stepGain}
                          </MonoLabel>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Apply full plan to player card */}
            {finalStats && finalOvr != null && (
              <Pressable
                onPress={() => {
                  if (!player || !finalStats) return;
                  playerService.applyAndSnapshot(player, {
                    stats: finalStats,
                    overall: Number(finalOvr.toFixed(1)),
                    tier: selectedTier ?? player.tier,
                  });
                  setResult(null);
                  setFinalStats(null);
                  setSessions([]);
                  setSelectedTier(null);
                }}
                style={{ borderWidth: 1, borderColor: theme.pos, padding: 14, alignItems: 'center', marginTop: 14, backgroundColor: theme.pos + '18' }}>
                <Text style={{ fontFamily: theme.mono, fontSize: 11, letterSpacing: 2, color: theme.pos, fontWeight: '700' }}>
                  ✓ APPLY FULL PLAN TO CARD
                </Text>
                <MonoLabel size={8} color={theme.pos} style={{ marginTop: 4 }}>
                  {selectedTier ? `STATS + OVR + TIER → ${selectedTier.toUpperCase()}` : 'STATS + OVR ONLY'}
                </MonoLabel>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
