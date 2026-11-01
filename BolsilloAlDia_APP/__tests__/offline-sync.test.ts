/**
 * Pruebas de la estrategia offline-first con SQL real (node:sqlite) y un servidor falso que aplica
 * las mismas reglas que la API. Cada prueba responde a una pregunta de la sustentación:
 * "registro un gasto en modo avión, cierro la app, la abro y sincronizo: ¿cuántas veces aparece?"
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATABASE_VERSION, migrateDbIfNeeded } from '@/db/migrations';
import { createRepositories } from '@/db/repositories';
import { countable, summarize } from '@/domain/summary';
import { NetworkError, ApiRequestError } from '@/services/api/client';
import { createFinanceService } from '@/services/data/finance-service';
import { createSyncService, MAX_ATTEMPTS } from '@/services/sync/sync-service';
import { closeTestDb, createTestDb } from '../test-utils/node-sqlite';
import { createFakeServer } from '../test-utils/fake-server';

const T = (minutes: number) => new Date(Date.parse('2026-10-12T10:00:00.000Z') + minutes * 60_000);

/** Un "teléfono": su base de datos, sus servicios y un reloj controlable. */
async function openDevice(server: ReturnType<typeof createFakeServer>, file = ':memory:', clock = { minutes: 0 }) {
  const db = createTestDb(file);
  await migrateDbIfNeeded(db);
  const repos = createRepositories(db);
  let n = 0;
  const idPrefix = path.basename(file).replace(/\W/g, '').slice(0, 6) || 'mem';
  // El primer registro que se crea en el teléfono es la categoría 'cat-bus' que usan los movimientos de prueba.
  const reserved = ['cat-bus'];
  const finance = createFinanceService({
    repos,
    newId: () => reserved.shift() ?? `${idPrefix}-id-${String(++n).padStart(6, '0')}${clock.minutes}`,
    now: () => T(clock.minutes++),
  });
  const sync = createSyncService({ api: server.api, repos, now: () => T(1000) });
  return { db, repos, finance, sync, clock };
}

const movementInput = (over: Record<string, unknown> = {}) => ({
  amount: 2000,
  type: 'expense' as const,
  categoryId: 'cat-bus',
  goalId: null,
  date: '2026-10-12',
  note: '',
  ...over,
});
const categoryInput = { name: 'Transporte', type: 'expense' as const, monthlyBudget: null };

async function deviceWithCategory(server: ReturnType<typeof createFakeServer>, file?: string) {
  const d = await openDevice(server, file);
  const cat = await d.finance.createCategory(categoryInput);
  await d.sync.run(); // la categoría llega al servidor
  return { ...d, cat };
}

describe('base de datos local', () => {
  it('migra desde cero, fija la versión y es repetible', async () => {
    const db = createTestDb();
    await migrateDbIfNeeded(db);
    await migrateDbIfNeeded(db);
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(DATABASE_VERSION);
    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    expect(tables.map((t) => t.name)).toEqual(
      ['activity_log', 'categories', 'goals', 'movements', 'outbox', 'sync_meta'].sort(),
    );
  });

  it('rechaza datos inválidos en la propia tabla (monto ≤ 0, tipo inválido)', async () => {
    const server = createFakeServer();
    const { db } = await openDevice(server);
    const bad = (amount: number, type = 'expense') =>
      db.runAsync(
        `INSERT INTO movements (id, amount, type, category_id, date, created_at, client_updated_at) VALUES ('x', ?, ?, 'c', '2026-10-12', 't', 't')`,
        amount,
        type,
      );
    await expect(bad(0)).rejects.toThrow();
    await expect(bad(-5)).rejects.toThrow();
    await expect(bad(10, 'otro')).rejects.toThrow();
  });

  it('una consulta con comillas o comodines en la nota no rompe el SQL', async () => {
    const server = createFakeServer();
    const { finance, repos } = await openDevice(server);
    await finance.createMovement(movementInput({ note: "'; DROP TABLE movements; -- 100% _real" }));
    expect((await repos.movements.list())[0].note).toBe("'; DROP TABLE movements; -- 100% _real");
  });
});

