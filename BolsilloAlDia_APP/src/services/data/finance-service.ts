/**
 * Escrituras "local primero" (offline-first). Cada operación:
 *   1) guarda el cambio en SQLite  2) lo anota en la cola (outbox)  — las dos en UNA transacción,
 * así que nunca queda un cambio sin su entrada en la cola ni al revés, aunque la app se cierre.
 * No espera a la red: el envío lo hace la sincronización (services/sync).
 *
 * Todas las ediciones y eliminaciones funcionan igual con o sin conexión, y los totales
 * (domain/summary.ts) se recalculan de inmediato porque leen de SQLite.
 */
import type { Repositories } from '@/db/repositories';
import type { CategoryValue, GoalValue, MovementValue } from '@/domain/validation';
import type { Category, EntityKind, Goal, Movement } from '@/types';

export class NotFoundLocalError extends Error {
  constructor(what: string) {
    super(`${what} ya no existe`);
    this.name = 'NotFoundLocalError';
  }
}

interface Deps {
  repos: Repositories;
  /** Genera el identificador estable del registro (UUID). Es la llave de idempotencia al sincronizar. */
  newId: () => string;
  now?: () => Date;
}

/** Clave del cursor de cada entidad en sync_meta (también la usa el servicio de sincronización). */
export const cursorKey = (kind: EntityKind) => `cursor.${kind}`;

