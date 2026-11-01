/**
 * Metas de ahorro. El estado de una meta NO se guarda: se CALCULA cada vez a partir de lo ahorrado
 * y de la fecha de hoy del dispositivo. Por eso una meta pasa de "activa" a "vencida" aunque la app
 * lleve una semana sin abrirse y aunque no haya conexión: al abrirla se recalcula con los datos locales.
 *
 *   ahorrado ≥ objetivo ........................ cumplida
 *   si no, fecha límite anterior a hoy ......... vencida
 *   si no ...................................... activa
 *
 * (Una meta vencida que luego se completa pasa a cumplida: el ahorro alcanzado es lo que cuenta.)
 */
import { percentOf } from './money';
import { daysBetween } from './periods';
import type { MovementLike } from './summary';
import type { Goal } from '@/types';

export type GoalStatus = 'active' | 'completed' | 'expired';

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Activa',
  completed: 'Cumplida',
  expired: 'Vencida',
};

/** Los aportes de una meta son los movimientos de gasto que apuntan a ella. */
export function savedForGoal(goalId: string, movements: MovementLike[]): number {
  let saved = 0;
  for (const m of movements) {
    if (m.goalId === goalId && m.type === 'expense') saved += m.amount;
  }
  return saved;
}

export function goalStatus(
  goal: Pick<Goal, 'targetAmount' | 'deadline'>,
  saved: number,
  today: string,
): GoalStatus {
  if (saved >= goal.targetAmount) return 'completed';
  if (goal.deadline < today) return 'expired';
  return 'active';
}

export interface GoalProgress {
  saved: number;
  target: number;
  /** 0–100 (recortado) para la barra de progreso. */
  percent: number;
  remaining: number;
  status: GoalStatus;
  /** Días hasta la fecha límite; negativo si ya pasó, 0 si vence hoy. */
  daysLeft: number;
  /** Cuánto habría que ahorrar por día para llegar (solo metas activas). */
  dailyNeeded: number | null;
}

export function goalProgress(
  goal: Pick<Goal, 'id' | 'targetAmount' | 'deadline'>,
  movements: MovementLike[],
  today: string,
): GoalProgress {
  const saved = savedForGoal(goal.id, movements);
  const status = goalStatus(goal, saved, today);
  const remaining = Math.max(0, goal.targetAmount - saved);
  const daysLeft = daysBetween(today, goal.deadline);
  return {
    saved,
    target: goal.targetAmount,
    percent: percentOf(saved, goal.targetAmount),
    remaining,
    status,
    daysLeft,
    dailyNeeded: status === 'active' ? Math.ceil(remaining / Math.max(1, daysLeft)) : null,
  };
}

/** "vence hoy", "vence mañana", "faltan 12 días", "venció hace 3 días". */
export function deadlineText(daysLeft: number): string {
  if (daysLeft === 0) return 'vence hoy';
  if (daysLeft === 1) return 'vence mañana';
  if (daysLeft > 1) return `faltan ${daysLeft} días`;
  if (daysLeft === -1) return 'venció ayer';
  return `venció hace ${-daysLeft} días`;
}
