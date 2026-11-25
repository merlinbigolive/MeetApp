import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from './theme';

const tabs = [
  { name: 'home', title: 'Home', icon: 'home-outline' as const },
  { name: 'public', title: 'Public Feed', icon: 'globe-outline' as const },
  { name: 'create', title: 'Create', icon: 'add-circle-outline' as const },
  { name: 'inbox', title: 'Inbox', icon: 'mail-outline' as const },
  { name: 'profile', title: 'Profile', icon: 'person-outline' as const },
];

export default function TabLayout() {
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarStyle: {
      backgroundColor: theme.panel,
      borderTopColor: theme.border,
      height: 68,
      paddingTop: 8,
      paddingBottom: 8,
    },
    tabBarActiveTintColor: theme.accent,
    tabBarInactiveTintColor: theme.muted,
    tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
  }}>
    {tabs.map(t => <Tabs.Screen key={t.name} name={t.name} options={{
      title: t.title,
      tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={color} size={size} />,
    }} />)}
  </Tabs>;
}
