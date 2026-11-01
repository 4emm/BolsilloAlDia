import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: Variant;
  loading?: boolean;
  /** Versión más baja para acciones secundarias dentro de tarjetas. */
  compact?: boolean;
}

/** Botón accesible: rol de botón, estado busy/disabled y área táctil mínima de 48 px (44 en compacto). */
export function Button({
  title,
  variant = 'primary',
  loading = false,
  compact = false,
  disabled,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const background =
    variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : 'transparent';
  const color =
    variant === 'primary'
      ? theme.onPrimary
      : variant === 'danger'
        ? '#FFFFFF'
        : variant === 'ghost'
          ? theme.primary
          : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        {
          backgroundColor: background,
          borderColor: variant === 'secondary' ? theme.border : background,
        },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type="smallBold" style={{ color, fontSize: compact ? 14 : 16 }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: 44, paddingHorizontal: Spacing.three },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
