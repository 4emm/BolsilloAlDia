/** Tipos del dominio de BolsilloAlDía. Son el contrato entre la API y la app móvil. */

export type MovementType = "expense" | "income";

export interface AuthUser {
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

/**
 * Metadatos de sincronización que el SERVIDOR administra en cada registro.
 * - `clientUpdatedAt`: hora (ISO) en que el usuario hizo el último cambio en su dispositivo.
 *   Es la base de la regla de conflictos "última edición gana".
 * - `updatedAt`: hora del servidor al guardar. Es el cursor de la sincronización incremental.
 */
export interface SyncMeta {
  createdAt: string;
  clientUpdatedAt: string;
  updatedAt: string;
}

export interface Category extends SyncMeta {
  id: string;
  name: string;
  type: MovementType;
  /** Presupuesto mensual en pesos (solo categorías de gasto) o null si no tiene. */
  monthlyBudget: number | null;
  deleted?: false;
}

export interface Goal extends SyncMeta {
  id: string;
  name: string;
  /** Monto que se quiere ahorrar, en pesos. */
  targetAmount: number;
  /** Fecha límite, AAAA-MM-DD. */
  deadline: string;
  deleted?: false;
}

export interface Movement extends SyncMeta {
  id: string;
  /** Monto en pesos enteros (siempre positivo; el signo lo da `type`). */
  amount: number;
  type: MovementType;
  categoryId: string;
  /** Si es un aporte a una meta de ahorro, el id de la meta. */
  goalId: string | null;
  /** Día del movimiento, AAAA-MM-DD (hora local del usuario). */
  date: string;
  note: string;
  deleted?: false;
}

/** Lo que queda de un registro eliminado: solo sirve para que los demás dispositivos lo borren. */
export interface Tombstone {
  id: string;
  deleted: true;
  deletedAt: string;
  updatedAt: string;
}

export type Synced<T> = T | Tombstone;

export type EntityKind = "category" | "goal" | "movement";
