import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { AppHeader } from '../../src/components/AppHeader';
import { MonoLabel } from '../../src/components/atoms/MonoLabel';
import { useSquad } from '../../src/hooks/useSquad';
import { useManager } from '../../src/context/ManagerContext';
import { theme } from '../../src/constants/theme';
import gameProfileJson from '../../profiles/game_2025.json';
import type { GameProfile, TierName } from '../../src/types/resources';
import type { PlaystyleLevel, StateTransitionResult } from '../../src/types/planning';
import { PLAYSTYLE_CATALOG, PLAYSTYLE_LEVEL_EFFECT } from '../../src/data/playstyles';
import { getWhiteStatKeys } from '../../src/utils/roleWeights';
import {
  availableRoleAdditions,
  planningStateFromPlayer,
  previewDeployment,
  previewPlaystyleAssignment,
  previewRoleUnlock,
  previewTierUpgrade,
  tierPath,
} from '../../src/logic/stateTransitions';

const profile = gameProfileJson as unknown as GameProfile;
const TIERS: TierName[] = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
const LEVELS: PlaystyleLevel[] = ['Standard', 'Intermediate', 'Advanced', 'Master'];

function Choice({
  label, active, onPress, sub,
}: { label: string; active: boolean; onPress: () => void; sub?: string }) {
  return (
    <Pressable onPress={onPress} style={{
      borderWidth: 1,
      borderColor: active ? theme.steelLight : theme.hairline2,
      backgroundColor: active ? theme.steelLight + '16' : theme.surface,
      padding: 10,
      minWidth: 76,
    }}>
      <Text style={{ fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, color: active ? theme.ink : theme.inkSec }}>
        {label}
      </Text>
      {sub ? <MonoLabel size={7} color={theme.inkGhost} style={{ marginTop: 3 }}>{sub}</MonoLabel> : null}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: theme.hairline2, marginBottom: 14 }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.hairline2, backgroundColor: theme.surface2 }}>
        <MonoLabel size={9} color={theme.steelLight}>{title}</MonoLabel>
      </View>
      <View style={{ padding: 12 }}>{children}</View>
    </View>
  );
}

