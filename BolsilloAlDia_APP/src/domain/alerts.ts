/**
 * Alertas informativas dentro de la app (no son notificaciones push). Se calculan con datos locales
 * cada vez que se abre la pantalla, así que también funcionan sin conexión.
 *
 * Reglas (documentadas en el README):
 *  - Meta próxima a vencer: activa y le faltan 7 días o menos.
 *  - Meta cumplida: lo ahorrado alcanzó el objetivo.
 *  - Meta vencida: pasó la fecha límite sin alcanzar el objetivo.
 *  - Presupuesto superado: en el mes en curso, el gasto de la categoría supera su presupuesto mensual.
 *  - Presupuesto en riesgo: ya se usó el 80 % o más (sin superarlo).
 *  - Sincronización: cambios pendientes, último intento con error, o registros en conflicto.
 */
import { goalProgress, deadlineText } from './goals';
import { formatCOP } from './money';
import { periodFor, inPeriod } from './periods';
import type { MovementLike } from './summary';
import type { Category, Goal } from '@/types';

export type AlertKind =
  | 'goal_due_soon'
  | 'goal_completed'
  | 'goal_expired'
  | 'budget_exceeded'
  | 'budget_near'
  | 'sync_pending'
  | 'sync_error'
  | 'sync_conflict';

export type AlertSeverity = 'danger' | 'warning' | 'info' | 'success';

export interface AppAlert {
  /** Estable entre cálculos: `${tipo}:${id de la entidad}`. */
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** Ruta a la que lleva la alerta al tocarla. */
  target?: { pathname: string; params?: Record<string, string> };
}

export const DUE_SOON_DAYS = 7;
export const BUDGET_NEAR_RATIO = 0.8;

export interface SyncInfo {
  online: boolean;
  pendingCount: number;
  conflictCount: number;
  lastError: string | null;
}

export interface AlertInput {
  goals: Pick<Goal, 'id' | 'name' | 'targetAmount' | 'deadline'>[];
  categories: Pick<Category, 'id' | 'name' | 'type' | 'monthlyBudget'>[];
  /** Solo movimientos contables (sin los que están en conflicto). */
  movements: MovementLike[];
  today: string;
  sync: SyncInfo;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2, success: 3 };

export function buildAlerts({ goals, categories, movements, today, sync }: AlertInput): AppAlert[] {
  const alerts: AppAlert[] = [];

  for (const goal of goals) {
    const p = goalProgress(goal, movements, today);
    const target = { pathname: '/goal/[id]', params: { id: goal.id } };
    if (p.status === 'completed') {
      alerts.push({
        id: `goal_completed:${goal.id}`,
        kind: 'goal_completed',
        severity: 'success',
        title: `¡Meta cumplida: ${goal.name}!`,
        message: `Ahorraste ${formatCOP(p.saved)} de ${formatCOP(p.target)}.`,
        target,
      });
    } else if (p.status === 'expired') {
      alerts.push({
        id: `goal_expired:${goal.id}`,
        kind: 'goal_expired',
        severity: 'danger',
        title: `Meta vencida: ${goal.name}`,
        message: `${deadlineText(p.daysLeft)[0].toUpperCase()}${deadlineText(p.daysLeft).slice(1)}. Llevabas ${p.percent} % (${formatCOP(p.saved)}).`,
        target,
      });
    } else if (p.daysLeft <= DUE_SOON_DAYS) {
      alerts.push({
        id: `goal_due_soon:${goal.id}`,
        kind: 'goal_due_soon',
        severity: 'warning',
        title: `Meta por vencer: ${goal.name}`,
        message: `${deadlineText(p.daysLeft)[0].toUpperCase()}${deadlineText(p.daysLeft).slice(1)}. Te faltan ${formatCOP(p.remaining)} (llevas ${p.percent} %).`,
        target,
      });
    }
  }

  const month = periodFor('month', today);
  const spentByCategory = new Map<string, number>();
  for (const m of movements) {
    if (m.type === 'expense' && inPeriod(m.date, month)) {
      spentByCategory.set(m.categoryId, (spentByCategory.get(m.categoryId) ?? 0) + m.amount);
    }
  }
  for (const c of categories) {
    if (c.type !== 'expense' || !c.monthlyBudget) continue;
    const spent = spentByCategory.get(c.id) ?? 0;
    const target = { pathname: '/category/[id]', params: { id: c.id } };
    if (spent > c.monthlyBudget) {
      alerts.push({
        id: `budget_exceeded:${c.id}`,
        kind: 'budget_exceeded',
        severity: 'danger',
        title: `Presupuesto superado: ${c.name}`,
        message: `Este mes llevas ${formatCOP(spent)} y el presupuesto es ${formatCOP(c.monthlyBudget)} (te pasaste ${formatCOP(spent - c.monthlyBudget)}).`,
        target,
      });
    } else if (spent >= c.monthlyBudget * BUDGET_NEAR_RATIO) {
      alerts.push({
        id: `budget_near:${c.id}`,
        kind: 'budget_near',
        severity: 'warning',
        title: `Presupuesto casi agotado: ${c.name}`,
        message: `Llevas ${formatCOP(spent)} de ${formatCOP(c.monthlyBudget)} este mes.`,
        target,
      });
    }
  }

  if (sync.conflictCount > 0) {
    alerts.push({
      id: 'sync_conflict:all',
      kind: 'sync_conflict',
      severity: 'danger',
      title: 'Registros que no se pudieron sincronizar',
      message: `${sync.conflictCount} ${sync.conflictCount === 1 ? 'registro fue rechazado' : 'registros fueron rechazados'} por el servidor y no cuentan en los totales. Revísalos en Sincronización.`,
      target: { pathname: '/sync' },
    });
  }
  if (sync.lastError && sync.online) {
    alerts.push({
      id: 'sync_error:all',
      kind: 'sync_error',
      severity: 'warning',
      title: 'La última sincronización falló',
      message: `${sync.lastError} Tus datos siguen guardados en el teléfono y se reintentará.`,
      target: { pathname: '/sync' },
    });
  }
  if (sync.pendingCount > 0) {
    alerts.push({
      id: 'sync_pending:all',
      kind: 'sync_pending',
      severity: 'info',
      title: sync.online ? 'Cambios por enviar' : 'Cambios guardados sin conexión',
      message: sync.online
        ? `${sync.pendingCount} ${sync.pendingCount === 1 ? 'cambio espera' : 'cambios esperan'} a ser enviados al servidor.`
        : `${sync.pendingCount} ${sync.pendingCount === 1 ? 'cambio se enviará' : 'cambios se enviarán'} cuando vuelva la conexión.`,
      target: { pathname: '/sync' },
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
