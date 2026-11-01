import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Fab } from '@/components/fab';
import { SyncTag } from '@/components/finance-views';
import { Screen } from '@/components/screen';
import { EmptyView, LoadingView } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { ProgressBar, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatCOP } from '@/domain/money';
import { inPeriod, periodFor } from '@/domain/periods';
import { useTheme } from '@/hooks/use-theme';
import { useData } from '@/providers/data-provider';
import type { Category } from '@/types';

export default function CategoriesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { ready, categories, countableMovements, today } = useData();

  const { expenses, incomes, spentThisMonth, counts } = useMemo(() => {
    const month = periodFor('month', today);
    const spent = new Map<string, number>();
    const counts = new Map<string, number>();
    for (const m of countableMovements) {
      counts.set(m.categoryId, (counts.get(m.categoryId) ?? 0) + 1);
      if (m.type === 'expense' && inPeriod(m.date, month)) {
        spent.set(m.categoryId, (spent.get(m.categoryId) ?? 0) + m.amount);
      }
    }
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return {
      expenses: sorted.filter((c) => c.type === 'expense'),
      incomes: sorted.filter((c) => c.type === 'income'),
      spentThisMonth: spent,
      counts,
    };
  }, [categories, countableMovements, today]);

  if (!ready) return <Screen title="Categorías" back><LoadingView /></Screen>;

  const open = (id: string, type?: string) =>
    router.push({ pathname: '/category/[id]', params: type ? { id, type } : { id } });

  const renderRow = (c: Category) => {
    const spent = spentThisMonth.get(c.id) ?? 0;
    const n = counts.get(c.id) ?? 0;
    return (
      <Pressable
        key={c.id}
        onPress={() => open(c.id)}
        accessibilityRole="button"
        accessibilityLabel={`${c.name}, ${n} movimientos${c.monthlyBudget ? `, presupuesto ${formatCOP(c.monthlyBudget)}` : ''}. Toca para editar`}
        style={({ pressed }) => [styles.row, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}>
        <View style={styles.rowTop}>
          <ThemedText type="smallBold" style={[styles.flex, { fontSize: 16 }]} numberOfLines={1}>
            {c.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {n} {n === 1 ? 'movimiento' : 'movimientos'}
          </ThemedText>
        </View>
        {c.monthlyBudget ? (
          <View style={styles.budget}>
            <ProgressBar
              percent={(spent / c.monthlyBudget) * 100}
              color={spent > c.monthlyBudget ? 'danger' : spent >= c.monthlyBudget * 0.8 ? 'warning' : 'success'}
              label={`Presupuesto de ${c.name}`}
            />
            <ThemedText type="caption" themeColor="textSecondary">
              Este mes {formatCOP(spent)} de {formatCOP(c.monthlyBudget)}
            </ThemedText>
          </View>
        ) : null}
        <SyncTag state={c.syncState} error={c.syncError} />
      </Pressable>
    );
  };

  return (
    <Screen title="Categorías" back>
      {categories.length === 0 ? (
        <EmptyView
          title="Aún no hay categorías"
          message="Si acabas de crear tu cuenta, se descargarán al sincronizar. También puedes crear las tuyas."
          actionTitle="Crear categoría"
          onAction={() => open('new')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <SectionTitle>Gastos</SectionTitle>
          {expenses.map(renderRow)}
          <View style={{ height: Spacing.three }} />
          <SectionTitle>Ingresos</SectionTitle>
          {incomes.map(renderRow)}
        </ScrollView>
      )}
      <Fab label="Nueva categoría" onPress={() => open('new')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, paddingBottom: 120, gap: Spacing.one },
  flex: { flex: 1 },
  row: {
    paddingVertical: Spacing.three,
    minHeight: 56,
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  budget: { gap: Spacing.one },
});
