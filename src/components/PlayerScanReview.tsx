import { View, Text, TextInput, Pressable } from 'react-native';
import type { ReviewFlag } from '../logic/glyphReader';
import type { PlayerCardState } from '../logic/playerScanState';
import { theme } from '../constants/theme';
import { MonoLabel } from './atoms/MonoLabel';

interface Props {
  state: PlayerCardState;
  review: ReviewFlag[];
  rolesPending: boolean;
  tierPending: boolean;
  onConfirmRoles: () => void;
  onConfirmTier: () => void;
  onLearningChange: (role: string | null, points: number) => void;
}

/** The same review controls on add and rescan. Learning never means white. */
export function PlayerScanReview({ state, review, rolesPending, tierPending,
  onConfirmRoles, onConfirmTier, onLearningChange }: Props) {
  const input = { color: theme.ink, fontFamily: theme.mono, fontSize: 12,
    borderWidth: 1, borderColor: theme.hairline2, padding: 10 };
  const unresolved = review.filter(f => {
    if (f.field === 'roles' || f.field.startsWith('roles.') || f.field === 'learningRole') return rolesPending;
    if (f.field === 'tier') return tierPending;
    return true;
  });
  const labels: Record<string, string> = { roles: 'roles', learningRole: 'learning role',
    tier: 'tier', playstyle: 'playstyle', specialAbilities: 'special abilities', boosts: 'boosts', image: 'image details' };
  const reviewFields = [...new Set(unresolved.map(f => labels[f.field.split('.')[0]] ?? 'card details'))];
  return (
    <View style={{ borderWidth: 1, borderColor: theme.hairline2, padding: 12, marginVertical: 12 }}>
      <MonoLabel color={theme.steelLight}>ROLE AND CARD STATE</MonoLabel>
      <Text style={{ color: theme.inkSec, fontSize: 12, marginTop: 6 }}>
        Established: {state.role.join(' / ') || 'select in the position grid'} · Tier: {state.tier}
      </Text>
      <Text style={{ color: theme.inkMuted, fontSize: 12, marginVertical: 8 }}>
        Only established roles give white stats. Enter a learning role separately; leave blank if none.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput accessibilityLabel="Learning role" placeholder="e.g. MC" placeholderTextColor={theme.inkGhost}
          autoCapitalize="characters" autoCorrect={false} maxLength={3} value={state.newRole ?? ''}
          onChangeText={value => onLearningChange(value.trim().toUpperCase() || null, state.newRolePoints ?? 0)}
          style={{ ...input, flex: 1 }} />
        <TextInput accessibilityLabel="Learning role points out of 50" keyboardType="number-pad"
          value={Number.isFinite(state.newRolePoints) ? String(state.newRolePoints) : ''}
          onChangeText={value => onLearningChange(state.newRole ?? null, /^\d+$/.test(value) ? Number(value) : NaN)}
          style={{ ...input, width: 70 }} />
        <Text style={{ color: theme.inkMuted, alignSelf: 'center' }}>/50</Text>
      </View>
      {reviewFields.length > 0 && (
        <Text style={{ color: theme.hot, fontSize: 12, marginTop: 10 }}>
          Needs review: {reviewFields.join(', ')}.
          {' '}Unread fields keep their previous values. Check against the card or rescan.
        </Text>
      )}
      {rolesPending && (
        <Pressable accessibilityRole="button" onPress={onConfirmRoles}
          style={{ padding: 12, borderWidth: 1, borderColor: theme.hot, marginTop: 10 }}>
          <Text style={{ color: theme.hot, fontSize: 12 }}>I checked the established and learning roles</Text>
        </Pressable>
      )}
      {tierPending && (
        <Pressable accessibilityRole="button" onPress={onConfirmTier}
          style={{ padding: 12, borderWidth: 1, borderColor: theme.hot, marginTop: 10 }}>
          <Text style={{ color: theme.hot, fontSize: 12 }}>I checked the tier: {state.tier}</Text>
        </Pressable>
      )}
      <Text style={{ color: theme.inkMuted, fontSize: 12, marginTop: 10 }}>
        Playstyle: {state.playstyle ?? 'unknown'} · Abilities: {state.specialAbilities?.length ?? 'unread'}
      </Text>
      {state.boosts && Object.entries(state.boosts).map(([stat, boost]) => (
        <Text key={stat} style={{ color: theme.inkMuted, fontSize: 12, marginTop: 4 }}>
          {stat} +{boost.amount} {boost.active ? 'active' : 'inactive'} · separate from base stats
        </Text>
      ))}
    </View>
  );
}
