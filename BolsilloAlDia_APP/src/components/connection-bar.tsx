import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeConnection } from '@/lib/connection';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';
import { ThemedText } from './themed-text';

/**
 * Indicador VISIBLE Y PERMANENTE del estado de la conexión (lo lleva toda pantalla).
 * Dice si hay red, cuántos cambios esperan ser enviados y cuándo fue la última sincronización.
 * No bloquea nada: la app sigue funcionando con los datos guardados en el teléfono.
 */
export function ConnectionBar() {
  const theme = useTheme();
  const router = useRouter();
  const { status } = useAuth();
  const data = useData();
  const signedIn = status === 'signedIn';

  const view = describeConnection({
    signedIn,
    online: data.online,
    syncing: data.syncing,
    pendingCount: data.pendingCount,
    conflictCount: data.conflictCount,
    lastError: data.lastError,
    lastSyncAt: data.lastSyncAt,
  });
  const palette = {
    success: [theme.successSoft, theme.success],
    warning: [theme.warningSoft, theme.warning],
    danger: [theme.dangerSoft, theme.danger],
    info: [theme.infoSoft, theme.info],
  }[view.tone];

  return (
    <Pressable
      disabled={!signedIn}
      onPress={() => router.push('/sync')}
      accessibilityRole={signedIn ? 'button' : 'text'}
      accessibilityLabel={`Estado de la conexión: ${view.text}`}
      accessibilityLiveRegion="polite"
      style={[styles.bar, { backgroundColor: palette[0] }]}>
      <Ionicons name={view.icon} size={16} color={palette[1]} />
      <ThemedText type="caption" style={[styles.text, { color: palette[1] }]} numberOfLines={2}>
        {view.text}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 32,
  },
  text: { flex: 1, fontWeight: '700' },
});
