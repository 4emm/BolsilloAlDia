import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { useAlerts } from '@/hooks/use-finance';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName, focused: IconName) =>
  // eslint-disable-next-line react/display-name
  ({ color, size, focused: isFocused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={isFocused ? focused : name} size={size} color={color as string} />
  );

export default function TabsLayout() {
  const theme = useTheme();
  const alerts = useAlerts();
  // Solo cuentan las alertas que piden atención (no las de éxito ni las informativas).
  const urgent = alerts.filter((a) => a.severity === 'danger' || a.severity === 'warning').length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen
        name="movements"
        options={{ title: 'Movimientos', tabBarIcon: icon('receipt-outline', 'receipt') }}
      />
      <Tabs.Screen name="goals" options={{ title: 'Metas', tabBarIcon: icon('flag-outline', 'flag') }} />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Estadísticas', tabBarIcon: icon('stats-chart-outline', 'stats-chart') }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Más',
          tabBarIcon: icon('menu-outline', 'menu'),
          tabBarBadge: urgent > 0 ? urgent : undefined,
          tabBarAccessibilityLabel: urgent > 0 ? `Más, ${urgent} alertas` : 'Más',
        }}
      />
    </Tabs>
  );
}
