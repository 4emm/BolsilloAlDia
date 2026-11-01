/**
 * Hooks de lectura derivados. Nada aquí llama a la red: todo sale de SQLite (vía DataProvider)
 * y de las funciones puras de src/domain.
 */
import { useMemo } from 'react';
import { buildAlerts, type AppAlert } from '@/domain/alerts';
import { useData } from '@/providers/data-provider';
import type { Category, Goal } from '@/types';

export function useLookups() {
  const { categories, goals } = useData();
  return useMemo(
    () => ({
      categoryById: new Map<string, Category>(categories.map((c) => [c.id, c])),
      goalById: new Map<string, Goal>(goals.map((g) => [g.id, g])),
    }),
    [categories, goals],
  );
}

/** Alertas informativas del momento: metas, presupuestos y estado de la sincronización. */
export function useAlerts(): AppAlert[] {
  const { categories, goals, countableMovements, today, online, pendingCount, conflictCount, lastError } =
    useData();
  return useMemo(
    () =>
      buildAlerts({
        goals,
        categories,
        movements: countableMovements,
        today,
        sync: { online, pendingCount, conflictCount, lastError },
      }),
    [goals, categories, countableMovements, today, online, pendingCount, conflictCount, lastError],
  );
}
