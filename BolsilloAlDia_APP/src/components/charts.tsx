/**
 * Gráficas sencillas hechas solo con vistas (sin librerías nativas): funcionan en Expo Go, sin
 * conexión y se leen con lectores de pantalla (cada barra tiene su descripción en texto).
 */
import { StyleSheet, View } from 'react-native';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { formatCOP } from '@/domain/money';
import type { CategoryTotal } from '@/domain/summary';
import type { SeriesPoint } from '@/domain/stats';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

/** Distribución por categoría: una barra horizontal por categoría con su porcentaje. */
export function DistributionBars({
  rows,
  color = 'primary',
}: {
  rows: CategoryTotal[];
  color?: ThemeColor;
}) {
  const theme = useTheme();
  return (
    <View style={styles.gap}>
      {rows.map((r) => (
        <View
          key={r.categoryId}
          accessible
          accessibilityLabel={`${r.name}: ${formatCOP(r.total)}, ${r.percent} por ciento`}
          style={styles.rowGap}>
          <View style={styles.between}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
              {r.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatCOP(r.total)} · {r.percent} %
            </ThemedText>
          </View>
          <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View
              style={[
                styles.fill,
                { width: `${Math.max(2, r.percent)}%`, backgroundColor: theme[color] },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const CHART_HEIGHT = 120;

/** Evolución del saldo: una columna por día/mes (verde sobre cero, roja bajo cero). */
export function BalanceChart({ points }: { points: SeriesPoint[] }) {
  const theme = useTheme();
  const max = Math.max(1, ...points.map((p) => Math.abs(p.balance)));
  const hasNegative = points.some((p) => p.balance < 0);
  const half = hasNegative ? CHART_HEIGHT / 2 : CHART_HEIGHT;
  // Con muchas columnas (mes con 31 días) solo se rotulan algunas para que no se encimen.
  const every = points.length > 12 ? 5 : 1;
  const last = points[points.length - 1];
  return (
    <View
      accessible
      accessibilityLabel={`Evolución del saldo. Saldo al final del periodo: ${formatCOP(last?.balance ?? 0)}`}>
      <View style={[styles.chart, { height: CHART_HEIGHT }]}>
        {points.map((p) => {
          const h = Math.max(2, Math.round((Math.abs(p.balance) / max) * half));
          const positive = p.balance >= 0;
          return (
            <View key={p.key} style={styles.column}>
              <View style={[styles.half, { height: half, justifyContent: 'flex-end' }]}>
                {positive ? (
                  <View style={[styles.bar, { height: h, backgroundColor: theme.income }]} />
                ) : null}
              </View>
              {hasNegative ? (
                <View style={[styles.half, { height: half, justifyContent: 'flex-start' }]}>
                  {!positive ? (
                    <View style={[styles.bar, { height: h, backgroundColor: theme.expense }]} />
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {points.map((p, i) => (
          <View key={p.key} style={styles.column}>
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {i % every === 0 ? p.label : ''}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Spacing.three },
  rowGap: { gap: Spacing.one },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  track: { height: 10, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
  chart: { flexDirection: 'row' },
  column: { flex: 1, alignItems: 'center' },
  half: { width: '100%', alignItems: 'center' },
  bar: { width: '70%', borderRadius: 3 },
  labels: { flexDirection: 'row' },
});
