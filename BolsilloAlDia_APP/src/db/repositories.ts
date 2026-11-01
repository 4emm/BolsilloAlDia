/**
 * Repositorios: toda la SQL de la app vive aquí. Las pantallas y servicios nunca arman consultas.
 * Reglas: consultas SIEMPRE parametrizadas (?), nunca concatenar datos del usuario en el SQL.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  Category,
  EntityKind,
  Goal,
  Movement,
  ServerCategory,
  ServerGoal,
  ServerMovement,
} from '@/types';

// ───────────────────────── Entidades (categorías, metas, movimientos) ─────────────────────────

/** Qué tabla y qué campos propios tiene cada entidad. Los metadatos de sincronización son comunes. */
const ENTITIES = {
  category: { table: 'categories', fields: ['name', 'type', 'monthlyBudget'] },
  goal: { table: 'goals', fields: ['name', 'targetAmount', 'deadline'] },
  movement: {
    table: 'movements',
    fields: ['amount', 'type', 'categoryId', 'goalId', 'date', 'note'],
  },
} as const satisfies Record<EntityKind, { table: string; fields: readonly string[] }>;

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

type Row = Record<string, string | number | null>;

interface EntityMap {
  category: Category;
  goal: Goal;
  movement: Movement;
}
interface ServerMap {
  category: ServerCategory;
  goal: ServerGoal;
  movement: ServerMovement;
}

function rowToEntity<K extends EntityKind>(kind: K, row: Row): EntityMap[K] {
  const entity: Record<string, unknown> = { id: row.id };
  for (const f of ENTITIES[kind].fields) entity[f] = row[snake(f)];
  entity.createdAt = row.created_at;
  entity.clientUpdatedAt = row.client_updated_at;
  entity.serverUpdatedAt = row.server_updated_at;
  entity.syncState = row.sync_state;
  entity.syncError = row.sync_error;
  return entity as unknown as EntityMap[K];
}

/** Repositorio genérico: las tres entidades se guardan y se leen exactamente igual. */
export function createEntityRepo<K extends EntityKind>(db: SQLiteDatabase, kind: K) {
  type T = EntityMap[K];
  const { table, fields } = ENTITIES[kind];
  const columns = ['id', ...fields.map(snake)];
  const metaColumns = [
    'created_at',
    'client_updated_at',
    'server_updated_at',
    'sync_state',
    'sync_error',
  ];
  const allColumns = [...columns, ...metaColumns];
  const placeholders = allColumns.map(() => '?').join(', ');
  const updateSet = allColumns
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');

  const valuesOf = (e: Record<string, unknown>): (string | number | null)[] => [
    e.id as string,
    ...fields.map((f) => (e[f] ?? null) as string | number | null),
    e.createdAt as string,
    e.clientUpdatedAt as string,
    (e.serverUpdatedAt ?? null) as string | null,
    e.syncState as string,
    (e.syncError ?? null) as string | null,
  ];

  return {
    kind,
    async list(): Promise<T[]> {
      const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
      return rows.map((r) => rowToEntity(kind, r));
    },
    async getById(id: string): Promise<T | null> {
      const row = await db.getFirstAsync<Row>(`SELECT * FROM ${table} WHERE id = ?`, id);
      return row ? rowToEntity(kind, row) : null;
    },
    /** Guarda un cambio hecho en el teléfono (el llamador lo marca 'pending' y lo encola). */
    async saveLocal(entity: T): Promise<void> {
      await db.runAsync(
        `INSERT INTO ${table} (${allColumns.join(', ')}) VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${updateSet}`,
        ...valuesOf(entity as unknown as Record<string, unknown>),
      );
    },
    /**
     * Guarda la versión del servidor. NO pisa los registros con cambios pendientes de envío:
     * lo que el usuario hizo en el teléfono prevalece hasta que se envíe (así los totales no cambian solos).
     * Devuelve cuántos se aplicaron.
     */
    async applyServerMany(items: ServerMap[K][]): Promise<number> {
      if (items.length === 0) return 0;
      let applied = 0;
      await db.withTransactionAsync(async () => {
        for (const item of items) {
          const entity: Record<string, unknown> = {
            ...(item as unknown as Record<string, unknown>),
            serverUpdatedAt: item.updatedAt,
            syncState: 'synced',
            syncError: null,
          };
          const res = await db.runAsync(
            `INSERT INTO ${table} (${allColumns.join(', ')}) VALUES (${placeholders})
             ON CONFLICT(id) DO UPDATE SET ${updateSet}
             WHERE ${table}.sync_state <> 'pending'`,
            ...valuesOf(entity),
          );
          applied += res.changes;
        }
      });
      return applied;
    },
    /** Versión del servidor que SÍ reemplaza lo local (respuesta a un envío: el servidor decide). */
    async applyServerForce(item: ServerMap[K]): Promise<void> {
      const entity: Record<string, unknown> = {
        ...(item as unknown as Record<string, unknown>),
        serverUpdatedAt: item.updatedAt,
        syncState: 'synced',
        syncError: null,
      };
      await db.runAsync(
        `INSERT INTO ${table} (${allColumns.join(', ')}) VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${updateSet}`,
        ...valuesOf(entity),
      );
    },
    /** El envío salió bien y no hubo cambios nuevos mientras tanto. */
    async markSynced(id: string, serverUpdatedAt: string): Promise<void> {
      await db.runAsync(
        `UPDATE ${table} SET sync_state = 'synced', sync_error = NULL, server_updated_at = ? WHERE id = ?`,
        serverUpdatedAt,
        id,
      );
    },
    /** El servidor rechazó el registro al sincronizar: "gana el servidor", se informa al usuario. */
    async markConflict(id: string, message: string): Promise<void> {
      await db.runAsync(
        `UPDATE ${table} SET sync_state = 'conflict', sync_error = ? WHERE id = ?`,
        message,
        id,
      );
    },
    async remove(id: string): Promise<void> {
      await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
    },
    async clear(): Promise<void> {
      await db.runAsync(`DELETE FROM ${table}`);
    },
  };
}

