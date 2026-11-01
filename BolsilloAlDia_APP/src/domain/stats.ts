/**
 * Estadísticas del panel: cumplimiento de presupuesto, distribución del gasto y evolución del saldo.
 * Todo se calcula en el dispositivo con los datos locales.
 */
import { dayjs, DATE_FORMAT } from '@/lib/dayjs';
import { percentOf } from './money';
import { daysInMonth, inPeriod, type Period } from './periods';
import { summarize, type MovementLike } from './summary';
import type { Category } from '@/types';

export interface BudgetItem {
  categoryId: string;
  name: string;
  spent: number;
  budget: number;
  ok: boolean;
}

export interface Compliance {
  items: BudgetItem[];
  /** Categorías con presupuesto evaluadas. */
  evaluated: number;
  withinBudget: number;
  /** % de categorías que respetaron su presupuesto; null si ninguna tiene presupuesto. */
  percent: number | null;
}

/**
 * Cumplimiento de presupuesto del periodo:
 *   cumplimiento = categorías con gasto ≤ presupuesto ÷ categorías con presupuesto.
 * El presupuesto es mensual; para una semana se prorratea: presupuesto × 7 ÷ días del mes.
 */
export function budgetCompliance(
  categories: Pick<Category, 'id' | 'name' | 'type' | 'monthlyBudget'>[],
  movements: MovementLike[],
  period: Period,
): Compliance {
  const spentBy = new Map<string, number>();
  for (const m of movements) {
    if (m.type === 'expense' && inPeriod(m.date, period)) {
      spentBy.set(m.categoryId, (spentBy.get(m.categoryId) ?? 0) + m.amount);
    }
  }
  const items: BudgetItem[] = [];
  for (const c of categories) {
    if (c.type !== 'expense' || !c.monthlyBudget) continue;
    const budget =
      period.kind === 'week'
        ? Math.round((c.monthlyBudget * 7) / daysInMonth(period.start))
        : c.monthlyBudget;
    const spent = spentBy.get(c.id) ?? 0;
    items.push({ categoryId: c.id, name: c.name, spent, budget, ok: spent <= budget });
  }
  items.sort((a, b) => Number(a.ok) - Number(b.ok) || b.spent / b.budget - a.spent / a.budget);
  const withinBudget = items.filter((i) => i.ok).length;
  return {
    items,
    evaluated: items.length,
    withinBudget,
    percent: items.length === 0 ? null : percentOf(withinBudget, items.length),
  };
}

export type SeriesStep = 'day' | 'month';

export interface SeriesPoint {
  /** Inicio del tramo (AAAA-MM-DD). */
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  /** Saldo acumulado al final del tramo (incluye todo lo anterior al periodo). */
  balance: number;
}

/**
 * Evolución del saldo: un punto por día (semana o mes) o por mes (año).
 * El saldo es acumulado e incluye lo ocurrido antes del periodo (saldo inicial).
 */
export function balanceEvolution(
  movements: MovementLike[],
  period: Period,
  step: SeriesStep,
): SeriesPoint[] {
  if (period.kind === 'all') return [];
  const opening = summarize(movements.filter((m) => m.date < period.start)).balance;
  const points: SeriesPoint[] = [];
  let running = opening;
  let cursor = dayjs(period.start);
  const end = dayjs(period.end);
  while (!cursor.isAfter(end, 'day')) {
    const from = cursor.format(DATE_FORMAT);
    const to = step === 'day' ? from : cursor.endOf('month').format(DATE_FORMAT);
    const inside = movements.filter((m) => m.date >= from && m.date <= to);
    const s = summarize(inside);
    running += s.balance;
    points.push({
      key: from,
      label: step === 'day' ? cursor.format('D') : cursor.format('MMM'),
      income: s.income,
      expense: s.expense,
      net: s.balance,
      balance: running,
    });
    cursor = step === 'day' ? cursor.add(1, 'day') : cursor.add(1, 'month').startOf('month');
  }
  return points;
}
