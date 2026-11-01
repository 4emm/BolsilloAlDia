/**
 * Sincronización local ⇄ remota. Estrategia offline-first:
 *
 *  1. La UI SIEMPRE lee y escribe en SQLite; nunca espera a la red.
 *  2. Cada cambio se anota en la cola `outbox`. Este servicio la vacía cuando hay conexión.
 *  3. Después trae los cambios del servidor (incremental, con un cursor por entidad).
 *
 * IDEMPOTENCIA (un movimiento registrado sin conexión aparece UNA sola vez):
 *  - El id de cada registro es un UUID generado en el teléfono al crearlo y no cambia nunca.
 *  - El envío es `PUT /api/<recurso>/<id>`: el servidor usa ese id como id del documento, así que
 *    reenviar el mismo registro (app cerrada y reabierta, respuesta perdida, varias sincronizaciones)
 *    cae sobre el mismo documento y no crea otro. Un reintento idéntico ni siquiera se escribe.
 *  - La cola vive en SQLite (persistente) y solo se quita una entrada DESPUÉS de que el servidor respondió OK.
 *
 * REGLA DE CONFLICTOS ("la última edición gana, y borrar gana siempre"):
 *  - Cada cambio viaja con `clientUpdatedAt` (hora del teléfono). Si el servidor ya tiene una edición
 *    más reciente, conserva la suya y responde con ella (`applied: false`): aquí se adopta.
 *  - Un registro eliminado no se revive: si el servidor lo tiene eliminado, se borra la copia local.
 *  - Lo local con cambios pendientes NO se pisa al descargar; así los totales no cambian solos.
 *  - Si el servidor rechaza un registro (409/400/404), queda marcado 'conflict' con el motivo y NO cuenta
 *    en los totales hasta que el usuario lo reintente o lo descarte. Nunca se pierde sin avisar.
 */
import { cursorKey } from '@/services/data/finance-service';
import type { Repositories, OutboxItem } from '@/db/repositories';
import { ApiRequestError, NetworkError, type ApiClient } from '@/services/api/client';
import { isTombstone, type EntityKind, type SyncState, type Synced } from '@/types';

/** Tras este número de fallos 5xx se abandona el envío y se informa al usuario. */
export const MAX_ATTEMPTS = 5;
/** Se pide al servidor un poco "hacia atrás" del cursor: el upsert es idempotente y evita perder cambios en el borde. */
const CURSOR_OVERLAP_MS = 1000;
/** Pasadas máximas de envío por ciclo (por si el usuario edita mientras se envía). */
const MAX_PASSES = 3;

const PATHS: Record<EntityKind, string> = {
  category: '/api/categories',
  goal: '/api/goals',
  movement: '/api/movements',
};
const LABELS: Record<EntityKind, string> = {
  category: 'categoría',
  goal: 'meta',
  movement: 'movimiento',
};
const PULL_ORDER: EntityKind[] = ['category', 'goal', 'movement'];
export const LAST_SYNC_KEY = 'sync.lastSyncAt';

/** Campos que se envían al servidor de cada entidad (lo demás son metadatos locales). */
const PAYLOAD_FIELDS: Record<EntityKind, string[]> = {
  category: ['name', 'type', 'monthlyBudget'],
  goal: ['name', 'targetAmount', 'deadline'],
  movement: ['amount', 'type', 'categoryId', 'goalId', 'date', 'note'],
};

interface LocalRecord {
  id: string;
  clientUpdatedAt: string;
  createdAt: string;
  syncState: SyncState;
  [key: string]: unknown;
}

export interface SyncResult {
  pushed: number;
  conflicts: number;
  /** Cambios locales que el servidor descartó por tener una edición más reciente. */
  serverWon: number;
  pulled: number;
}

export interface SyncDeps {
  api: Pick<ApiClient, 'get' | 'put' | 'delete'>;
  repos: Repositories;
  now?: () => Date;
}

/** Explica al usuario, en lenguaje claro, por qué el servidor rechazó un registro. */
export function conflictMessage(err: ApiRequestError, kind: EntityKind): string {
  switch (err.code) {
    case 'INVALID_REFERENCE':
      return 'Su categoría o su meta ya no existe en tu cuenta (se eliminó desde otro dispositivo).';
    case 'VALIDATION_ERROR':
      return `El servidor no aceptó los datos de este ${LABELS[kind]}: ${err.message}`;
    case 'NOT_FOUND':
      return `Este ${LABELS[kind]} ya no existe en el servidor.`;
    default:
      return err.message;
  }
}

function buildPayload(kind: EntityKind, record: LocalRecord): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    createdAt: record.createdAt,
    clientUpdatedAt: record.clientUpdatedAt,
  };
  for (const field of PAYLOAD_FIELDS[kind]) payload[field] = record[field];
  return payload;
}

interface WriteResponse {
  item: Synced<{ id: string; updatedAt: string }>;
  applied: boolean;
}

