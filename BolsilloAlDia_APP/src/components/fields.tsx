/** Campos especializados de los formularios: monto y fecha. */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { addDays, addMonths } from '@/domain/periods';
import { formatAmountInput } from '@/domain/money';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { Chip } from './ui';

/** Campo de monto grande: solo dígitos, con puntos de miles mientras se escribe. */
export function AmountField({
  label = 'Monto',
  value,
  onChange,
  error,
  autoFocus,
  placeholder = '0',
}: {
  label?: string;
  value: string;
  onChange: (text: string) => void;
  error?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.wrapper}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        style={[
          styles.amountBox,
          {
            borderColor: error ? theme.danger : theme.border,
            backgroundColor: theme.backgroundElement,
          },
        ]}>
        <ThemedText style={styles.currency} themeColor="textSecondary">
          $
        </ThemedText>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(formatAmountInput(t))}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          autoFocus={autoFocus}
          accessibilityLabel={label}
          maxLength={16}
          style={[styles.amountInput, { color: theme.text }]}
        />
      </View>
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * Fecha AAAA-MM-DD: se puede escribir, mover día a día con ‹ ›, o elegir un atajo (Hoy, Ayer, +1 mes…).
 * No usa un calendario nativo: es más rápido para el registro diario y funciona igual en todo dispositivo.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  today,
  quick,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  error?: string;
  today: string;
  /** Atajos opcionales; por defecto Hoy y Ayer. */
  quick?: { label: string; date: string }[];
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const shortcuts = quick ?? [
    { label: 'Hoy', date: today },
    { label: 'Ayer', date: addDays(today, -1) },
  ];
  const step = (n: number) => onChange(addDays(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today, n));
  return (
    <View style={styles.wrapper}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.dateRow}>
        <Pressable
          onPress={() => step(-1)}
          accessibilityRole="button"
          accessibilityLabel="Día anterior"
          style={[styles.stepButton, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="AAAA-MM-DD"
          placeholderTextColor={theme.textSecondary}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          accessibilityLabel={label}
          style={[
            styles.dateInput,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: error ? theme.danger : focused ? theme.primary : theme.border,
            },
          ]}
        />
        <Pressable
          onPress={() => step(1)}
          accessibilityRole="button"
          accessibilityLabel="Día siguiente"
          style={[styles.stepButton, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </Pressable>
      </View>
      <View style={styles.chips}>
        {shortcuts.map((s) => (
          <Chip key={s.label} label={s.label} selected={value === s.date} onPress={() => onChange(s.date)} />
        ))}
      </View>
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Atajos para fechas límite: dentro de 1, 3, 6 meses o 1 año. */
export function deadlineShortcuts(today: string) {
  return [
    { label: '+1 mes', date: addMonths(today, 1) },
    { label: '+3 meses', date: addMonths(today, 3) },
    { label: '+6 meses', date: addMonths(today, 6) },
    { label: '+1 año', date: addMonths(today, 12) },
  ];
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.one },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  currency: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '700', paddingVertical: Spacing.two },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
});
