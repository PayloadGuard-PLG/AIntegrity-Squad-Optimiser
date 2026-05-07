import { View, Text, Pressable } from 'react-native';
import { usePathname, router } from 'expo-router';
import { theme } from '../constants/theme';
import { MonoLabel } from './atoms/MonoLabel';

const TABS = [
  { id: 'squad', label: 'SQUAD', href: '/' },
  { id: 'plan',  label: 'PLAN',  href: '/plan' },
  { id: 'drills',label: 'DRILLS',href: '/drills' },
];

interface Props {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
}

export function AppHeader({ title, subtitle, onBack }: Props) {
  const pathname = usePathname();
  const showTabs = ['/', '/plan', '/drills'].includes(pathname);

  const routeTitle = pathname === '/' ? 'DOSSIER'
    : pathname === '/plan' ? 'INVESTMENT MODEL'
    : pathname === '/drills' ? 'DRILL LIBRARY'
    : title ?? 'SQUAD OPTIMISER';

  const routeSub = pathname === '/' ? 'ACTIVE PERSONNEL'
    : pathname === '/plan' ? 'PROJECTION ENGINE'
    : pathname === '/drills' ? 'TRAINING PROTOCOLS'
    : subtitle ?? 'OPERATOR · 1.0';

  return (
    <View style={{ backgroundColor: theme.bg, borderBottomWidth: 1, borderBottomColor: theme.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 10 }}>
        {onBack && (
          <Pressable onPress={onBack} style={{
            width: 28, height: 28, borderWidth: 1, borderColor: theme.hairline2,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontFamily: theme.mono, fontSize: 14, color: theme.ink }}>←</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <MonoLabel size={9} color={theme.steelLight} style={{ marginBottom: 2 }}>{routeSub}</MonoLabel>
          <Text style={{
            fontSize: 21, fontWeight: '600', color: theme.ink, fontFamily: theme.display,
            letterSpacing: -0.6, lineHeight: 24,
          }}>{routeTitle}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.pos }} />
          <MonoLabel size={9}>LIVE</MonoLabel>
        </View>
      </View>

      {showTabs && (
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.hairline }}>
          {TABS.map((t, i) => {
            const active = pathname === t.href;
            return (
              <Pressable key={t.id} onPress={() => router.push(t.href as any)}
                style={{
                  flex: 1, paddingVertical: 12, alignItems: 'center',
                  backgroundColor: active ? theme.surface2 : 'transparent',
                  borderRightWidth: i < TABS.length - 1 ? 1 : 0,
                  borderRightColor: theme.hairline,
                  position: 'relative',
                }}>
                {active && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: theme.steelLight }} />}
                <Text style={{
                  fontFamily: theme.mono, fontSize: 11, letterSpacing: 2,
                  color: active ? theme.ink : theme.inkMuted,
                }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
