import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ConnectionBar } from './connection-bar';
import { ThemedText } from './themed-text';

interface ScreenProps extends ViewProps {
  title?: string;
  /** Muestra la flecha "atrás" (pantallas que se abren encima de las pestañas). */
  back?: boolean;
  /** Acciones a la derecha del título. */
  right?: ReactNode;
  edges?: Edge[];
}

/**
 * Contenedor base de TODAS las pantallas: zonas seguras, indicador de conexión, título y ancho máximo.
 * El indicador de conexión vive aquí para que sea visible y permanente en toda la app.
 */
export function Screen({
  title,
  back,
  right,
  children,
  edges = ['top', 'left', 'right'],
  style,
  ...rest
}: ScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: theme.background }]}>
      <ConnectionBar />
      {title || back || right ? (
        <View style={styles.header}>
          {back ? (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              hitSlop={8}
              style={styles.iconButton}>
              <Ionicons name="chevron-back" size={26} color={theme.text} />
            </Pressable>
          ) : null}
          <ThemedText type="title" style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </ThemedText>
          {right}
        </View>
      ) : null}
      <View style={[styles.content, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  title: { flex: 1 },
  iconButton: {
    width: 44,
    height: 44,
    marginLeft: -Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