export default function StateLabScreen() {
  const { squad } = useSquad();
  const manager = useManager();
  const player = squad.find(p => p.id === manager.selectedPlayerId) ?? squad[0] ?? null;

  const [roleToAdd, setRoleToAdd] = useState<string | null>(null);
  const [tierTarget, setTierTarget] = useState<TierName | null>(null);
  const [playstyleId, setPlaystyleId] = useState<string | null>(null);
  const [playstyleLevel, setPlaystyleLevel] = useState<PlaystyleLevel>('Master');
  const [deployedRole, setDeployedRole] = useState<string | null>(null);
  const [freeRoleAvailable, setFreeRoleAvailable] = useState(true);

  useEffect(() => {
    setRoleToAdd(null);
    setTierTarget(null);
    setPlaystyleId(null);
    setPlaystyleLevel('Master');
    setDeployedRole(player?.role[0] ?? null);
  }, [player?.id]);

  const projection = useMemo(() => {
    if (!player) return null;
    try {
      let state = planningStateFromPlayer(player);
      let roleStep: StateTransitionResult | null = null;
      let tierStep: StateTransitionResult | null = null;
      let playstyleStep: StateTransitionResult | null = null;
      let deploymentStep: StateTransitionResult | null = null;

      if (roleToAdd) {
        roleStep = previewRoleUnlock(state, roleToAdd, profile);
        state = roleStep.after;
      }
      if (tierTarget && TIERS.indexOf(tierTarget) > TIERS.indexOf(state.tier)) {
        tierStep = previewTierUpgrade(state, tierTarget, profile);
        state = tierStep.after;
      }
      if (playstyleId) {
        playstyleStep = previewPlaystyleAssignment(state, playstyleId, playstyleLevel);
        state = playstyleStep.after;
      }

      const deployment = deployedRole && state.roles.includes(deployedRole) ? deployedRole : state.roles[0];
      if (deployment) {
        deploymentStep = previewDeployment(state, deployment);
        state = deploymentStep.after;
      }

      return { state, roleStep, tierStep, playstyleStep, deploymentStep, error: null as string | null };
    } catch (e) {
      return {
        state: planningStateFromPlayer(player),
        roleStep: null,
        tierStep: null,
        playstyleStep: null,
        deploymentStep: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [player, roleToAdd, tierTarget, playstyleId, playstyleLevel, deployedRole]);

  if (!player || !projection) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <AppHeader />
        <View style={{ padding: 20 }}>
          <MonoLabel color={theme.inkGhost}>ADD A PLAYER BEFORE USING STATE LAB</MonoLabel>
        </View>
      </View>
    );
  }

  const observedLearningRole = player.newRole
    ? { role: player.newRole, points: player.newRolePoints ?? 0 }
    : null;
  const roleOptions = availableRoleAdditions(player.role, observedLearningRole);
  const finalState = projection.state;
  const whiteNow = getWhiteStatKeys(player.role);
  const whiteAfter = getWhiteStatKeys(finalState.roles);
  const higherTiers = TIERS.slice(TIERS.indexOf(player.tier) + 1);
  const changedStats = Object.keys(finalState.stats)
    .filter(k => finalState.stats[k] !== player.stats[k])
    .sort();
  const selectedTierPath = tierTarget ? tierPath(
    projection.roleStep?.after.tier ?? player.tier,
    tierTarget,
    profile,
  ) : [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        <View style={{ marginBottom: 14, padding: 14, borderWidth: 1, borderColor: theme.hairline2, backgroundColor: theme.surface }}>
          <MonoLabel size={8} color={theme.steelLight}>PREVIEW ONLY · NOTHING WRITTEN TO PLAYER CARD</MonoLabel>
          <Text style={{ fontFamily: theme.display, color: theme.ink, fontSize: 22, fontWeight: '600', marginTop: 4 }}>
            {player.name}
          </Text>
          <MonoLabel size={9} color={theme.inkMuted} style={{ marginTop: 4 }}>
            {player.role.join(' · ')} · {player.tier} · {player.overall.toFixed(1)} OVR
          </MonoLabel>
          {(observedLearningRole || player.playstyle || player.specialAbilities?.length || player.boosts) ? (
            <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 5 }}>
              {observedLearningRole ? `LEARNING ${observedLearningRole.role} ${observedLearningRole.points}/50 · ` : ''}
              {player.playstyle ? `PLAYSTYLE FAMILY ${player.playstyle.toUpperCase()} · ` : ''}
              {player.specialAbilities?.length ? `ABILITIES ${player.specialAbilities.length} · ` : ''}
              {player.boosts ? `BOOSTS ${Object.keys(player.boosts).length}` : ''}
            </MonoLabel>
          ) : null}
          <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 8 }}>
            ROLE / TIER / PLAYSTYLE ACTIONS ARE PERMANENT IN GAME. THIS BRANCH IS DISCARDABLE HERE.
          </MonoLabel>
        </View>

        <Section title="1 · ROLE BRANCH">
          {observedLearningRole ? (
            <MonoLabel size={8} color={theme.hot} style={{ marginBottom: 9 }}>
              OCR INTAKE · {observedLearningRole.role} {observedLearningRole.points}/50 IN PROGRESS
            </MonoLabel>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Choice label="NONE" active={!roleToAdd} onPress={() => setRoleToAdd(null)} />
            {roleOptions.map(role => (
              <Choice key={role} label={role} active={roleToAdd === role} onPress={() => {
                setRoleToAdd(role);
                setDeployedRole(role);
              }} />
            ))}
          </View>
          <Pressable onPress={() => setFreeRoleAvailable(v => !v)} style={{ marginTop: 10, padding: 9, borderWidth: 1, borderColor: theme.hairline2 }}>
            <MonoLabel size={8} color={freeRoleAvailable ? theme.pos : theme.hot}>
              SEASONAL FREE ROLE · {freeRoleAvailable ? 'AVAILABLE' : 'USED / TRAINING PATH'}
            </MonoLabel>
          </Pressable>
          {projection.roleStep && (
            <View style={{ marginTop: 10 }}>
              <MonoLabel size={8} color={theme.inkSec}>
                NEW WHITE · {projection.roleStep.newlyWhite.length ? projection.roleStep.newlyWhite.join(' · ') : 'NONE'}
              </MonoLabel>
              <MonoLabel size={8} color={theme.inkGhost} style={{ marginTop: 4 }}>
                {roleToAdd && observedLearningRole?.role === roleToAdd
                  ? `RESOURCE PATH: COMPLETE OBSERVED ROLE TRAINING · ${observedLearningRole.points}/50`
                  : freeRoleAvailable
                    ? 'RESOURCE PATH: 1 SEASONAL FREE ROLE'
                    : 'RESOURCE PATH: ROLE TRAINING REQUIRED · DURATION NOT MODELLED'}
              </MonoLabel>
            </View>
          )}
        </Section>

        <Section title="2 · TIER BRANCH">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Choice label="NONE" active={!tierTarget} onPress={() => setTierTarget(null)} />
            {higherTiers.map(tier => (
              <Choice
                key={tier}
                label={tier}
                active={tierTarget === tier}
                onPress={() => setTierTarget(tier)}
                sub={`+${profile.tierAttrAdditions[tier] ?? 0} FROM T0`}
              />
            ))}
          </View>
          {selectedTierPath.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {selectedTierPath.map(step => {
                const have = manager.tierPoints[step.tier] ?? 0;
                const short = Math.max(0, step.pointsRequired - have);
                return (
                  <MonoLabel key={step.tier} size={8} color={short > 0 ? theme.hot : theme.pos} style={{ marginBottom: 3 }}>
                    {step.tier} · NEED {step.pointsRequired} · HAVE {have}{short > 0 ? ` · SHORT ${short}` : ' · COVERED'}
                  </MonoLabel>
                );
              })}
              <MonoLabel size={7} color={theme.inkGhost} style={{ marginTop: 3 }}>
                GEM TOP-UP EXCHANGE IS NOT MODELLED IN THIS PAGE.
              </MonoLabel>
            </View>
          )}
        </Section>

        <Section title="3 · PLAYSTYLE OPTION">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Choice label="NONE" active={!playstyleId} onPress={() => setPlaystyleId(null)} />
            {PLAYSTYLE_CATALOG.map(style => (
              <Choice
                key={style.id}
                label={style.name.toUpperCase()}
                active={playstyleId === style.id}
                onPress={() => setPlaystyleId(style.id)}
                sub={style.compatibleRoles.join('/')}
              />
            ))}
          </View>
          {playstyleId && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {LEVELS.map(level => (
                <Choice
                  key={level}
                  label={level.toUpperCase()}
                  active={playstyleLevel === level}
                  onPress={() => setPlaystyleLevel(level)}
                  sub={`EFFECT ×${PLAYSTYLE_LEVEL_EFFECT[level]}`}
                />
              ))}
            </View>
          )}
        </Section>

        <Section title="4 · DEPLOYED POSITION">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {finalState.roles.map(role => (
              <Choice
                key={role}
                label={role}
                active={(deployedRole ?? finalState.roles[0]) === role}
                onPress={() => setDeployedRole(role)}
              />
            ))}
          </View>
          {projection.deploymentStep?.notes.map((note, i) => (
            <MonoLabel key={i} size={8} color={note.includes('ACTIVE') ? theme.pos : theme.inkMuted} style={{ marginTop: 8 }}>
              {note}
            </MonoLabel>
          ))}
        </Section>

        <Section title="PROJECTED STATE">
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1, padding: 10, borderWidth: 1, borderColor: theme.hairline2 }}>
              <MonoLabel size={8}>OVR</MonoLabel>
              <Text style={{ fontFamily: theme.display, fontSize: 24, color: theme.ink, marginTop: 3 }}>
                {player.overall.toFixed(1)} → {finalState.overall.toFixed(1)}
              </Text>
            </View>
            <View style={{ flex: 1, padding: 10, borderWidth: 1, borderColor: theme.hairline2 }}>
              <MonoLabel size={8}>WHITE STATS</MonoLabel>
              <Text style={{ fontFamily: theme.display, fontSize: 24, color: theme.ink, marginTop: 3 }}>
                {whiteNow.length} → {whiteAfter.length}
              </Text>
            </View>
          </View>

          <MonoLabel size={8} color={theme.inkSec}>
            FINAL ROLES · {finalState.roles.join(' · ')} · TIER {finalState.tier}
          </MonoLabel>
          {projection.error && (
            <MonoLabel size={8} color={theme.neg} style={{ marginTop: 8 }}>{projection.error}</MonoLabel>
          )}

          <View style={{ marginTop: 12 }}>
            {changedStats.length === 0 ? (
              <MonoLabel size={8} color={theme.inkGhost}>NO ATTRIBUTE CHANGES IN THIS BRANCH</MonoLabel>
            ) : changedStats.map(stat => {
              const before = player.stats[stat];
              const after = finalState.stats[stat];
              const delta = after - before;
              return (
                <View key={stat} style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
                  <MonoLabel size={8} color={theme.inkSec} style={{ flex: 1 }}>{stat}</MonoLabel>
                  <MonoLabel size={8} color={theme.ink}>{before.toFixed(0)} → {after.toFixed(0)}</MonoLabel>
                  <MonoLabel size={8} color={delta > 0 ? theme.pos : theme.neg} style={{ width: 48, textAlign: 'right' }}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(0)}
                  </MonoLabel>
                </View>
              );
            })}
          </View>
        </Section>

        <View style={{ padding: 12, borderWidth: 1, borderColor: theme.hot + '66' }}>
          <MonoLabel size={8} color={theme.hot}>BOUNDARY</MonoLabel>
          <MonoLabel size={8} color={theme.inkMuted} style={{ marginTop: 6 }}>
            ROLE + TIER CONSEQUENCES ARE DETERMINISTIC FROM CURRENT OBSERVED RULES. PLAYSTYLE ONLY MODELS POSITION COMPATIBILITY. COACHES REMAIN IN CALIBRATION AND ARE NOT COMPOSED INTO THIS PAGE YET.
          </MonoLabel>
        </View>
      </ScrollView>
    </View>
  );
}
