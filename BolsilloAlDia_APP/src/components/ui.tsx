/** Piezas pequeñas de interfaz reutilizables: tarjeta, chip, segmentado, barra de progreso, etiquetas. */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Card({ style, children, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}
      {...rest}>
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <ThemedText type="subtitle" accessibilityRole="header">
        {children}
      </ThemedText>
      {right}
    </View>
  );
}

/** Botón de filtro/selección. Se anuncia como seleccionado a los lectores de pantalla. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
        pressed && { opacity: 0.8 },
      ]}>
      {icon ? <Ionicons name={icon} size={16} color={selected ? theme.onPrimary : theme.text} /> : null}
      <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Selector de 2-4 opciones en una sola fila (ej. Gasto | Ingreso). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color?: ThemeColor }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: theme.background }]}>
            <ThemedText
              type="smallBold"
              style={{ color: selected ? (o.color ? theme[o.color] : theme.text) : theme.textSecondary }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Barra de progreso (0–100). `color` permite marcar riesgo (rojo) o éxito (verde). */
export function ProgressBar({
  percent,
  color,
  label,
}: {
  percent: number;
  color?: ThemeColor;
  label?: string;
}) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: theme[color ?? 'primary'] }]} />
    </View>
  );
}

/** Etiqueta de color con texto (no depende solo del color: también dice qué es). */
export function Tag({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  icon?: IconName;
}) {
  const theme = useTheme();
  const palette = {
    success: [theme.successSoft, theme.success],
    warning: [theme.warningSoft, theme.warning],
    danger: [theme.dangerSoft, theme.danger],
    info: [theme.infoSoft, theme.info],
    neutral: [theme.backgroundSelected, theme.textSecondary],
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: palette[0] }]}>
      {icon ? <Ionicons name={icon} size={12} color={palette[1]} /> : null}
      <ThemedText type="caption" style={{ color: palette[1], fontWeight: '700' }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: Radius.medium,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { height: 10, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
});