export function createSyncService({ api, repos, now = () => new Date() }: SyncDeps) {
  const { outbox, meta, activity } = repos;
  const repoOf = (kind: EntityKind) =>
    repos.entity(kind) as unknown as {
      getById(id: string): Promise<LocalRecord | null>;
      applyServerForce(item: unknown): Promise<void>;
      applyServerMany(items: unknown[]): Promise<number>;
      markSynced(id: string, serverUpdatedAt: string): Promise<void>;
      markConflict(id: string, message: string): Promise<void>;
      remove(id: string): Promise<void>;
    };

  /** Envía una entrada de la cola. Devuelve qué pasó para llevar la cuenta. */
  async function pushOne(item: OutboxItem): Promise<'pushed' | 'serverWon' | 'conflict' | 'kept'> {
    const kind = item.entity;
    const repo = repoOf(kind);

    if (item.op === 'delete') {
      await api.delete(`${PATHS[kind]}/${item.entityId}`);
      await outbox.remove(item.id);
      await activity.log('sync.push', `Eliminación de ${LABELS[kind]} enviada`);
      return 'pushed';
    }

    const record = await repo.getById(item.entityId);
    if (!record) {
      await outbox.remove(item.id); // se eliminó mientras esperaba: no hay nada que enviar
      return 'pushed';
    }
    const res = await api.put<WriteResponse>(
      `${PATHS[kind]}/${item.entityId}`,
      buildPayload(kind, record),
    );

    if (isTombstone(res.item)) {
      // Borrar gana siempre: el registro fue eliminado (p. ej. desde otro dispositivo).
      await repo.remove(item.entityId);
      await outbox.remove(item.id);
      await activity.log('sync.deleted_remote', `El ${LABELS[kind]} ya estaba eliminado en el servidor`);
      return 'serverWon';
    }
    if (!res.applied) {
      // Hay una edición más reciente en el servidor: gana el servidor.
      await repo.applyServerForce(res.item);
      await outbox.remove(item.id);
      await activity.log('sync.server_wins', `Se conservó la edición más reciente del servidor (${LABELS[kind]})`);
      return 'serverWon';
    }
    const current = await repo.getById(item.entityId);
    if (current && current.clientUpdatedAt !== record.clientUpdatedAt) {
      // El usuario volvió a editarlo mientras se enviaba: la entrada se queda para enviar lo nuevo.
      return 'kept';
    }
    await repo.markSynced(item.entityId, res.item.updatedAt);
    await outbox.remove(item.id);
    await activity.log('sync.push', `${LABELS[kind][0].toUpperCase()}${LABELS[kind].slice(1)} enviado`);
    return 'pushed';
  }

  /** Envía la cola en orden. Devuelve cuántas salieron y cuántas terminaron en conflicto. */
  async function pushOutbox(): Promise<Omit<SyncResult, 'pulled'>> {
    const result = { pushed: 0, conflicts: 0, serverWon: 0 };
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let kept = 0;
      for (const item of await outbox.pending()) {
        try {
          const outcome = await pushOne(item);
          if (outcome === 'pushed') result.pushed++;
          else if (outcome === 'serverWon') result.serverWon++;
          else kept++;
        } catch (err) {
          if (err instanceof NetworkError) throw err; // sigue sin conexión: se conserva toda la cola
          if (err instanceof ApiRequestError) {
            if (err.status === 401) throw err; // sesión inválida: no es un conflicto del registro
            const retryable = err.status >= 500 || err.status === 429;
            if (retryable && item.attempts + 1 < MAX_ATTEMPTS) {
              await outbox.recordFailure(item.id, err.message);
              throw err; // se reintenta en la próxima sincronización
            }
            const message = retryable
              ? 'El servidor no pudo procesar el cambio. Inténtalo de nuevo.'
              : conflictMessage(err, item.entity);
            if (item.op === 'upsert') await repoOf(item.entity).markConflict(item.entityId, message);
            await outbox.remove(item.id);
            result.conflicts++;
            await activity.log('sync.conflict', `${err.code}: ${message}`);
            continue;
          }
          throw err;
        }
      }
      if (kept === 0) break;
    }
    return result;
  }

  async function pull(kind: EntityKind): Promise<number> {
    const repo = repoOf(kind);
    const key = cursorKey(kind);
    const cursor = await meta.get(key);
    const query = cursor ? `?updatedSince=${encodeURIComponent(cursor)}` : '';
    const res = await api.get<{ items: Synced<{ id: string; updatedAt: string }>[]; serverTime: string }>(
      `${PATHS[kind]}${query}`,
    );
    const live: { id: string; updatedAt: string }[] = [];
    for (const item of res.items) {
      if (isTombstone(item)) {
        // Borrar gana siempre: se elimina la copia local y cualquier cambio pendiente de ese registro.
        await repo.remove(item.id);
        await outbox.removeFor(kind, item.id);
      } else {
        live.push(item);
      }
    }
    await repo.applyServerMany(live);
    // El cursor avanza SOLO si todo lo anterior salió bien (si algo falla, se vuelve a pedir).
    const next = new Date(new Date(res.serverTime).getTime() - CURSOR_OVERLAP_MS).toISOString();
    await meta.set(key, next);
    return res.items.length;
  }

  return {
    /** Ciclo completo. Lanza NetworkError/ApiRequestError si no pudo terminar (lo ya hecho se conserva). */
    async run(): Promise<SyncResult> {
      const pushedInfo = await pushOutbox();
      let pulled = 0;
      for (const kind of PULL_ORDER) pulled += await pull(kind);
      await meta.set(LAST_SYNC_KEY, now().toISOString());
      return { ...pushedInfo, pulled };
    },
    async lastSyncAt(): Promise<string | null> {
      return meta.get(LAST_SYNC_KEY);
    },
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
