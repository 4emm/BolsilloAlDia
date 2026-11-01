import { StyleSheet, Text, type TextProps } from 'react-native';
import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'small' | 'smallBold' | 'caption' | 'money' | 'link';
  themeColor?: ThemeColor;
};

/** Texto que toma su color del tema (claro/oscuro) y ofrece los estilos tipográficos de la app. */
export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return (
    <Text
      style={[{ color: theme[themeColor ?? (type === 'link' ? 'primary' : 'text')] }, styles[type], style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  subtitle: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  money: { fontSize: 16, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  link: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
});
