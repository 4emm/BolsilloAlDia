/**
 * Fechas y periodos. Las fechas de los movimientos son texto AAAA-MM-DD en hora LOCAL del usuario:
 * así "el gasto de hoy" cae en el día correcto sin importar la zona horaria ni la hora UTC.
 */
import { DATE_FORMAT, dayjs } from '@/lib/dayjs';

export type PeriodKind = 'week' | 'month' | 'year' | 'all' | 'custom';

export interface Period {
  kind: PeriodKind;
  /** Primer día (inclusive) AAAA-MM-DD. */
  start: string;
  /** Último día (inclusive) AAAA-MM-DD. */
  end: string;
}

export const ALL_TIME: Period = { kind: 'all', start: '0000-01-01', end: '9999-12-31' };

/** Hoy en hora local. `now` se inyecta en las pruebas. */
export function todayLocal(now: Date = new Date()): string {
  return dayjs(now).format(DATE_FORMAT);
}

/** true solo para fechas reales con formato AAAA-MM-DD ("2026-02-31" no lo es). */
export function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value, DATE_FORMAT, true).isValid();
}

export function addDays(date: string, n: number): string {
  return dayjs(date).add(n, 'day').format(DATE_FORMAT);
}

export function addMonths(date: string, n: number): string {
  return dayjs(date).add(n, 'month').format(DATE_FORMAT);
}

/** Días de `from` a `to` (negativo si `to` ya pasó). */
export function daysBetween(from: string, to: string): number {
  return dayjs(to).startOf('day').diff(dayjs(from).startOf('day'), 'day');
}

export function daysInMonth(date: string): number {
  return dayjs(date).daysInMonth();
}

/**
 * Periodo (semana de lunes a domingo, mes o año) que contiene `ref`.
 * `custom` es un rango libre elegido por el usuario; por defecto, los últimos 30 días hasta `ref`.
 */
export function periodFor(kind: PeriodKind, ref: string): Period {
  if (kind === 'all') return ALL_TIME;
  if (kind === 'custom') return { kind, start: addDays(ref, -29), end: ref };
  const d = dayjs(ref);
  if (kind === 'week') {
    return {
      kind,
      start: d.startOf('isoWeek').format(DATE_FORMAT),
      end: d.endOf('isoWeek').format(DATE_FORMAT),
    };
  }
  const unit = kind === 'month' ? 'month' : 'year';
  return { kind, start: d.startOf(unit).format(DATE_FORMAT), end: d.endOf(unit).format(DATE_FORMAT) };
}

/** Periodo anterior (-1) o siguiente (+1) del mismo tipo. */
export function shiftPeriod(period: Period, delta: number): Period {
  if (period.kind === 'all' || period.kind === 'custom') return period;
  const unit = period.kind === 'week' ? 'week' : period.kind === 'month' ? 'month' : 'year';
  return periodFor(period.kind, dayjs(period.start).add(delta, unit).format(DATE_FORMAT));
}

export function inPeriod(date: string, period: Period): boolean {
  return date >= period.start && date <= period.end;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Octubre 2026", "12–18 oct 2026", "2026", "Todo el historial". */
export function periodLabel(period: Period): string {
  switch (period.kind) {
    case 'all':
      return 'Todo el historial';
    case 'custom':
      return `${dayjs(period.start).format('D MMM YYYY')} – ${dayjs(period.end).format('D MMM YYYY')}`;
    case 'year':
      return dayjs(period.start).format('YYYY');
    case 'month':
      return capitalize(dayjs(period.start).format('MMMM YYYY'));
    case 'week': {
      const s = dayjs(period.start);
      const e = dayjs(period.end);
      return s.month() === e.month()
        ? `${s.format('D')}–${e.format('D MMM YYYY')}`
        : `${s.format('D MMM')} – ${e.format('D MMM YYYY')}`;
    }
  }
}

/** "lunes 12 de octubre" para encabezados de día. */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy';
  if (date === addDays(today, -1)) return 'Ayer';
  return capitalize(dayjs(date).format('dddd D [de] MMMM'));
}

/** "12 oct 2026" */
export function shortDate(date: string): string {
  return dayjs(date).format('D MMM YYYY');
}
