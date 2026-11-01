/** Tipos de la app. Los de datos espejan lo que devuelve la API (BolsilloAlDia_API/lib/types.ts). */

export interface User {
  uid: string;
  email: string;
  name: string;
}

export interface TokenSet {
  idToken: string;
  refreshToken: string;
  /** Segundos de vigencia del idToken. */
  expiresIn: number;
}

export interface AuthResult {
  tokens: TokenSet;
  user: User;
}

export type MovementType = 'expense' | 'income';

/**
 * Estado de sincronización de un registro guardado en SQLite:
 * - synced:   coincide con el servidor
 * - pending:  creado o editado en el teléfono, esperando en la cola (outbox)
 * - conflict: el servidor lo rechazó al sincronizar (gana el servidor); ver `syncError`
 */
export type SyncState = 'synced' | 'pending' | 'conflict';

export type EntityKind = 'category' | 'goal' | 'movement';

/** Metadatos de sincronización que acompañan a cada registro. */
export interface RecordMeta {
  createdAt: string;
  /** Hora (ISO) del último cambio hecho en este dispositivo: base de la regla de conflictos. */
  clientUpdatedAt: string;
  /** Hora del servidor de la última versión conocida; null si nunca llegó al servidor. */
  serverUpdatedAt: string | null;
  syncState: SyncState;
  syncError: string | null;
}

export interface Category extends RecordMeta {
  id: string;
  name: string;
  type: MovementType;
  /** Presupuesto mensual en pesos (solo categorías de gasto) o null. */
  monthlyBudget: number | null;
}

export interface Goal extends RecordMeta {
  id: string;
  name: string;
  /** Monto a ahorrar, en pesos enteros. */
  targetAmount: number;
  /** Fecha límite AAAA-MM-DD. */
  deadline: string;
}

export interface Movement extends RecordMeta {
  id: string;
  /** Pesos enteros, siempre positivo; el signo lo da `type`. */
  amount: number;
  type: MovementType;
  categoryId: string;
  /** Si es un aporte de ahorro, la meta a la que pertenece. */
  goalId: string | null;
  /** Día del movimiento AAAA-MM-DD (hora local). */
  date: string;
  note: string;
}

// ───────────── Formas que viajan por la API ─────────────

export interface ServerMeta {
  createdAt: string;
  clientUpdatedAt: string;
  updatedAt: string;
}
export type ServerCategory = ServerMeta & Pick<Category, 'id' | 'name' | 'type' | 'monthlyBudget'>;
export type ServerGoal = ServerMeta & Pick<Goal, 'id' | 'name' | 'targetAmount' | 'deadline'>;
export type ServerMovement = ServerMeta &
  Pick<Movement, 'id' | 'amount' | 'type' | 'categoryId' | 'goalId' | 'date' | 'note'>;
export interface Tombstone {
  id: string;
  deleted: true;
  deletedAt: string;
  updatedAt: string;
}
export type Synced<T> = T | Tombstone;

export function isTombstone<T extends { id: string }>(item: Synced<T>): item is Tombstone {
  return (item as Tombstone).deleted === true;
}
