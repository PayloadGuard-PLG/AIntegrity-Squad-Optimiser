import { View, FlatList, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useSquad } from '../../src/hooks/useSquad';
import { PlayerCard } from '../../src/components/PlayerCard';
import { EmptyState } from '../../src/components/EmptyState';

export default function SquadDashboard() {
  const { squad } = useSquad();

  if (squad.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f1117' }}>
        <EmptyState
          icon="people-outline"
          message="Your squad is empty. Add your first player to get started."
          ctaLabel="Add First Player"
          onCta={() => router.push('/player/new')}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0f1117' }}>
      <FlatList
        data={squad}
        keyExtractor={p => p.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <PlayerCard
            player={item}
            onPress={() => router.push(`/player/${item.id}`)}
          />
        )}
      />
      {/* FAB */}
      <Pressable
        onPress={() => router.push('/player/new')}
        style={({ pressed }) => ({
          position: 'absolute',
          bottom: 24,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: pressed ? '#4f46e5' : '#6366f1',
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 4,
          shadowColor: '#6366f1',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
        })}
      >
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 }}>+</Text>
      </Pressable>
    </View>
  );
}
