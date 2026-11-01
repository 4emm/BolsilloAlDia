import { useRouter } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { Fab } from '@/components/fab';
import { MovementRow } from '@/components/finance-views';
import { PeriodPicker } from '@/components/period-picker';
import { Screen } from '@/components/screen';
import { EmptyView, LoadingView } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { Chip, Segmented } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatCOP } from '@/domain/money';
import { dayLabel, periodFor, type Period } from '@/domain/periods';
import { filterMovements, groupByDay, summarize } from '@/domain/summary';
import { useLookups } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { useData } from '@/providers/data-provider';
import type { MovementType } from '@/types';

type TypeFilter = 'all' | MovementType;

/** Historial de movimientos con filtros por periodo, tipo, categoría y texto. Todo sobre SQLite. */
export default function MovementsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { ready, categories, movements, today, syncing, syncNow } = useData();
  const { categoryById, goalById } = useLookups();
  const [period, setPeriod] = useState<Period>(() => periodFor('month', today));
  const [type, setType] = useState<TypeFilter>('all');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const deferredText = useDeferredValue(text);

  const visibleCategories = useMemo(
    () =>
      categories
        .filter((c) => type === 'all' || c.type === type)
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [categories, type],
  );

  const result = useMemo(() => {
    const filtered = filterMovements(
      movements,
      {
        period,
        type: type === 'all' ? null : type,
        categoryId: categoryId && visibleCategories.some((c) => c.id === categoryId) ? categoryId : null,
        text: deferredText,
      },
      categories,
    );
    return {
      sections: groupByDay(filtered).map((g) => ({ ...g, data: g.items })),
      // Los rechazados por el servidor se ven en la lista pero no suman en los totales.
      summary: summarize(filtered.filter((m) => m.syncState !== 'conflict')),
      count: filtered.length,
    };
  }, [movements, period, type, categoryId, deferredText, categories, visibleCategories]);

  if (!ready) return <Screen title="Movimientos"><LoadingView /></Screen>;

  const openMovement = (id: string) => router.push({ pathname: '/movement/[id]', params: { id } });

  return (
    <Screen title="Movimientos">
      <SectionList
        sections={result.sections}
        keyExtractor={(m) => m.id}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void syncNow()} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.filters}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Buscar por nota o categoría"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Buscar movimientos"
              returnKeyType="search"
              style={[
                styles.search,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            />
            <PeriodPicker kinds={['week', 'month', 'year', 'custom', 'all']} period={period} onChange={setPeriod} today={today} />
            <Segmented<TypeFilter>
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'expense', label: 'Gastos', color: 'expense' },
                { value: 'income', label: 'Ingresos', color: 'income' },
              ]}
              value={type}
              onChange={(v) => {
                setType(v);
                setCategoryId(null);
              }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="Todas las categorías" selected={categoryId === null} onPress={() => setCategoryId(null)} />
              {visibleCategories.map((c) => (
                <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
              ))}
            </ScrollView>
            <View
              accessible
              accessibilityLabel={`${result.count} movimientos. Ingresos ${formatCOP(result.summary.income)}, gastos ${formatCOP(result.summary.expense)}`}
              style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {result.count} {result.count === 1 ? 'movimiento' : 'movimientos'}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.income, fontWeight: '700' }}>
                +{formatCOP(result.summary.income)}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.expense, fontWeight: '700' }}>
                -{formatCOP(result.summary.expense)}
              </ThemedText>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {dayLabel(section.date, today)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {section.net < 0 ? '-' : '+'}
              {formatCOP(Math.abs(section.net))}
            </ThemedText>
          </View>
        )}
        renderItem={({ item }) => (
          <MovementRow
            movement={item}
            categoryName={categoryById.get(item.categoryId)?.name ?? 'Sin categoría'}
            goalName={item.goalId ? goalById.get(item.goalId)?.name : null}
            onPress={() => openMovement(item.id)}
          />
        )}
        ListEmptyComponent={
          <EmptyView
            title="Sin movimientos"
            message={
              movements.length === 0
                ? 'Registra tu primer gasto o ingreso: toma menos de 10 segundos.'
                : 'No hay movimientos con estos filtros. Prueba con otro periodo o categoría.'
            }
            actionTitle="Registrar movimiento"
            onAction={() => openMovement('new')}
          />
        }
      />
      <Fab label="Registrar" onPress={() => openMovement('new')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.three, paddingBottom: 120, flexGrow: 1 },
  filters: { gap: Spacing.three, paddingBottom: Spacing.two },
  search: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  chips: { gap: Spacing.two, paddingRight: Spacing.three },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
});
