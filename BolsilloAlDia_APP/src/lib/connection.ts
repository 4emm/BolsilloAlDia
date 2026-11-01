/**
 * Qué debe decir el indicador de conexión (visible en TODAS las pantallas). Es una función pura
 * para poder probar cada estado: sin conexión, sincronizando, pendientes, error, conflictos, al día.
 */
import { dayjs } from '@/lib/dayjs';

export type ConnectionTone = 'success' | 'warning' | 'danger' | 'info';

export interface ConnectionInput {
  signedIn: boolean;
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  conflictCount: number;
  lastError: string | null;
  lastSyncAt: string | null;
}

export interface ConnectionView {
  tone: ConnectionTone;
  icon: 'cloud-offline' | 'sync' | 'alert-circle' | 'cloud-upload' | 'cloud-done';
  text: string;
}

export function describeConnection(i: ConnectionInput): ConnectionView {
  if (!i.online) {
    if (!i.signedIn) {
      return {
        tone: 'warning',
        icon: 'cloud-offline',
        text: 'Sin conexión · Necesitas internet para iniciar sesión o crear tu cuenta',
      };
    }
    const pending =
      i.pendingCount > 0
        ? ` · ${i.pendingCount} ${i.pendingCount === 1 ? 'cambio por enviar' : 'cambios por enviar'}`
        : '';
    return {
      tone: 'warning',
      icon: 'cloud-offline',
      text: `Sin conexión · Tus datos están guardados en el teléfono${pending}`,
    };
  }
  if (!i.signedIn) return { tone: 'success', icon: 'cloud-done', text: 'En línea' };
  if (i.syncing) return { tone: 'info', icon: 'sync', text: 'Sincronizando…' };
  if (i.conflictCount > 0) {
    return {
      tone: 'danger',
      icon: 'alert-circle',
      text: `${i.conflictCount} ${i.conflictCount === 1 ? 'registro rechazado' : 'registros rechazados'} · toca para revisar`,
    };
  }
  if (i.lastError) {
    return { tone: 'warning', icon: 'alert-circle', text: 'No se pudo sincronizar · toca para reintentar' };
  }
  if (i.pendingCount > 0) {
    return {
      tone: 'info',
      icon: 'cloud-upload',
      text: `En línea · ${i.pendingCount} ${i.pendingCount === 1 ? 'cambio por enviar' : 'cambios por enviar'}`,
    };
  }
  return {
    tone: 'success',
    icon: 'cloud-done',
    text: i.lastSyncAt ? `En línea · Sincronizado ${dayjs(i.lastSyncAt).fromNow()}` : 'En línea · Sincronizado',
  };
}
