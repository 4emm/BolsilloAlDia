import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { periodFor, periodLabel, shiftPeriod, type Period, type PeriodKind } from '@/domain/periods';
import { useTheme } from '@/hooks/use-theme';
import { DateField } from './fields';
import { ThemedText } from './themed-text';
import { Segmented } from './ui';

const KIND_LABEL: Record<PeriodKind, string> = {
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
  all: 'Todo',
  custom: 'Rango',
};

/**
 * Selector de periodo: tipo (semana, mes, año, todo) y flechas para ir al anterior o siguiente.
 * Todo el filtrado por periodo se hace sobre los datos locales.
 */
export function PeriodPicker({
  kinds,
  period,
  onChange,
  today,
}: {
  kinds: PeriodKind[];
  period: Period;
  onChange: (p: Period) => void;
  today: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.gap}>
      <Segmented
        options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        value={period.kind}
        onChange={(kind) => onChange(periodFor(kind, today))}
      />
      {period.kind === 'custom' ? (
        <View style={styles.gap}>
          <DateField
            label="Desde"
            value={period.start}
            today={today}
            onChange={(start) => onChange({ ...period, start })}
            quick={[]}
          />
          <DateField
            label="Hasta"
            value={period.end}
            today={today}
            onChange={(end) => onChange({ ...period, end })}
            quick={[{ label: 'Hoy', date: today }]}
          />
        </View>
      ) : null}
      {period.kind !== 'all' && period.kind !== 'custom' ? (
        <View style={styles.stepper}>
          <Pressable
            onPress={() => onChange(shiftPeriod(period, -1))}
            accessibilityRole="button"
            accessibilityLabel="Periodo anterior"
            style={[styles.arrow, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText type="smallBold" style={styles.label} accessibilityLiveRegion="polite">
            {periodLabel(period)}
          </ThemedText>
          <Pressable
            onPress={() => onChange(shiftPeriod(period, 1))}
            accessibilityRole="button"
            accessibilityLabel="Periodo siguiente"
            style={[styles.arrow, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="chevron-forward" size={22} color={theme.text} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.two },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { flex: 1, textAlign: 'center', fontSize: 16 },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
