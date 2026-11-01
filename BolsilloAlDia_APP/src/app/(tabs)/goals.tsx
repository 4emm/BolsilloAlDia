import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Fab } from '@/components/fab';
import { GoalCard } from '@/components/finance-views';
import { Screen } from '@/components/screen';
import { EmptyView, LoadingView } from '@/components/state-views';
import { Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { goalProgress, type GoalStatus } from '@/domain/goals';
import { useData } from '@/providers/data-provider';

type Filter = 'all' | GoalStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'completed', label: 'Cumplidas' },
  { value: 'expired', label: 'Vencidas' },
];

/**
 * Metas de ahorro. El estado (activa, cumplida, vencida) se calcula aquí con lo ahorrado y la fecha de
 * hoy del teléfono: se actualiza solo, incluso si la app lleva días sin abrirse y sin conexión.
 */
export default function GoalsScreen() {
  const router = useRouter();
  const { ready, goals, countableMovements, today, syncing, syncNow } = useData();
  const [filter, setFilter] = useState<Filter>('all');

  const items = useMemo(
    () =>
      goals
        .map((goal) => ({ goal, progress: goalProgress(goal, countableMovements, today) }))
        .filter((x) => filter === 'all' || x.progress.status === filter)
        .sort((a, b) => a.goal.deadline.localeCompare(b.goal.deadline)),
    [goals, countableMovements, today, filter],
  );

  if (!ready) return <Screen title="Metas de ahorro"><LoadingView /></Screen>;

  const open = (id: string) => router.push({ pathname: '/goal/[id]', params: { id } });

  return (
    <Screen title="Metas de ahorro">
      <FlatList
        data={items}
        keyExtractor={(x) => x.goal.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void syncNow()} />}
        ListHeaderComponent={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {FILTERS.map((f) => (
              <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
            ))}
          </ScrollView>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
        renderItem={({ item }) => (
          <GoalCard goal={item.goal} progress={item.progress} onPress={() => open(item.goal.id)} />
        )}
        ListEmptyComponent={
          <EmptyView
            title={goals.length === 0 ? 'Aún no tienes metas' : 'Sin metas con ese estado'}
            message={
              goals.length === 0
                ? 'Crea una meta con monto y fecha límite, y ve cuánto llevas ahorrado.'
                : 'Cambia el filtro para ver las demás.'
            }
            actionTitle={goals.length === 0 ? 'Crear mi primera meta' : undefined}
            onAction={goals.length === 0 ? () => open('new') : undefined}
          />
        }
      />
      <Fab label="Nueva meta" onPress={() => open('new')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, paddingBottom: 120, flexGrow: 1 },
  chips: { gap: Spacing.two, paddingBottom: Spacing.three },
});
