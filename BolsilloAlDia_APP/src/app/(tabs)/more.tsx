import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { API_URL } from '@/config/env';
import { useAlerts } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/lib/confirm';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [styles.menuRow, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <View style={[styles.menuIcon, { backgroundColor: theme.primarySoft }]}>
        <Ionicons name={icon} size={20} color={theme.primary} />
      </View>
      <View style={styles.flex}>
        <ThemedText type="smallBold" style={{ fontSize: 16 }}>{title}</ThemedText>
        {subtitle ? <ThemedText type="small" themeColor="textSecondary">{subtitle}</ThemedText> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function MoreScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { pendingCount, online, syncNow, categories, conflictCount } = useData();
  const alerts = useAlerts();

  function requestSignOut() {
    const warning =
      pendingCount > 0
        ? `Tienes ${pendingCount} ${pendingCount === 1 ? 'cambio' : 'cambios'} sin enviar al servidor${
            online ? '' : ' y no hay conexión'
          }. Si cierras sesión, se perderán. `
        : '';
    confirmAction({
      title: 'Cerrar sesión',
      message: `${warning}Los datos guardados en este teléfono se borrarán; volverán a descargarse cuando inicies sesión.`,
      confirmLabel: 'Cerrar sesión',
      onConfirm: async () => {
        // Antes de borrar, se intenta enviar lo pendiente (si hay red).
        if (pendingCount > 0 && online) await syncNow();
        await signOut();
      },
    });
  }

  return (
    <Screen title="Más">
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <ThemedText type="subtitle">{user?.name}</ThemedText>
          <ThemedText themeColor="textSecondary">{user?.email}</ThemedText>
        </Card>

        <View>
          <MenuRow
            icon="pricetags-outline"
            title="Categorías"
            subtitle={`${categories.length} ${categories.length === 1 ? 'categoría' : 'categorías'} · crea, edita y define presupuestos`}
            onPress={() => router.push('/categories')}
          />
          <MenuRow
            icon="notifications-outline"
            title="Alertas"
            subtitle={alerts.length === 0 ? 'Todo en orden' : `${alerts.length} ${alerts.length === 1 ? 'aviso' : 'avisos'}`}
            onPress={() => router.push('/alerts')}
          />
          <MenuRow
            icon="sync-outline"
            title="Sincronización"
            subtitle={
              conflictCount > 0
                ? `${conflictCount} registros rechazados por revisar`
                : pendingCount > 0
                  ? `${pendingCount} cambios por enviar`
                  : 'Al día'
            }
            onPress={() => router.push('/sync')}
          />
        </View>

        <Button title="Cerrar sesión" variant="secondary" onPress={requestSignOut} />

        <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
          Servidor: {API_URL}
        </ThemedText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
