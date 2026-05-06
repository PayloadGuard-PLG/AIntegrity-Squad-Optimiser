import { View, Text } from 'react-native';
import { TierName } from '../types/resources';

const TIER_COLOURS: Record<TierName, string> = {
  None:      '#6b7280',
  Rare:      '#60a5fa',
  Elite:     '#34d399',
  Stellar:   '#22d3ee',
  Master:    '#a78bfa',
  Epic:      '#fb923c',
  Legendary: '#fbbf24',
};

export function TierBadge({ tier }: { tier: TierName }) {
  if (tier === 'None') return null;
  return (
    <View style={{ backgroundColor: TIER_COLOURS[tier] + '33', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ color: TIER_COLOURS[tier], fontWeight: '600', fontSize: 11 }}>{tier}</Text>
    </View>
  );
}