describe('modo avión: registrar, editar y calcular sin conexión', () => {
  it('registrar sin conexión guarda en SQLite, encola y calcula los totales localmente', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    server.state.online = false;

    const m = await d.finance.createMovement(movementInput({ amount: 2000 }));
    await d.finance.createMovement(movementInput({ amount: 3500 }));

    await expect(d.sync.run()).rejects.toBeInstanceOf(NetworkError); // sigue sin red
    const local = await d.repos.movements.list();
    expect(local).toHaveLength(2);
    expect(local.every((x) => x.syncState === 'pending')).toBe(true);
    expect(await d.repos.outbox.count()).toBe(2);
    expect(summarize(countable(local)).expense).toBe(5500); // total calculado sin servidor
    expect(m.syncState).toBe('pending');
    expect(server.count('movement')).toBe(0);
  });

  it('al volver la conexión se envían y el indicador de pendientes desaparece', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    server.state.online = false;
    await d.finance.createMovement(movementInput());
    server.state.online = true;

    const result = await d.sync.run();
    expect(result.pushed).toBe(1);
    expect(await d.repos.outbox.count()).toBe(0);
    expect((await d.repos.movements.list())[0]).toMatchObject({ syncState: 'synced' });
    expect(server.count('movement')).toBe(1);
  });

  it('editar y eliminar sin conexión recalcula al instante y se propaga después', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const m = await d.finance.createMovement(movementInput({ amount: 1000 }));
    const gone = await d.finance.createMovement(movementInput({ amount: 9000 }));
    await d.sync.run();

    server.state.online = false;
    await d.finance.updateMovement(m.id, movementInput({ amount: 4000, note: 'editado' }));
    await d.finance.deleteMovement(gone.id);
    const local = await d.repos.movements.list();
    expect(summarize(local).expense).toBe(4000); // totales ya recalculados, sin red

    server.state.online = true;
    await d.sync.run();
    expect(server.store.movement.get(m.id)).toMatchObject({ amount: 4000, note: 'editado' });
    expect(server.store.movement.has(gone.id)).toBe(false);
    expect(await d.repos.outbox.count()).toBe(0);
  });

  it('varias ediciones seguidas de un registro pendiente viajan como UNA sola petición', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    server.state.online = false;
    const m = await d.finance.createMovement(movementInput({ amount: 1000 }));
    await d.finance.updateMovement(m.id, movementInput({ amount: 2000 }));
    await d.finance.updateMovement(m.id, movementInput({ amount: 3000 }));
    expect(await d.repos.outbox.count()).toBe(1);

    server.state.online = true;
    const before = server.state.requests;
    await d.sync.run();
    expect(server.state.requests - before).toBe(1);
    expect(server.store.movement.get(m.id)).toMatchObject({ amount: 3000 });
  });
});

describe('idempotencia: sin duplicados', () => {
  it('sincronizar varias veces seguidas no duplica nada', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    server.state.online = false;
    await d.finance.createMovement(movementInput());
    server.state.online = true;

    await d.sync.run();
    await d.sync.run();
    await d.sync.run();

    expect(server.count('movement')).toBe(1);
    expect(await d.repos.movements.list()).toHaveLength(1);
  });

  it('cerrar la app con registros pendientes, reabrirla y sincronizar: aparece UNA vez', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bolsillo-')), 'phone.db');
    const server = createFakeServer();
    const first = await deviceWithCategory(server, file);
    server.state.online = false;
    const m = await first.finance.createMovement(movementInput({ amount: 2000 }));
    closeTestDb(first.db); // se cierra la app con el gasto en la cola

    server.state.online = true;
    const second = await openDevice(server, file); // se abre de nuevo: mismo archivo
    expect(await second.repos.outbox.count()).toBe(1); // no se perdió nada
    expect((await second.repos.movements.list())[0].id).toBe(m.id); // mismo id estable

    await second.sync.run();
    await second.sync.run();
    expect(server.count('movement')).toBe(1);
    expect(await second.repos.movements.list()).toHaveLength(1);
    closeTestDb(second.db);
  });

  it('si el servidor guardó el registro pero la respuesta se perdió, el reintento no lo duplica', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    await d.finance.createMovement(movementInput());

    server.state.dropResponses = true; // el PUT llega y se guarda, pero la app no recibe la respuesta
    await expect(d.sync.run()).rejects.toBeInstanceOf(NetworkError);
    expect(server.count('movement')).toBe(1);
    expect(await d.repos.outbox.count()).toBe(1); // la app no sabe si llegó: lo conserva

    server.state.dropResponses = false;
    await d.sync.run();
    expect(server.count('movement')).toBe(1); // sigue siendo uno
    expect(await d.repos.outbox.count()).toBe(0);
    expect((await d.repos.movements.list())[0].syncState).toBe('synced');
  });

  it('los totales no cambian de forma inexplicable al sincronizar', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    server.state.online = false;
    await d.finance.createMovement(movementInput({ amount: 2000 }));
    await d.finance.createMovement(movementInput({ amount: 1500, type: 'expense' }));
    const before = summarize(await d.repos.movements.list());

    server.state.online = true;
    await d.sync.run();
    const after = summarize(await d.repos.movements.list());
    expect(after).toEqual(before);
  });
});

