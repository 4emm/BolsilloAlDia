import { Alert, Platform } from 'react-native';

/**
 * Pide confirmación antes de una acción destructiva (eliminar, cerrar sesión con pendientes…).
 * En web se usa `window.confirm`, porque `Alert.alert` no muestra botones en el navegador.
 */
export function confirmAction(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}) {
  if (Platform.OS === 'web') {
    const accepted =
      typeof window !== 'undefined' && window.confirm(`${opts.title}\n\n${opts.message}`);
    if (accepted) void opts.onConfirm();
    return;
  }

  Alert.alert(opts.title, opts.message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: opts.confirmLabel, style: 'destructive', onPress: () => void opts.onConfirm() },
  ]);
}
