import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { View, Text, AppState, AppStateStatus, ActivityIndicator } from 'react-native';
import { useDbMigration } from '../src/db';
import { ManagerProvider } from '../src/context/ManagerContext';
import { pickingImage } from '../src/logic/pickImage';

const fill = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

function PrivacyOverlay() {
  return (
    <View style={{ ...fill, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <View style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 32, paddingVertical: 24, alignItems: 'center', gap: 10 }}>
        <Text style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
          PayloadGuard
        </Text>
        <Text style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, color: 'rgba(255,255,255,0.80)', fontWeight: '600', textTransform: 'uppercase' }}>
          Squad Optimiser
        </Text>
        <View style={{ width: 40, height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 4 }} />
        <Text style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase', marginTop: 2 }}>
          Secured
        </Text>
      </View>
    </View>
  );
}

function usePrivacyOverlay() {
  const [obscured, setObscured] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (next === 'background') {
        // Skip overlay if the image picker is open — it fires 'background' for the full
        // duration the picker is open on Android, not just briefly.
        if (!pickingImage) setObscured(true);
      }
      if (next === 'active' && prev === 'background') {
        setObscured(false);
      }
    });
    return () => sub.remove();
  }, []);

  return obscured;
}

export default function RootLayout() {
  const { success, error } = useDbMigration();
  const obscured = usePrivacyOverlay();

  if (!success) {
    if (error) console.error('Migration error:', error);
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#9eb0d4" size="large" />
      </View>
    );
  }

  return (
    <ManagerProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="compare"
          options={{ headerShown: true, title: 'Scenario Comparator', headerStyle: { backgroundColor: '#1a1d27' }, headerTintColor: '#e2e8f0' }}
        />
        <Stack.Screen
          name="scan"
          options={{ presentation: 'modal', headerShown: true, title: 'Coach Session Capture', headerStyle: { backgroundColor: '#1a1d27' }, headerTintColor: '#e2e8f0' }}
        />
        <Stack.Screen
          name="player/new"
          options={{ presentation: 'modal', headerShown: true, title: 'Add Player', headerStyle: { backgroundColor: '#1a1d27' }, headerTintColor: '#e2e8f0' }}
        />
        <Stack.Screen
          name="player/[id]"
          options={{ presentation: 'modal', headerShown: true, title: 'Edit Player', headerStyle: { backgroundColor: '#1a1d27' }, headerTintColor: '#e2e8f0' }}
        />
      </Stack>
      {obscured && <PrivacyOverlay />}
    </ManagerProvider>
  );
}