describe('borrados: no se resucitan registros', () => {
  it('crear y eliminar sin conexión no deja el registro en el servidor', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    server.state.online = false;
    const m = await d.finance.createMovement(movementInput());
    await d.finance.deleteMovement(m.id);
    server.state.online = true;

    await d.sync.run();
    expect(server.count('movement')).toBe(0);
    expect(await d.repos.movements.list()).toHaveLength(0);
  });

  it('un registro eliminado en otro dispositivo se borra aquí y no vuelve', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const m = await d.finance.createMovement(movementInput());
    await d.sync.run();

    server.remoteDelete('movement', m.id);
    await d.sync.run();
    expect(await d.repos.movements.list()).toHaveLength(0);
    await d.sync.run();
    expect(await d.repos.movements.list()).toHaveLength(0);
  });

  it('si lo edito sin conexión y alguien lo borró, el borrado gana (no se revive)', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const m = await d.finance.createMovement(movementInput());
    await d.sync.run();

    server.state.online = false;
    await d.finance.updateMovement(m.id, movementInput({ amount: 7777 }));
    server.remoteDelete('movement', m.id);
    server.state.online = true;

    await d.sync.run();
    expect(server.count('movement')).toBe(0);
    expect(await d.repos.movements.list()).toHaveLength(0);
    expect(await d.repos.outbox.count()).toBe(0);
  });

  it('eliminar una categoría elimina sus movimientos y los totales se recalculan', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const other = await d.finance.createCategory({ name: 'Comida', type: 'expense', monthlyBudget: null });
    await d.finance.createMovement(movementInput({ categoryId: d.cat.id, amount: 1000 }));
    await d.finance.createMovement(movementInput({ categoryId: other.id, amount: 5000 }));
    await d.sync.run();

    server.state.online = false;
    expect(await d.finance.countMovementsOfCategory(d.cat.id)).toBe(1);
    const res = await d.finance.deleteCategory(d.cat.id);
    expect(res.movementsDeleted).toBe(1);
    expect(summarize(await d.repos.movements.list()).expense).toBe(5000);

    server.state.online = true;
    await d.sync.run();
    expect(server.count('category')).toBe(1);
    expect(server.count('movement')).toBe(1);
  });

  it('eliminar una meta conserva sus aportes como gastos normales', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const goal = await d.finance.createGoal({ name: 'Portátil', targetAmount: 100000, deadline: '2027-03-01' });
    await d.finance.createMovement(movementInput({ categoryId: d.cat.id, goalId: goal.id, amount: 20000 }));
    await d.sync.run();

    const res = await d.finance.deleteGoal(goal.id);
    expect(res.unlinked).toBe(1);
    await d.sync.run();
    expect(server.count('goal')).toBe(0);
    const [aporte] = await d.repos.movements.list();
    expect(aporte).toMatchObject({ goalId: null, amount: 20000, syncState: 'synced' });
    expect(server.store.movement.get(aporte.id)).toMatchObject({ goalId: null });
  });
});

describe('orden de envío y dependencias', () => {
  it('una categoría creada sin conexión llega ANTES que sus movimientos', async () => {
    const server = createFakeServer();
    const d = await openDevice(server);
    server.state.online = false;
    const cat = await d.finance.createCategory({ name: 'Nueva', type: 'expense', monthlyBudget: null });
    await d.finance.createMovement(movementInput({ categoryId: cat.id }));
    // Se edita la categoría DESPUÉS de crear el movimiento: su entrada no debe quedar detrás.
    await d.finance.updateCategory(cat.id, { name: 'Nueva editada', type: 'expense', monthlyBudget: 5000 });
    server.state.online = true;

    const result = await d.sync.run();
    expect(result.conflicts).toBe(0);
    expect(server.count('category')).toBe(1);
    expect(server.count('movement')).toBe(1);
  });
});

