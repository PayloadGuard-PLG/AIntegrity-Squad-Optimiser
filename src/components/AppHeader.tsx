import { View, Text, Pressable } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const TABS = [
  { label: 'Squad',  path: '/',       icon: 'people'      as const },
  { label: 'Plan',   path: '/plan',   icon: 'trending-up' as const },
  { label: 'Drills', path: '/drills', icon: 'barbell'     as const },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <View style={{ backgroundColor: '#0f1117', paddingTop: 52, paddingHorizontal: 20 }}>

      {/* Title row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 }}>
        <View style={{ width: 4, height: 30, backgroundColor: '#6366f1', borderRadius: 2 }} />
        <View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, lineHeight: 24 }}>
            Squad Optimiser
          </Text>
          <Text style={{ color: '#4b5563', fontSize: 11, fontWeight: '500', letterSpacing: 1.5 }}>
            TOP ELEVEN TOOLKIT
          </Text>
        </View>
      </View>

      {/* Tab row — underline style */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1a1d27' }}>
        {TABS.map(tab => {
          const active = pathname === tab.path;
          return (
            <Pressable
              key={tab.label}
              onPress={() => router.navigate(tab.path as any)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingBottom: 12,
                gap: 4,
                borderBottomWidth: 2,
                borderBottomColor: active ? '#6366f1' : 'transparent',
                marginBottom: -1,
              }}
            >
              <Ionicons name={active ? tab.icon : `${tab.icon}-outline` as any} size={18} color={active ? '#6366f1' : '#6b7280'} />
              <Text style={{ color: active ? '#6366f1' : '#6b7280', fontSize: 12, fontWeight: '700' }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
