import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{ headerShown: false, lazy: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="drills" />
      <Tabs.Screen name="coaches" />
      <Tabs.Screen name="results" />
    </Tabs>
  );
}
