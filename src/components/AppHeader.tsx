import { View, Text, Pressable } from 'react-native';
import { usePathname, router } from 'expo-router';

const TABS = [
  { label: 'Squad', path: '/' },
  { label: 'Plan',  path: '/plan' },
  { label: 'Drills', path: '/drills' },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <View style={{ backgroundColor: '#0f1117', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12 }}>
      <Text style={{ color: '#e2e8f0', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 14 }}>
        Squad Optimiser
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {TABS.map(tab => {
          const active = pathname === tab.path;
          return (
            <Pressable
              key={tab.label}
              onPress={() => router.navigate(tab.path as any)}
              style={{
                flex: 1,
                backgroundColor: active ? '#6366f1' : '#1a1d27',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: active ? '#fff' : '#9ca3af', fontWeight: '700', fontSize: 14 }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
