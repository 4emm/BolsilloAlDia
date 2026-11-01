/**
 * Totales, resúmenes y filtros. TODO se calcula aquí, en el dispositivo, con los datos de SQLite:
 * jamás depende de una consulta al servidor (requisito del reto técnico del proyecto).
 *
 * Son funciones puras: reciben los datos y devuelven el resultado, así se prueban sin app ni red.
 */
import { percentOf } from './money';
import { inPeriod, type Period } from './periods';
import type { Category, Movement, MovementType } from '@/types';

/** Lo mínimo de un movimiento que necesitan los cálculos. */
export type MovementLike = Pick<Movement, 'amount' | 'type' | 'categoryId' | 'goalId' | 'date'>;

/**
 * Los registros en conflicto (el servidor los rechazó) NO cuentan en los totales:
 * así lo que se muestra siempre coincide con lo que está guardado en la nube.
 */
export function countable<T extends { syncState: string }>(items: T[]): T[] {
  return items.filter((i) => i.syncState !== 'conflict');
}

export interface Summary {
  income: number;
  expense: number;
  /** Ingresos − gastos. */
  balance: number;
  count: number;
}

export function summarize(movements: MovementLike[]): Summary {
  let income = 0;
  let expense = 0;
  for (const m of movements) {
    if (m.type === 'income') income += m.amount;
    else expense += m.amount;
  }
  return { income, expense, balance: income - expense, count: movements.length };
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  total: number;
  /** Porcentaje (0–100) del total de ese tipo de movimiento. */
  percent: number;
  count: number;
}

/** Total por categoría para un tipo (gasto o ingreso), de mayor a menor. */
export function totalsByCategory(
  movements: MovementLike[],
  categories: Pick<Category, 'id' | 'name'>[],
  type: MovementType,
): CategoryTotal[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const totals = new Map<string, { total: number; count: number }>();
  let grand = 0;
  for (const m of movements) {
    if (m.type !== type) continue;
    const entry = totals.get(m.categoryId) ?? { total: 0, count: 0 };
    entry.total += m.amount;
    entry.count += 1;
    totals.set(m.categoryId, entry);
    grand += m.amount;
  }
  return [...totals.entries()]
    .map(([categoryId, { total, count }]) => ({
      categoryId,
      name: names.get(categoryId) ?? 'Sin categoría',
      total,
      percent: percentOf(total, grand),
      count,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));
}

export interface MovementFilters {
  period?: Period;
  categoryId?: string | null;
  type?: MovementType | null;
  goalId?: string | null;
  /** Texto libre: se busca en la nota y el nombre de la categoría, sin tildes ni mayúsculas. */
  text?: string;
}

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Aplica los filtros del historial. Un filtro ausente (o null) no restringe. */
export function filterMovements<T extends MovementLike & { note?: string }>(
  movements: T[],
  filters: MovementFilters,
  categories: Pick<Category, 'id' | 'name'>[] = [],
): T[] {
  const names = new Map(categories.map((c) => [c.id, normalizeSearch(c.name)]));
  const text = filters.text ? normalizeSearch(filters.text) : '';
  return movements.filter((m) => {
    if (filters.period && !inPeriod(m.date, filters.period)) return false;
    if (filters.categoryId && m.categoryId !== filters.categoryId) return false;
    if (filters.type && m.type !== filters.type) return false;
    if (filters.goalId && m.goalId !== filters.goalId) return false;
    if (text) {
      const haystack = `${normalizeSearch(m.note ?? '')} ${names.get(m.categoryId) ?? ''}`;
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

export interface DayGroup<T> {
  date: string;
  /** Balance neto del día (ingresos − gastos). */
  net: number;
  items: T[];
}

/** Agrupa por día, del más reciente al más antiguo. Dentro de un día, lo último registrado primero. */
export function groupByDay<T extends MovementLike & { createdAt?: string }>(
  movements: T[],
): DayGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const m of movements) {
    const list = groups.get(m.date);
    if (list) list.push(m);
    else groups.set(m.date, [m]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      net: summarize(items).balance,
      items: [...items].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    }));
}

/** Orden estándar de la lista de movimientos: fecha del movimiento, luego el más reciente en registrarse. */
export function sortMovements<T extends MovementLike & { createdAt?: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  );
}