export function createFinanceService({ repos, newId, now = () => new Date() }: Deps) {
  const { db, categories, goals, movements, outbox, activity } = repos;

  /** Ejecuta varias escrituras como una sola unidad: o se guardan todas o ninguna. */
  const atomic = (work: () => Promise<void>) => db.withTransactionAsync(work);

  const pendingMeta = (ts: string) => ({
    clientUpdatedAt: ts,
    syncState: 'pending' as const,
    syncError: null,
  });

  return {
    // ───────────── Movimientos ─────────────
    async createMovement(input: MovementValue): Promise<Movement> {
      const ts = now().toISOString();
      const movement: Movement = {
        id: newId(),
        ...input,
        createdAt: ts,
        serverUpdatedAt: null,
        ...pendingMeta(ts),
      };
      await atomic(async () => {
        await movements.saveLocal(movement);
        await outbox.enqueue('movement', movement.id, 'upsert');
        await activity.log('movement.create', `Movimiento registrado (${input.type})`);
      });
      return movement;
    },

    async updateMovement(id: string, input: MovementValue): Promise<Movement> {
      const current = await movements.getById(id);
      if (!current) throw new NotFoundLocalError('El movimiento');
      const updated: Movement = { ...current, ...input, ...pendingMeta(now().toISOString()) };
      await atomic(async () => {
        await movements.saveLocal(updated);
        await outbox.enqueue('movement', id, 'upsert');
        await activity.log('movement.update', 'Movimiento editado');
      });
      return updated;
    },

    async deleteMovement(id: string): Promise<void> {
      await atomic(async () => {
        await movements.remove(id);
        await outbox.removeFor('movement', id, 'upsert'); // ya no hay nada que crear ni editar
        await outbox.enqueue('movement', id, 'delete');
        await activity.log('movement.delete', 'Movimiento eliminado');
      });
    },

    // ───────────── Categorías ─────────────
    async createCategory(input: CategoryValue): Promise<Category> {
      const ts = now().toISOString();
      const category: Category = {
        id: newId(),
        ...input,
        createdAt: ts,
        serverUpdatedAt: null,
        ...pendingMeta(ts),
      };
      await atomic(async () => {
        await categories.saveLocal(category);
        await outbox.enqueue('category', category.id, 'upsert');
        await activity.log('category.create', `Categoría "${input.name}" creada`);
      });
      return category;
    },

    async updateCategory(id: string, input: CategoryValue): Promise<Category> {
      const current = await categories.getById(id);
      if (!current) throw new NotFoundLocalError('La categoría');
      const updated: Category = { ...current, ...input, ...pendingMeta(now().toISOString()) };
      await atomic(async () => {
        await categories.saveLocal(updated);
        await outbox.enqueue('category', id, 'upsert');
        await activity.log('category.update', `Categoría "${input.name}" editada`);
      });
      return updated;
    },

    /** Cuántos movimientos perderían su categoría (para avisar antes de confirmar). */
    async countMovementsOfCategory(categoryId: string): Promise<number> {
      return (await movements.list()).filter((m) => m.categoryId === categoryId).length;
    },

    /**
     * Elimina la categoría Y sus movimientos (el usuario lo confirma antes). Un movimiento no puede
     * existir sin categoría, y los totales se recalculan sin ellos.
     */
    async deleteCategory(id: string): Promise<{ movementsDeleted: number }> {
      const owned = (await movements.list()).filter((m) => m.categoryId === id);
      await atomic(async () => {
        for (const m of owned) {
          await movements.remove(m.id);
          await outbox.removeFor('movement', m.id, 'upsert');
          await outbox.enqueue('movement', m.id, 'delete');
        }
        await categories.remove(id);
        await outbox.removeFor('category', id, 'upsert');
        await outbox.enqueue('category', id, 'delete');
        await activity.log('category.delete', `Categoría eliminada con ${owned.length} movimientos`);
      });
      return { movementsDeleted: owned.length };
    },

    // ───────────── Metas ─────────────
    async createGoal(input: GoalValue): Promise<Goal> {
      const ts = now().toISOString();
      const goal: Goal = {
        id: newId(),
        ...input,
        createdAt: ts,
        serverUpdatedAt: null,
        ...pendingMeta(ts),
      };
      await atomic(async () => {
        await goals.saveLocal(goal);
        await outbox.enqueue('goal', goal.id, 'upsert');
        await activity.log('goal.create', `Meta "${input.name}" creada`);
      });
      return goal;
    },

    async updateGoal(id: string, input: GoalValue): Promise<Goal> {
      const current = await goals.getById(id);
      if (!current) throw new NotFoundLocalError('La meta');
      const updated: Goal = { ...current, ...input, ...pendingMeta(now().toISOString()) };
      await atomic(async () => {
        await goals.saveLocal(updated);
        await outbox.enqueue('goal', id, 'upsert');
        await activity.log('goal.update', `Meta "${input.name}" editada`);
      });
      return updated;
    },

    /**
     * Elimina la meta. Sus aportes se conservan como gastos normales (el dinero ya salió):
     * solo pierden el vínculo con la meta.
     */
    async deleteGoal(id: string): Promise<{ unlinked: number }> {
      const linked = (await movements.list()).filter((m) => m.goalId === id);
      const ts = now().toISOString();
      await atomic(async () => {
        for (const m of linked) {
          await movements.saveLocal({ ...m, goalId: null, ...pendingMeta(ts) });
          await outbox.enqueue('movement', m.id, 'upsert');
        }
        await goals.remove(id);
        await outbox.removeFor('goal', id, 'upsert');
        await outbox.enqueue('goal', id, 'delete');
        await activity.log('goal.delete', `Meta eliminada; ${linked.length} aportes desvinculados`);
      });
      return { unlinked: linked.length };
    },

    // ───────────── Conflictos de sincronización ─────────────
    /** Vuelve a intentar enviar un registro que el servidor rechazó (con su contenido actual). */
    async retryConflict(kind: EntityKind, id: string): Promise<void> {
      const repo = repos.entity(kind);
      const current = await repo.getById(id);
      if (!current) return;
      await atomic(async () => {
        await repo.saveLocal({ ...current, ...pendingMeta(now().toISOString()) } as never);
        await outbox.enqueue(kind, id, 'upsert');
      });
    },

    /**
     * Descarta los cambios locales rechazados. Si el registro nunca llegó al servidor se borra;
     * si ya existía allá, se reinicia el cursor para que la próxima sincronización traiga la versión del servidor.
     */
    async discardConflict(kind: EntityKind, id: string): Promise<void> {
      const repo = repos.entity(kind);
      const current = await repo.getById(id);
      if (!current) return;
      await atomic(async () => {
        if (current.serverUpdatedAt === null) await repo.remove(id);
        else await repos.meta.delete(cursorKey(kind));
        await outbox.removeFor(kind, id);
        await activity.log('sync.discard', 'Cambio rechazado descartado');
      });
    },
  };
}

export type FinanceService = ReturnType<typeof createFinanceService>;