describe('conflictos: gana el servidor', () => {
  it('una edición más vieja que la del servidor se descarta y se adopta la del servidor', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const m = await d.finance.createMovement(movementInput({ amount: 1000 }));
    await d.sync.run();

    // Otro dispositivo editó DESPUÉS (clientUpdatedAt más reciente) y ya llegó al servidor.
    server.seed('movement', {
      ...server.store.movement.get(m.id)!,
      amount: 5555,
      clientUpdatedAt: T(900).toISOString(),
    });
    // Este teléfono editó antes, sin conexión.
    server.state.online = false;
    d.clock.minutes = 100;
    await d.finance.updateMovement(m.id, movementInput({ amount: 2222 }));
    server.state.online = true;

    const result = await d.sync.run();
    expect(result.serverWon).toBe(1);
    expect((await d.repos.movements.list())[0]).toMatchObject({ amount: 5555, syncState: 'synced' });
    expect(server.store.movement.get(m.id)).toMatchObject({ amount: 5555 });
  });

  it('una edición más reciente que la del servidor se aplica', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const m = await d.finance.createMovement(movementInput({ amount: 1000 }));
    await d.sync.run();
    d.clock.minutes = 500;
    await d.finance.updateMovement(m.id, movementInput({ amount: 3333 }));
    await d.sync.run();
    expect(server.store.movement.get(m.id)).toMatchObject({ amount: 3333 });
  });

  it('un movimiento cuya categoría fue eliminada en otro dispositivo queda en conflicto con explicación', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    server.state.online = false;
    const m = await d.finance.createMovement(movementInput({ amount: 4000 }));
    server.remoteDelete('category', d.cat.id);
    server.state.online = true;

    const result = await d.sync.run();
    expect(result.conflicts).toBe(1);
    const [row] = await d.repos.movements.list();
    expect(row).toMatchObject({ id: m.id, syncState: 'conflict' });
    expect(row.syncError).toMatch(/ya no existe/);
    expect(await d.repos.outbox.count()).toBe(0); // no bloquea la cola
    expect(summarize(countable([row])).expense).toBe(0); // no cuenta en los totales
  });

  it('un conflicto no bloquea el envío de los demás registros', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const bad = await d.finance.createMovement(movementInput({ categoryId: 'categoria-fantasma' }));
    await d.finance.createMovement(movementInput({ amount: 777 }));
    const result = await d.sync.run();
    expect(result).toMatchObject({ pushed: 1, conflicts: 1 });
    expect(server.count('movement')).toBe(1);
    expect((await d.repos.movements.getById(bad.id))?.syncState).toBe('conflict');
  });

  it('descartar un conflicto de un registro nuevo lo elimina; reintentar lo vuelve a encolar', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const bad = await d.finance.createMovement(movementInput({ categoryId: 'categoria-fantasma' }));
    await d.sync.run();

    await d.finance.retryConflict('movement', bad.id);
    expect(await d.repos.outbox.count()).toBe(1);
    expect((await d.repos.movements.getById(bad.id))?.syncState).toBe('pending');
    await d.sync.run(); // vuelve a fallar
    expect((await d.repos.movements.getById(bad.id))?.syncState).toBe('conflict');

    await d.finance.discardConflict('movement', bad.id);
    expect(await d.repos.movements.getById(bad.id)).toBeNull();
  });

  it('lo local pendiente NO se pisa al descargar del servidor', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const m = await d.finance.createMovement(movementInput({ amount: 1000 }));
    await d.sync.run();

    server.state.online = false;
    await d.finance.updateMovement(m.id, movementInput({ amount: 8888 }));
    // Un registro nuevo del servidor sí se descarga, el pendiente se conserva:
    const applied = await d.repos.movements.applyServerMany([
      { ...(server.store.movement.get(m.id) as Record<string, unknown>), amount: 1 } as never,
    ]);
    expect(applied).toBe(0);
    expect((await d.repos.movements.getById(m.id))?.amount).toBe(8888);
  });
});

describe('fallos del servidor y reintentos', () => {
  it('un error 500 conserva el registro en la cola y se reintenta', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    await d.finance.createMovement(movementInput());
    server.state.failNext = 1;
    await expect(d.sync.run()).rejects.toBeInstanceOf(ApiRequestError);
    const [item] = await d.repos.outbox.pending();
    expect(item).toMatchObject({ attempts: 1 });
    expect(item.lastError).toBeTruthy();
    expect((await d.repos.movements.list())[0].syncState).toBe('pending');

    await d.sync.run();
    expect(server.count('movement')).toBe(1);
    expect(await d.repos.outbox.count()).toBe(0);
  });

  it('tras demasiados fallos se informa como conflicto sin perder el registro', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    const m = await d.finance.createMovement(movementInput());
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      server.state.failNext = 1;
      await d.sync.run().catch(() => {});
    }
    const row = await d.repos.movements.getById(m.id);
    expect(row).toMatchObject({ syncState: 'conflict' });
    expect(row?.syncError).toBeTruthy();
  });
});

describe('sincronización incremental', () => {
  it('descarga lo nuevo del servidor y solo pide cambios desde el cursor', async () => {
    const server = createFakeServer();
    const d = await deviceWithCategory(server);
    server.seed('movement', {
      id: 'remote-0001', amount: 1200, type: 'expense', categoryId: d.cat.id, goalId: null,
      date: '2026-10-11', note: 'otro teléfono', createdAt: T(0).toISOString(), clientUpdatedAt: T(0).toISOString(),
    });
    const first = await d.sync.run();
    expect(first.pulled).toBeGreaterThanOrEqual(2); // categoría + movimiento remoto
    expect(await d.repos.movements.list()).toHaveLength(1);
    expect(await d.repos.meta.get('cursor.movement')).toBeTruthy();
    expect(await d.sync.lastSyncAt()).toBe(T(1000).toISOString());
  });
});