export type EntityRepo<K extends EntityKind> = ReturnType<typeof createEntityRepo<K>>;

// ───────────────────────── Cola (outbox) ─────────────────────────

export interface OutboxItem {
  id: number;
  entity: EntityKind;
  entityId: string;
  op: 'upsert' | 'delete';
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

interface OutboxRow {
  id: number;
  entity: EntityKind;
  entity_id: string;
  op: 'upsert' | 'delete';
  attempts: number;
  last_error: string | null;
  created_at: string;
}

export function createOutboxRepo(db: SQLiteDatabase) {
  return {
    /**
     * Anota que un registro cambió. Si ya hay una entrada igual esperando, no se duplica:
     * al enviar se lee la versión más reciente del registro, así que una sola entrada basta.
     */
    async enqueue(entity: EntityKind, entityId: string, op: 'upsert' | 'delete'): Promise<void> {
      await db.runAsync(
        'INSERT OR IGNORE INTO outbox (entity, entity_id, op, created_at) VALUES (?, ?, ?, ?)',
        entity,
        entityId,
        op,
        new Date().toISOString(),
      );
    },
    /**
     * Orden de envío: primero se crean/editan categorías y metas, después los movimientos que
     * dependen de ellas, luego se borran movimientos y al final categorías y metas. Dentro de cada
     * grupo, por orden de llegada (FIFO). Así el servidor nunca recibe un movimiento antes que su categoría.
     */
    async pending(): Promise<OutboxItem[]> {
      const rows = await db.getAllAsync<OutboxRow>(
        `SELECT * FROM outbox ORDER BY
           CASE WHEN op = 'upsert' AND entity <> 'movement' THEN 0
                WHEN op = 'upsert' AND entity =  'movement' THEN 1
                WHEN op = 'delete' AND entity =  'movement' THEN 2
                ELSE 3 END,
           id`,
      );
      return rows.map((r) => ({
        id: r.id,
        entity: r.entity,
        entityId: r.entity_id,
        op: r.op,
        attempts: r.attempts,
        lastError: r.last_error,
        createdAt: r.created_at,
      }));
    },
    async count(): Promise<number> {
      const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
      return row?.n ?? 0;
    },
    async remove(id: number): Promise<void> {
      await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
    },
    /** Quita lo pendiente de un registro (p. ej. al eliminarlo: ya no hay nada que editar). */
    async removeFor(entity: EntityKind, entityId: string, op?: 'upsert' | 'delete'): Promise<void> {
      if (op) {
        await db.runAsync(
          'DELETE FROM outbox WHERE entity = ? AND entity_id = ? AND op = ?',
          entity,
          entityId,
          op,
        );
      } else {
        await db.runAsync('DELETE FROM outbox WHERE entity = ? AND entity_id = ?', entity, entityId);
      }
    },
    async recordFailure(id: number, message: string): Promise<void> {
      await db.runAsync(
        'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
        message,
        id,
      );
    },
    async clear(): Promise<void> {
      await db.runAsync('DELETE FROM outbox');
    },
  };
}

// ───────────────────────── Metadatos y bitácora ─────────────────────────

export function createMetaRepo(db: SQLiteDatabase) {
  return {
    async get(key: string): Promise<string | null> {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM sync_meta WHERE key = ?',
        key,
      );
      return row?.value ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      await db.runAsync(
        'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value,
      );
    },
    async delete(key: string): Promise<void> {
      await db.runAsync('DELETE FROM sync_meta WHERE key = ?', key);
    },
    async clear(): Promise<void> {
      await db.runAsync('DELETE FROM sync_meta');
    },
  };
}

export interface ActivityEntry {
  id: number;
  kind: string;
  detail: string;
  createdAt: string;
}

export function createActivityRepo(db: SQLiteDatabase) {
  return {
    /** Nunca registrar tokens, contraseñas ni datos personales en la bitácora. */
    async log(kind: string, detail: string): Promise<void> {
      await db.runAsync(
        'INSERT INTO activity_log (kind, detail, created_at) VALUES (?, ?, ?)',
        kind,
        detail,
        new Date().toISOString(),
      );
      // Se conservan solo los últimos 200 eventos.
      await db.runAsync(
        'DELETE FROM activity_log WHERE id NOT IN (SELECT id FROM activity_log ORDER BY id DESC LIMIT 200)',
      );
    },
    async recent(limit = 20): Promise<ActivityEntry[]> {
      const rows = await db.getAllAsync<{
        id: number;
        kind: string;
        detail: string;
        created_at: string;
      }>('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?', limit);
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        detail: r.detail,
        createdAt: r.created_at,
      }));
    },
    async clear(): Promise<void> {
      await db.runAsync('DELETE FROM activity_log');
    },
  };
}

export function createRepositories(db: SQLiteDatabase) {
  const categories = createEntityRepo(db, 'category');
  const goals = createEntityRepo(db, 'goal');
  const movements = createEntityRepo(db, 'movement');
  return {
    db,
    categories,
    goals,
    movements,
    outbox: createOutboxRepo(db),
    meta: createMetaRepo(db),
    activity: createActivityRepo(db),
    /** Acceso por tipo: lo usa la sincronización, que trata las tres entidades igual. */
    entity(kind: EntityKind) {
      return { category: categories, goal: goals, movement: movements }[kind];
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
