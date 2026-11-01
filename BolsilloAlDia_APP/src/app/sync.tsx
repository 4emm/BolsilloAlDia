import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Card, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatCOP } from '@/domain/money';
import { dayjs } from '@/lib/dayjs';
import { useTheme } from '@/hooks/use-theme';
import { useData } from '@/providers/data-provider';
import type { ActivityEntry } from '@/db/repositories';
import type { EntityKind } from '@/types';

const KIND_LABEL: Record<EntityKind, string> = {
  category: 'Categoría',
  goal: 'Meta',
  movement: 'Movimiento',
};

/** Estado de la sincronización: pendientes, última vez, errores, registros rechazados y bitácora. */
export default function SyncScreen() {
  const theme = useTheme();
  const {
    online, syncing, pendingCount, lastSyncAt, lastError, syncNow, actions,
    categories, goals, movements, repos, dataVersionKey,
  } = useSyncData();
  const [log, setLog] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let active = true;
    repos.activity.recent(15).then((rows) => active && setLog(rows));
    return () => {
      active = false;
    };
  }, [repos, dataVersionKey]);

  const conflicts: { kind: EntityKind; id: string; title: string; error: string | null }[] = [
    ...categories.filter((c) => c.syncState === 'conflict').map((c) => ({ kind: 'category' as const, id: c.id, title: c.name, error: c.syncError })),
    ...goals.filter((g) => g.syncState === 'conflict').map((g) => ({ kind: 'goal' as const, id: g.id, title: g.name, error: g.syncError })),
    ...movements.filter((m) => m.syncState === 'conflict').map((m) => ({
      kind: 'movement' as const,
      id: m.id,
      title: `${formatCOP(m.amount)} · ${m.date}`,
      error: m.syncError,
    })),
  ];

  return (
    <Screen title="Sincronización" back>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Row label="Conexión" value={online ? 'En línea' : 'Sin conexión'} color={online ? theme.success : theme.warning} />
          <Row label="Cambios por enviar" value={String(pendingCount)} />
          <Row label="Última sincronización exitosa" value={lastSyncAt ? dayjs(lastSyncAt).format('D MMM YYYY, h:mm a') : 'Nunca'} />
          {lastError ? (
            <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
              Último error: {lastError}
            </ThemedText>
          ) : null}
          <Button
            title={syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
            onPress={() => void syncNow()}
            loading={syncing}
            disabled={!online}
          />
          {!online ? (
            <ThemedText type="caption" themeColor="textSecondary">
              Sin conexión puedes seguir registrando, editando y consultando: todo queda guardado en el teléfono y se envía al volver la red.
            </ThemedText>
          ) : null}
        </Card>

        {conflicts.length > 0 ? (
          <View style={styles.gap}>
            <SectionTitle>Registros rechazados</SectionTitle>
            <ThemedText type="small" themeColor="textSecondary">
              El servidor no los aceptó (gana el servidor). No cuentan en tus totales. Puedes reintentarlos o descartarlos.
            </ThemedText>
            {conflicts.map((c) => (
              <Card key={`${c.kind}:${c.id}`}>
                <ThemedText type="smallBold">{KIND_LABEL[c.kind]} · {c.title}</ThemedText>
                <ThemedText type="small" style={{ color: theme.danger }}>{c.error}</ThemedText>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Button title="Reintentar" variant="secondary" compact onPress={() => void actions.retryConflict(c.kind, c.id)} />
                  </View>
                  <View style={styles.flex}>
                    <Button title="Descartar" variant="danger" compact onPress={() => void actions.discardConflict(c.kind, c.id)} />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        <View style={styles.gap}>
          <SectionTitle>Actividad reciente</SectionTitle>
          {log.length === 0 ? (
            <ThemedText themeColor="textSecondary">Sin actividad todavía.</ThemedText>
          ) : (
            log.map((e) => (
              <View key={e.id} style={styles.logRow}>
                <ThemedText type="caption" themeColor="textSecondary">{dayjs(e.createdAt).format('D MMM, h:mm a')}</ThemedText>
                <ThemedText type="small" style={styles.flex}>{e.detail}</ThemedText>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

/** Datos de la pantalla; `dataVersionKey` cambia cuando algo cambia, para recargar la bitácora. */
function useSyncData() {
  const data = useData();
  const dataVersionKey = `${data.pendingCount}|${data.lastSyncAt}|${data.syncing}|${data.movements.length}|${data.conflictCount}`;
  return { ...data, dataVersionKey };
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.rowBetween}>
      <ThemedText themeColor="textSecondary" style={styles.flex}>{label}</ThemedText>
      <ThemedText type="smallBold" style={{ color }}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  gap: { gap: Spacing.two },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.two },
  rowBetween: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  logRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
});
