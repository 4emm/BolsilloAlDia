/**
 * Prueba de integración: la app REAL (SQLite + cola + sincronización) contra la API REAL y Firebase
 * (o los emuladores). Comprueba que lo que envía la app coincide con lo que valida la API.
 *
 * No corre en `npm test` normal. Para ejecutarla:
 *   1) en BolsilloAlDia_API:  npm run emulators   y   npm run dev
 *   2) aquí:                  E2E_API_URL=http://localhost:3000 npm test -- e2e-api
 *      (PowerShell:           $env:E2E_API_URL="http://localhost:3000"; npm test -- e2e-api)
 */
import { migrateDbIfNeeded } from '@/db/migrations';
import { createRepositories } from '@/db/repositories';
import { summarize } from '@/domain/summary';
import { createApiClient } from '@/services/api/client';
import { createFinanceService } from '@/services/data/finance-service';
import { createSyncService } from '@/services/sync/sync-service';
import type { AuthResult } from '@/types';
import { randomUUID } from 'node:crypto';
import { nodeFetch } from '../test-utils/node-fetch';
import { createTestDb } from '../test-utils/node-sqlite';

const BASE = process.env.E2E_API_URL;
const suite = BASE ? describe : describe.skip;

suite('app real ⇄ API real', () => {
  const publicApi = createApiClient({ baseUrl: BASE ?? '', timeoutMs: 15_000, fetchImpl: nodeFetch });
  let token = '';
  const api = createApiClient({
    baseUrl: BASE ?? '',
    timeoutMs: 15_000,
    fetchImpl: nodeFetch,
    auth: { getAccessToken: async () => token, refreshSession: async () => false },
  });

  async function phone() {
    const db = createTestDb();
    await migrateDbIfNeeded(db);
    const repos = createRepositories(db);
    return {
      repos,
      finance: createFinanceService({ repos, newId: randomUUID }),
      sync: createSyncService({ api, repos }),
    };
  }

  beforeAll(async () => {
    const auth = await publicApi.post<AuthResult>(
      '/api/auth/register',
      { displayName: 'Prueba E2E', email: `e2e-${Date.now()}@example.com`, password: `Aa1-${randomUUID()}` },
      { auth: false },
    );
    token = auth.tokens.idToken;
  }, 30_000);

  it('flujo completo: dos teléfonos, sin duplicados, ediciones y borrados', async () => {
    const a = await phone();

    // 1) Primera sincronización: llegan las 11 categorías iniciales.
    await a.sync.run();
    const cats = await a.repos.categories.list();
    expect(cats).toHaveLength(11);
    const bus = cats.find((c) => c.name === 'Transporte')!;
    const save = cats.find((c) => c.name === 'Ahorro')!;
    const mesada = cats.find((c) => c.name === 'Mesada')!;

    // 2) "Sin conexión": se crean cosas localmente sin sincronizar.
    const goal = await a.finance.createGoal({ name: 'Portátil', targetAmount: 100000, deadline: '2027-06-30' });
    const custom = await a.finance.createCategory({ name: 'Gimnasio', type: 'expense', monthlyBudget: 40000 });
    const base = { goalId: null, date: '2026-10-12', note: '' };
    const m1 = await a.finance.createMovement({ ...base, amount: 2000, type: 'expense', categoryId: bus.id });
    const m2 = await a.finance.createMovement({ ...base, amount: 35000, type: 'expense', categoryId: custom.id });
    const m3 = await a.finance.createMovement({ ...base, amount: 200000, type: 'income', categoryId: mesada.id });
    await a.finance.createMovement({ ...base, amount: 25000, type: 'expense', categoryId: save.id, goalId: goal.id });
    await a.finance.updateMovement(m1.id, { ...base, amount: 2500, type: 'expense', categoryId: bus.id, note: 'editado' });
    expect(await a.repos.outbox.count()).toBe(6);

    // 3) Vuelve la red: se envía todo, varias veces, sin duplicar.
    const first = await a.sync.run();
    expect(first.conflicts).toBe(0);
    await a.sync.run();
    await a.sync.run();
    expect(await a.repos.outbox.count()).toBe(0);
    const serverMovements = await api.get<{ items: { id: string }[] }>('/api/movements');
    expect(serverMovements.items).toHaveLength(4);

    // 4) Un segundo teléfono (instalación nueva) descarga lo mismo y calcula los mismos totales.
    const b = await phone();
    await b.sync.run();
    const onA = summarize(await a.repos.movements.list());
    const onB = summarize(await b.repos.movements.list());
    expect(onB).toEqual(onA);
    expect(onB).toMatchObject({ income: 200000, expense: 2500 + 35000 + 25000 });
    expect((await b.repos.movements.getById(m1.id))?.note).toBe('editado');
    expect(await b.repos.goals.list()).toHaveLength(1);

    // 5) El teléfono A elimina un movimiento; B lo ve desaparecer y no vuelve.
    await a.finance.deleteMovement(m2.id);
    await a.sync.run();
    await b.sync.run();
    expect(await b.repos.movements.getById(m2.id)).toBeNull();
    await b.sync.run();
    expect(await b.repos.movements.list()).toHaveLength(3);

    // 6) Eliminar la categoría con movimientos los elimina también en el servidor.
    await a.finance.deleteCategory(bus.id);
    await a.sync.run();
    await b.sync.run();
    expect(await b.repos.movements.getById(m1.id)).toBeNull();
    expect(await b.repos.categories.getById(bus.id)).toBeNull();
    void m3;
  }, 60_000);

  it('un movimiento con categoría eliminada en otro teléfono queda en conflicto, sin bloquear nada', async () => {
    const a = await phone();
    const b = await phone();
    await a.sync.run();
    await b.sync.run();
    const food = (await a.repos.categories.list()).find((c) => c.name === 'Alimentación')!;

    // B elimina la categoría; A (sin saberlo) registra un gasto en ella.
    await b.finance.deleteCategory(food.id);
    await b.sync.run();
    const bad = await a.finance.createMovement({
      goalId: null, date: '2026-10-12', note: '', amount: 7000, type: 'expense', categoryId: food.id,
    });
    const result = await a.sync.run();

    expect(result.conflicts).toBe(1);
    expect(await a.repos.outbox.count()).toBe(0);
    const row = await a.repos.movements.getById(bad.id);
    expect(row?.syncState).toBe('conflict');
    expect(row?.syncError).toMatch(/ya no existe/);
  }, 60_000);
});
