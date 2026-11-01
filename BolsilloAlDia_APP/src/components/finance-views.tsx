/** Tarjetas y filas que muestran movimientos, metas y alertas. */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { GOAL_STATUS_LABEL, deadlineText, type GoalProgress } from '@/domain/goals';
import { formatCOP, formatSigned } from '@/domain/money';
import type { AppAlert } from '@/domain/alerts';
import { shortDate } from '@/domain/periods';
import { useTheme } from '@/hooks/use-theme';
import type { Goal, Movement } from '@/types';
import { ThemedText } from './themed-text';
import { Card, ProgressBar, Tag } from './ui';

/** Etiqueta de sincronización de un registro: nada si está al día. */
export function SyncTag({ state, error }: { state: string; error?: string | null }) {
  if (state === 'pending') return <Tag label="Pendiente de envío" tone="info" icon="cloud-upload" />;
  if (state === 'conflict') {
    return <Tag label={error ? 'No se pudo sincronizar' : 'Rechazado'} tone="danger" icon="alert-circle" />;
  }
  return null;
}

export function MovementRow({
  movement,
  categoryName,
  goalName,
  onPress,
}: {
  movement: Movement;
  categoryName: string;
  goalName?: string | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const income = movement.type === 'income';
  const rejected = movement.syncState === 'conflict';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${income ? 'Ingreso' : 'Gasto'} de ${formatCOP(movement.amount)} en ${categoryName}${
        movement.note ? `, ${movement.note}` : ''
      }. Toca para editar o eliminar`}
      style={({ pressed }) => [styles.row, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <View
        style={[
          styles.dot,
          { backgroundColor: income ? theme.successSoft : theme.dangerSoft },
        ]}>
        <Ionicons
          name={income ? 'arrow-down' : 'arrow-up'}
          size={18}
          color={income ? theme.income : theme.expense}
        />
      </View>
      <View style={styles.rowBody}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {categoryName}
          {goalName ? ` · ${goalName}` : ''}
        </ThemedText>
        {movement.note ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {movement.note}
          </ThemedText>
        ) : null}
        <SyncTag state={movement.syncState} error={movement.syncError} />
      </View>
      <ThemedText
        type="money"
        style={{
          color: rejected ? theme.textSecondary : income ? theme.income : theme.expense,
          textDecorationLine: rejected ? 'line-through' : 'none',
        }}>
        {formatSigned(movement.amount, movement.type)}
      </ThemedText>
    </Pressable>
  );
}

const STATUS_TONE = { active: 'info', completed: 'success', expired: 'danger' } as const;
const STATUS_ICON = {
  active: 'time',
  completed: 'checkmark-circle',
  expired: 'alert-circle',
} as const;

export function GoalCard({
  goal,
  progress,
  onPress,
}: {
  goal: Goal;
  progress: GoalProgress;
  onPress: () => void;
}) {
  const barColor =
    progress.status === 'completed' ? 'success' : progress.status === 'expired' ? 'danger' : 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Meta ${goal.name}, ${GOAL_STATUS_LABEL[progress.status]}, ${progress.percent} por ciento, ${deadlineText(progress.daysLeft)}`}>
      <Card>
        <View style={styles.goalHeader}>
          <ThemedText type="subtitle" style={styles.flex} numberOfLines={1}>
            {goal.name}
          </ThemedText>
          <Tag
            label={GOAL_STATUS_LABEL[progress.status]}
            tone={STATUS_TONE[progress.status]}
            icon={STATUS_ICON[progress.status]}
          />
        </View>
        <ProgressBar percent={progress.percent} color={barColor} label={`Avance de ${goal.name}`} />
        <View style={styles.goalNumbers}>
          <ThemedText type="smallBold">
            {formatCOP(progress.saved)} <ThemedText type="small" themeColor="textSecondary">de {formatCOP(progress.target)}</ThemedText>
          </ThemedText>
          <ThemedText type="smallBold">{progress.percent} %</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Fecha límite {shortDate(goal.deadline)} · {deadlineText(progress.daysLeft)}
          {progress.dailyNeeded ? ` · ${formatCOP(progress.dailyNeeded)} por día` : ''}
        </ThemedText>
        <SyncTag state={goal.syncState} error={goal.syncError} />
      </Card>
    </Pressable>
  );
}

const ALERT_PALETTE = {
  danger: ['dangerSoft', 'danger', 'alert-circle'],
  warning: ['warningSoft', 'warning', 'warning'],
  info: ['infoSoft', 'info', 'information-circle'],
  success: ['successSoft', 'success', 'checkmark-circle'],
} as const;

export function AlertCard({ alert, onPress }: { alert: AppAlert; onPress?: () => void }) {
  const theme = useTheme();
  const [bg, fg, icon] = ALERT_PALETTE[alert.severity];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${alert.title}. ${alert.message}`}
      style={[styles.alert, { backgroundColor: theme[bg] }]}>
      <Ionicons name={icon} size={22} color={theme[fg]} />
      <View style={styles.flex}>
        <ThemedText type="smallBold" style={{ color: theme[fg] }}>
          {alert.title}
        </ThemedText>
        <ThemedText type="small" themeColor="text">
          {alert.message}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  goalNumbers: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  alert: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    alignItems: 'flex-start',
  },
});
