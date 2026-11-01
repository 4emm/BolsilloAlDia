import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { DistributionBars } from '@/components/charts';
import { Fab } from '@/components/fab';
import { AlertCard, GoalCard, MovementRow } from '@/components/finance-views';
import { PeriodPicker } from '@/components/period-picker';
import { Screen } from '@/components/screen';
import { LoadingView } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/button';
import { Card, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { goalProgress } from '@/domain/goals';
import { formatCOP } from '@/domain/money';
import { periodFor } from '@/domain/periods';
import { filterMovements, sortMovements, summarize, totalsByCategory } from '@/domain/summary';
import { useAlerts, useLookups } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { useData } from '@/providers/data-provider';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { ready, categories, goals, movements, countableMovements, today, syncing, syncNow } =
    useData();
  const alerts = useAlerts();
  const { categoryById, goalById } = useLookups();
  const [period, setPeriod] = useState(() => periodFor('month', today));

  // Todos los totales de esta pantalla se calculan AQUÍ, con los datos de SQLite (sin servidor).
  const view = useMemo(() => {
    const inPeriod = filterMovements(countableMovements, { period });
    return {
      summary: summarize(inPeriod),
      topExpenses: totalsByCategory(inPeriod, categories, 'expense').slice(0, 4),
      activeGoals: goals
        .map((g) => ({ goal: g, progress: goalProgress(g, countableMovements, today) }))
        .filter((x) => x.progress.status === 'active')
        .sort((a, b) => a.goal.deadline.localeCompare(b.goal.deadline))
        .slice(0, 3),
      recent: sortMovements(movements).slice(0, 5),
    };
  }, [countableMovements, movements, categories, goals, period, today]);

  const openMovement = (id: string) => router.push({ pathname: '/movement/[id]', params: { id } });
  const attention = alerts.filter((a) => a.severity !== 'success').slice(0, 2);

  if (!ready) return <Screen title="BolsilloAlDía"><LoadingView /></Screen>;

  return (
    <Screen title="BolsilloAlDía">
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void syncNow()} />}>
        <PeriodPicker kinds={['week', 'month', 'year']} period={period} onChange={setPeriod} today={today} />

        <Card accessible accessibilityLabel={`Saldo del periodo ${formatCOP(view.summary.balance)}. Ingresos ${formatCOP(view.summary.income)}. Gastos ${formatCOP(view.summary.expense)}.`}>
          <ThemedText type="small" themeColor="textSecondary">
            Saldo del periodo
          </ThemedText>
          <ThemedText
            style={[styles.balance, { color: view.summary.balance < 0 ? theme.expense : theme.text }]}>
            {formatCOP(view.summary.balance)}
          </ThemedText>
          <View style={styles.split}>
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary">Ingresos</ThemedText>
              <ThemedText type="money" style={{ color: theme.income }}>
                {formatCOP(view.summary.income)}
              </ThemedText>
            </View>
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary">Gastos</ThemedText>
              <ThemedText type="money" style={{ color: theme.expense }}>
                {formatCOP(view.summary.expense)}
              </ThemedText>
            </View>
          </View>
        </Card>

        {attention.length > 0 ? (
          <View style={styles.gap}>
            {attention.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                onPress={a.target ? () => router.push(a.target as never) : undefined}
              />
            ))}
            {alerts.length > attention.length ? (
              <Button title={`Ver todas las alertas (${alerts.length})`} variant="ghost" compact onPress={() => router.push('/alerts')} />
            ) : null}
          </View>
        ) : null}

        <View style={styles.gap}>
          <SectionTitle>En qué se va tu plata</SectionTitle>
          {view.topExpenses.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Aún no hay gastos en este periodo. Toca “Registrar” para anotar el primero.
            </ThemedText>
          ) : (
            <Card>
              <DistributionBars rows={view.topExpenses} color="expense" />
            </Card>
          )}
        </View>

        {view.activeGoals.length > 0 ? (
          <View style={styles.gap}>
            <SectionTitle>Mis metas</SectionTitle>
            {view.activeGoals.map(({ goal, progress }) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                progress={progress}
                onPress={() => router.push({ pathname: '/goal/[id]', params: { id: goal.id } })}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.gap}>
          <SectionTitle>Últimos movimientos</SectionTitle>
          {view.recent.length === 0 ? (
            <ThemedText themeColor="textSecondary">Todavía no has registrado movimientos.</ThemedText>
          ) : (
            view.recent.map((m) => (
              <MovementRow
                key={m.id}
                movement={m}
                categoryName={categoryById.get(m.categoryId)?.name ?? 'Sin categoría'}
                goalName={m.goalId ? goalById.get(m.goalId)?.name : null}
                onPress={() => openMovement(m.id)}
              />
            ))
          )}
        </View>
      </ScrollView>
      <Fab label="Registrar" onPress={() => openMovement('new')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: 120 },
  gap: { gap: Spacing.two },
  flex: { flex: 1 },
  split: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  balance: { fontSize: 36, lineHeight: 42, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
