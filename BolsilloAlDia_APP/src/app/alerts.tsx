import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { AlertCard } from '@/components/finance-views';
import { Screen } from '@/components/screen';
import { EmptyView } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAlerts } from '@/hooks/use-finance';

/** Alertas informativas calculadas con los datos locales: metas, presupuestos y sincronización. */
export default function AlertsScreen() {
  const router = useRouter();
  const alerts = useAlerts();
  return (
    <Screen title="Alertas" back>
      {alerts.length === 0 ? (
        <EmptyView
          title="Todo en orden"
          message="No hay metas por vencer, presupuestos superados ni cambios sin sincronizar."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} onPress={a.target ? () => router.push(a.target as never) : undefined} />
          ))}
          <ThemedText type="caption" themeColor="textSecondary">
            Las alertas se calculan en tu teléfono cada vez que abres la app, también sin conexión.
          </ThemedText>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
});
