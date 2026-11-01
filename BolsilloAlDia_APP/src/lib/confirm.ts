import { Alert } from 'react-native';

/** Pide confirmación antes de una acción destructiva (eliminar, cerrar sesión con pendientes…). */
export function confirmAction(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}) {
  Alert.alert(opts.title, opts.message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: opts.confirmLabel, style: 'destructive', onPress: () => void opts.onConfirm() },
  ]);
}
