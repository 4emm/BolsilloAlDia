import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BalanceChart, DistributionBars } from '@/components/charts';
import { PeriodPicker } from '@/components/period-picker';
import { Screen } from '@/components/screen';
import { LoadingView } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { Card, ProgressBar, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { goalProgress } from '@/domain/goals';
import { formatCOP } from '@/domain/money';
import { periodFor, periodLabel, type Period } from '@/domain/periods';
import { balanceEvolution, budgetCompliance, type Compliance } from '@/domain/stats';
import { filterMovements, summarize, totalsByCategory } from '@/domain/summary';
import { useTheme } from '@/hooks/use-theme';
import { useData } from '@/providers/data-provider';

function ComplianceCard({ title, subtitle, data }: { title: string; subtitle: string; data: Compliance }) {
  const theme = useTheme();
  const percent = data.percent;
  const color = percent === null ? 'primary' : percent >= 80 ? 'success' : percent >= 50 ? 'warning' : 'danger';
  return (
    <Card
      accessible
      accessibilityLabel={`${title}, ${subtitle}. ${
        percent === null ? 'Sin presupuestos definidos' : `${percent} por ciento, ${data.withinBudget} de ${data.evaluated} categorías dentro del presupuesto`
      }`}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="caption" themeColor="textSecondary">{subtitle}</ThemedText>
      {percent === null ? (
        <ThemedText type="small" themeColor="textSecondary">
          Define un presupuesto mensual en tus categorías de gasto para medir tu cumplimiento.
        </ThemedText>
      ) : (
        <>
          <ThemedText style={[styles.big, { color: theme[color] }]}>{percent} %</ThemedText>
          <ProgressBar percent={percent} color={color} />
          <ThemedText type="small" themeColor="textSecondary">
            {data.withinBudget} de {data.evaluated} categorías dentro del presupuesto
          </ThemedText>
        </>
      )}
    </Card>
  );
}

/** Panel de estadísticas: cumplimiento semanal y mensual, distribución del gasto y evolución del saldo. */
export default function StatsScreen() {
  const theme = useTheme();
  const { ready, categories, goals, countableMovements, today } = useData();
  const [period, setPeriod] = useState<Period>(() => periodFor('month', today));

  const stats = useMemo(() => {
    const inPeriod = filterMovements(countableMovements, { period });
    const week = periodFor('week', today);
    const month = periodFor('month', today);
    const goalStates = goals.map((g) => goalProgress(g, countableMovements, today).status);
    return {
      summary: summarize(inPeriod),
      expenses: totalsByCategory(inPeriod, categories, 'expense'),
      incomes: totalsByCategory(inPeriod, categories, 'income'),
      series: balanceEvolution(countableMovements, period, period.kind === 'year' ? 'month' : 'day'),
      weekly: budgetCompliance(categories, countableMovements, week),
      monthly: budgetCompliance(categories, countableMovements, month),
      weekLabel: periodLabel(week),
      monthLabel: periodLabel(month),
      goalsDone: goalStates.filter((s) => s === 'completed').length,
      goalsTotal: goals.length,
    };
  }, [countableMovements, categories, goals, period, today]);

  if (!ready) return <Screen title="Estadísticas"><LoadingView /></Screen>;

  return (
    <Screen title="Estadísticas">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.gap}>
          <SectionTitle>Cumplimiento del presupuesto</SectionTitle>
          <View style={styles.row}>
            <View style={styles.flex}>
              <ComplianceCard title="Esta semana" subtitle={stats.weekLabel} data={stats.weekly} />
            </View>
            <View style={styles.flex}>
              <ComplianceCard title="Este mes" subtitle={stats.monthLabel} data={stats.monthly} />
            </View>
          </View>
          {stats.monthly.items.length > 0 ? (
            <Card>
              {stats.monthly.items.map((i) => (
                <View key={i.categoryId} style={styles.gap}>
                  <View style={styles.between}>
                    <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>{i.name}</ThemedText>
                    <ThemedText type="small" style={{ color: i.ok ? theme.success : theme.danger, fontWeight: '700' }}>
                      {formatCOP(i.spent)} / {formatCOP(i.budget)}
                    </ThemedText>
                  </View>
                  <ProgressBar
                    percent={(i.spent / i.budget) * 100}
                    color={i.ok ? (i.spent / i.budget >= 0.8 ? 'warning' : 'success') : 'danger'}
                    label={`Presupuesto de ${i.name}`}
                  />
                </View>
              ))}
            </Card>
          ) : null}
          <ThemedText type="caption" themeColor="textSecondary">
            Metas cumplidas: {stats.goalsDone} de {stats.goalsTotal}
          </ThemedText>
        </View>

        <PeriodPicker kinds={['week', 'month', 'year']} period={period} onChange={setPeriod} today={today} />

        <Card>
          <View style={styles.row}>
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary">Ingresos</ThemedText>
              <ThemedText type="money" style={{ color: theme.income }}>{formatCOP(stats.summary.income)}</ThemedText>
            </View>
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary">Gastos</ThemedText>
              <ThemedText type="money" style={{ color: theme.expense }}>{formatCOP(stats.summary.expense)}</ThemedText>
            </View>
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary">Saldo</ThemedText>
              <ThemedText type="money" style={{ color: stats.summary.balance < 0 ? theme.expense : theme.text }}>
                {formatCOP(stats.summary.balance)}
              </ThemedText>
            </View>
          </View>
        </Card>

        <View style={styles.gap}>
          <SectionTitle>Distribución del gasto</SectionTitle>
          {stats.expenses.length === 0 ? (
            <ThemedText themeColor="textSecondary">No hay gastos en este periodo.</ThemedText>
          ) : (
            <Card>
              <DistributionBars rows={stats.expenses} color="expense" />
            </Card>
          )}
        </View>

        {stats.incomes.length > 0 ? (
          <View style={styles.gap}>
            <SectionTitle>De dónde viene tu plata</SectionTitle>
            <Card>
              <DistributionBars rows={stats.incomes} color="income" />
            </Card>
          </View>
        ) : null}

        <View style={styles.gap}>
          <SectionTitle>Evolución del saldo</SectionTitle>
          <Card>
            <BalanceChart points={stats.series} />
            <ThemedText type="caption" themeColor="textSecondary">
              Saldo acumulado {period.kind === 'year' ? 'al final de cada mes' : 'al final de cada día'} (incluye lo
              anterior al periodo). Verde: a favor · Rojo: en contra.
            </ThemedText>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  gap: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  big: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
});
