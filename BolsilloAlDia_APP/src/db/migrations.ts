import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migraciones básicas con PRAGMA user_version.
 *
 * SQLite guarda un entero (user_version) dentro del archivo de la base de datos.
 * Al abrir la app comparamos ese número con DATABASE_VERSION y aplicamos, en orden,
 * solo las migraciones que falten. Cada migración nueva se agrega como un `if` más y
 * se sube DATABASE_VERSION; NUNCA se edita una migración que ya salió en una versión publicada.
 */
export const DATABASE_VERSION = 1;

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  // WAL permite leer mientras se escribe (la UI consulta mientras la sincronización inserta).
  await db.execAsync('PRAGMA journal_mode = WAL;');

  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        -- Cada tabla de datos lleva los mismos metadatos de sincronización:
        --   client_updated_at  hora del último cambio hecho en ESTE teléfono (regla de conflictos)
        --   server_updated_at  hora del servidor de la última versión conocida (NULL = nunca llegó)
        --   sync_state         synced | pending (en la cola) | conflict (el servidor la rechazó)
        CREATE TABLE categories (
          id                TEXT PRIMARY KEY NOT NULL,   -- UUID generado en el teléfono: identidad estable
          name              TEXT NOT NULL,
          type              TEXT NOT NULL CHECK (type IN ('expense','income')),
          monthly_budget    INTEGER CHECK (monthly_budget IS NULL OR monthly_budget > 0),
          created_at        TEXT NOT NULL,
          client_updated_at TEXT NOT NULL,
          server_updated_at TEXT,
          sync_state        TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced','pending','conflict')),
          sync_error        TEXT
        );
        CREATE TABLE goals (
          id                TEXT PRIMARY KEY NOT NULL,
          name              TEXT NOT NULL,
          target_amount     INTEGER NOT NULL CHECK (target_amount > 0),
          deadline          TEXT NOT NULL,               -- AAAA-MM-DD
          created_at        TEXT NOT NULL,
          client_updated_at TEXT NOT NULL,
          server_updated_at TEXT,
          sync_state        TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced','pending','conflict')),
          sync_error        TEXT
        );
        CREATE TABLE movements (
          id                TEXT PRIMARY KEY NOT NULL,
          amount            INTEGER NOT NULL CHECK (amount > 0),   -- pesos enteros; el signo lo da type
          type              TEXT NOT NULL CHECK (type IN ('expense','income')),
          category_id       TEXT NOT NULL,
          goal_id           TEXT,                        -- aporte a una meta de ahorro
          date              TEXT NOT NULL,               -- AAAA-MM-DD en hora local
          note              TEXT NOT NULL DEFAULT '',
          created_at        TEXT NOT NULL,
          client_updated_at TEXT NOT NULL,
          server_updated_at TEXT,
          sync_state        TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced','pending','conflict')),
          sync_error        TEXT
        );
        CREATE INDEX idx_movements_date     ON movements (date DESC);
        CREATE INDEX idx_movements_category ON movements (category_id);
        CREATE INDEX idx_movements_goal     ON movements (goal_id);

        -- Cola de cambios sin enviar. Guarda QUÉ registro cambió, no una copia del cambio:
        -- al enviar se lee la versión más reciente, así varias ediciones seguidas viajan como una sola.
        -- UNIQUE evita duplicar la entrada: editar dos veces un registro pendiente no agrega otra fila.
        CREATE TABLE outbox (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          entity      TEXT NOT NULL CHECK (entity IN ('category','goal','movement')),
          entity_id   TEXT NOT NULL,
          op          TEXT NOT NULL CHECK (op IN ('upsert','delete')),
          attempts    INTEGER NOT NULL DEFAULT 0,
          last_error  TEXT,
          created_at  TEXT NOT NULL,
          UNIQUE (entity, entity_id, op)
        );

        -- Clave/valor: cursores de sincronización, última sincronización, dueño de los datos.
        CREATE TABLE sync_meta (
          key   TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        -- Bitácora local de eventos (solo los últimos 200). Nunca guarda tokens ni contraseñas.
        CREATE TABLE activity_log (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          kind       TEXT NOT NULL,
          detail     TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    });
    version = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
