import { buildAlerts } from '@/domain/alerts';
import { goalProgress, goalStatus, savedForGoal } from '@/domain/goals';
import { formatAmountInput, formatCOP, formatSigned, parseAmount, percentOf } from '@/domain/money';
import {
  addMonths,
  daysBetween,
  isValidDate,
  periodFor,
  periodLabel,
  shiftPeriod,
} from '@/domain/periods';
import { balanceEvolution, budgetCompliance } from '@/domain/stats';
import {
  countable,
  filterMovements,
  groupByDay,
  summarize,
  totalsByCategory,
  type MovementLike,
} from '@/domain/summary';
import { validateCategory, validateGoal, validateMovement } from '@/domain/validation';

const mov = (over: Partial<MovementLike & { note: string }> = {}): MovementLike & { note: string } => ({
  amount: 1000,
  type: 'expense',
  categoryId: 'c-bus',
  goalId: null,
  date: '2026-10-12',
  note: '',
  ...over,
});

describe('dinero', () => {
  it('formatea pesos con puntos de miles', () => {
    expect(formatCOP(0)).toBe('$ 0');
    expect(formatCOP(12500)).toBe('$ 12.500');
    expect(formatCOP(1234567)).toBe('$ 1.234.567');
    expect(formatCOP(-3000)).toBe('-$ 3.000');
    expect(formatSigned(2000, 'expense')).toBe('-$ 2.000');
    expect(formatSigned(50000, 'income')).toBe('+$ 50.000');
  });

  it('parseAmount acepta separadores y rechaza lo que no es un monto', () => {
    expect(parseAmount('2000')).toBe(2000);
    expect(parseAmount('12.500')).toBe(12500);
    expect(parseAmount(' 1,250,000 ')).toBe(1250000);
    for (const bad of ['', '  ', 'abc', '12a', '-5', '+5', '1e3', '9'.repeat(13)]) {
      expect(parseAmount(bad)).toBeNull();
    }
  });

  it('formatAmountInput agrupa mientras se escribe y quita ceros a la izquierda', () => {
    expect(formatAmountInput('1250')).toBe('1.250');
    expect(formatAmountInput('1.2a5-0')).toBe('1.250');
    expect(formatAmountInput('0007')).toBe('7');
    expect(formatAmountInput('')).toBe('');
  });

  it('percentOf se mantiene entre 0 y 100', () => {
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(300, 200)).toBe(100);
    expect(percentOf(5, 0)).toBe(0);
  });
});

describe('periodos', () => {
  it('la semana va de lunes a domingo', () => {
    // 12 de octubre de 2026 es lunes
    expect(periodFor('week', '2026-10-14')).toEqual({ kind: 'week', start: '2026-10-12', end: '2026-10-18' });
    expect(periodFor('week', '2026-10-18')).toMatchObject({ start: '2026-10-12', end: '2026-10-18' });
  });
  it('mes y año', () => {
    expect(periodFor('month', '2026-02-10')).toEqual({ kind: 'month', start: '2026-02-01', end: '2026-02-28' });
    expect(periodFor('year', '2026-10-10')).toMatchObject({ start: '2026-01-01', end: '2026-12-31' });
  });
  it('shiftPeriod cruza límites de año y de mes', () => {
    expect(shiftPeriod(periodFor('month', '2026-01-15'), -1)).toMatchObject({ start: '2025-12-01', end: '2025-12-31' });
    expect(shiftPeriod(periodFor('week', '2026-10-12'), 1)).toMatchObject({ start: '2026-10-19' });
  });
  it('etiquetas legibles', () => {
    expect(periodLabel(periodFor('month', '2026-10-12'))).toBe('Octubre 2026');
    expect(periodLabel(periodFor('year', '2026-10-12'))).toBe('2026');
  });
  it('rango personalizado: por defecto los últimos 30 días, sin desplazamiento, con etiqueta', () => {
    const range = periodFor('custom', '2026-10-30');
    expect(range).toEqual({ kind: 'custom', start: '2026-10-01', end: '2026-10-30' });
    expect(shiftPeriod(range, 1)).toEqual(range);
    expect(periodLabel({ kind: 'custom', start: '2026-10-05', end: '2026-10-12' })).toBe('5 oct 2026 – 12 oct 2026');
    const data = [mov({ date: '2026-10-04' }), mov({ date: '2026-10-05' }), mov({ date: '2026-10-12' }), mov({ date: '2026-10-13' })];
    const inside = filterMovements(data, { period: { kind: 'custom', start: '2026-10-05', end: '2026-10-12' } });
    expect(inside.map((m) => m.date)).toEqual(['2026-10-05', '2026-10-12']); // ambos extremos incluidos
  });
  it('valida fechas reales', () => {
    expect(isValidDate('2026-10-12')).toBe(true);
    expect(isValidDate('2026-02-31')).toBe(false);
    expect(isValidDate('12/10/2026')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });
  it('aritmética de fechas', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-12', '2026-10-19')).toBe(7);
    expect(daysBetween('2026-10-12', '2026-10-10')).toBe(-2);
  });
});

describe('resumen y totales (todo local)', () => {
  const categories = [
    { id: 'c-bus', name: 'Transporte' },
    { id: 'c-food', name: 'Alimentación' },
    { id: 'c-mesada', name: 'Mesada' },
  ];
  const data = [
    mov({ amount: 2000, categoryId: 'c-bus' }),
    mov({ amount: 3000, categoryId: 'c-bus', date: '2026-10-13' }),
    mov({ amount: 5000, categoryId: 'c-food' }),
    mov({ amount: 100000, type: 'income', categoryId: 'c-mesada', date: '2026-10-01' }),
  ];

  it('suma ingresos, gastos y saldo', () => {
    expect(summarize(data)).toEqual({ income: 100000, expense: 10000, balance: 90000, count: 4 });
    expect(summarize([])).toEqual({ income: 0, expense: 0, balance: 0, count: 0 });
  });

  it('total y porcentaje por categoría, de mayor a menor', () => {
    const rows = totalsByCategory(data, categories, 'expense');
    // empate en el total → orden alfabético
    expect(rows.map((r) => [r.name, r.total, r.percent])).toEqual([
      ['Alimentación', 5000, 50],
      ['Transporte', 5000, 50],
    ]);
    const unequal = totalsByCategory([...data, mov({ amount: 5000, categoryId: 'c-bus' })], categories, 'expense');
    expect(unequal[0]).toMatchObject({ name: 'Transporte', total: 10000, percent: 67 });
    expect(totalsByCategory(data, categories, 'income')[0]).toMatchObject({ name: 'Mesada', percent: 100 });
  });

  it('una categoría desconocida no rompe el cálculo', () => {
    expect(totalsByCategory([mov({ categoryId: 'fantasma' })], categories, 'expense')[0].name).toBe('Sin categoría');
  });

  it('filtra por periodo, categoría, tipo y texto sin tildes', () => {
    const week = periodFor('week', '2026-10-12');
    expect(filterMovements(data, { period: week }, categories)).toHaveLength(3);
    expect(filterMovements(data, { categoryId: 'c-bus' }, categories)).toHaveLength(2);
    expect(filterMovements(data, { type: 'income' }, categories)).toHaveLength(1);
    expect(filterMovements(data, { text: 'alimentacion' }, categories)).toHaveLength(1);
    expect(filterMovements([mov({ note: 'Cólera' })], { text: 'colera' }, categories)).toHaveLength(1);
    expect(filterMovements(data, {}, categories)).toHaveLength(4);
  });

  it('agrupa por día, del más reciente al más antiguo, con el neto de cada día', () => {
    const groups = groupByDay(data);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-13', '2026-10-12', '2026-10-01']);
    expect(groups[1].net).toBe(-7000);
    expect(groups[2].net).toBe(100000);
  });

  it('los registros en conflicto no cuentan', () => {
    const items = [{ syncState: 'synced' }, { syncState: 'pending' }, { syncState: 'conflict' }];
    expect(countable(items)).toHaveLength(2);
  });
});

describe('metas: estado automático por avance y por fecha', () => {
  const goal = { id: 'g1', targetAmount: 100000, deadline: '2026-11-01' };
  const aporte = (amount: number) => mov({ amount, goalId: 'g1', categoryId: 'c-ahorro' });

  it('suma solo los aportes (gastos) de esa meta', () => {
    const data = [aporte(30000), aporte(20000), mov({ amount: 999, goalId: 'otra' }), mov({ amount: 7, type: 'income', goalId: 'g1' })];
    expect(savedForGoal('g1', data)).toBe(50000);
  });

  it('activa → cumplida al alcanzar el objetivo', () => {
    expect(goalStatus(goal, 99999, '2026-10-12')).toBe('active');
    expect(goalStatus(goal, 100000, '2026-10-12')).toBe('completed');
    expect(goalStatus(goal, 150000, '2026-10-12')).toBe('completed');
  });

  it('activa → vencida cuando pasa la fecha límite, aunque la app no se haya abierto en días', () => {
    expect(goalStatus(goal, 10, '2026-11-01')).toBe('active'); // el último día todavía cuenta
    expect(goalStatus(goal, 10, '2026-11-02')).toBe('expired');
    expect(goalStatus(goal, 10, '2027-05-01')).toBe('expired');
  });

  it('una meta cumplida lo sigue siendo aunque pase la fecha', () => {
    expect(goalStatus(goal, 100000, '2027-05-01')).toBe('completed');
  });

  it('calcula porcentaje, faltante, días y ahorro diario necesario', () => {
    const p = goalProgress(goal, [aporte(25000)], '2026-10-12');
    expect(p).toMatchObject({ saved: 25000, percent: 25, remaining: 75000, status: 'active', daysLeft: 20 });
    expect(p.dailyNeeded).toBe(3750);
  });

  it('el porcentaje no pasa de 100 y una meta cumplida no necesita ahorro diario', () => {
    const p = goalProgress(goal, [aporte(250000)], '2026-10-12');
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.dailyNeeded).toBeNull();
  });
});

describe('alertas', () => {
  const base = {
    goals: [],
    categories: [{ id: 'c-bus', name: 'Transporte', type: 'expense' as const, monthlyBudget: 50000 }],
    movements: [] as MovementLike[],
    today: '2026-10-12',
    sync: { online: true, pendingCount: 0, conflictCount: 0, lastError: null },
  };
  const kinds = (input: Parameters<typeof buildAlerts>[0]) => buildAlerts(input).map((a) => a.kind);

  it('sin novedades no hay alertas', () => {
    expect(buildAlerts(base)).toEqual([]);
  });

  it('presupuesto superado y casi agotado (mes en curso)', () => {
    expect(kinds({ ...base, movements: [mov({ amount: 50001 })] })).toEqual(['budget_exceeded']);
    expect(kinds({ ...base, movements: [mov({ amount: 40000 })] })).toEqual(['budget_near']);
    expect(kinds({ ...base, movements: [mov({ amount: 39999 })] })).toEqual([]);
    // gasto de otro mes no cuenta
    expect(kinds({ ...base, movements: [mov({ amount: 90000, date: '2026-09-30' })] })).toEqual([]);
  });

  it('meta próxima a vencer, cumplida y vencida', () => {
    const goals = [
      { id: 'a', name: 'Pronto', targetAmount: 100, deadline: '2026-10-15' },
      { id: 'b', name: 'Lista', targetAmount: 100, deadline: '2026-12-31' },
      { id: 'c', name: 'Tarde', targetAmount: 100, deadline: '2026-10-01' },
      { id: 'd', name: 'Lejos', targetAmount: 100, deadline: '2027-12-31' },
    ];
    const movements = [mov({ amount: 100, goalId: 'b' })];
    const found = buildAlerts({ ...base, goals, movements }).map((a) => a.id);
    expect(found).toEqual(
      expect.arrayContaining(['goal_due_soon:a', 'goal_completed:b', 'goal_expired:c']),
    );
    expect(found).not.toContain('goal_due_soon:d');
  });

  it('estado de sincronización: pendientes, error y conflictos', () => {
    const sync = { online: false, pendingCount: 3, conflictCount: 1, lastError: null };
    expect(kinds({ ...base, sync })).toEqual(['sync_conflict', 'sync_pending']);
    const errored = { online: true, pendingCount: 0, conflictCount: 0, lastError: 'Falló' };
    expect(kinds({ ...base, sync: errored })).toEqual(['sync_error']);
  });

  it('ordena por gravedad: lo urgente primero', () => {
    const alerts = buildAlerts({
      ...base,
      goals: [{ id: 'b', name: 'Lista', targetAmount: 100, deadline: '2026-12-31' }],
      movements: [mov({ amount: 100, goalId: 'b' }), mov({ amount: 60000 })],
      sync: { online: true, pendingCount: 1, conflictCount: 0, lastError: null },
    });
    expect(alerts.map((a) => a.severity)).toEqual(['danger', 'info', 'success']);
  });
});

describe('estadísticas', () => {
  const categories = [
    { id: 'c-bus', name: 'Transporte', type: 'expense' as const, monthlyBudget: 31000 },
    { id: 'c-food', name: 'Alimentación', type: 'expense' as const, monthlyBudget: 100000 },
    { id: 'c-fun', name: 'Ocio', type: 'expense' as const, monthlyBudget: null },
  ];

  it('cumplimiento mensual: categorías dentro de su presupuesto', () => {
    const data = [mov({ amount: 35000, categoryId: 'c-bus' }), mov({ amount: 20000, categoryId: 'c-food' })];
    const c = budgetCompliance(categories, data, periodFor('month', '2026-10-12'));
    expect(c).toMatchObject({ evaluated: 2, withinBudget: 1, percent: 50 });
    expect(c.items[0]).toMatchObject({ name: 'Transporte', ok: false }); // lo que se pasó, primero
  });

  it('cumplimiento semanal prorratea el presupuesto mensual (×7 ÷ días del mes)', () => {
    const week = periodFor('week', '2026-10-12');
    // octubre tiene 31 días → 31000 × 7 / 31 = 7000
    const within = budgetCompliance(categories, [mov({ amount: 7000, categoryId: 'c-bus' })], week);
    expect(within.items.find((i) => i.categoryId === 'c-bus')).toMatchObject({ budget: 7000, ok: true });
    const over = budgetCompliance(categories, [mov({ amount: 7001, categoryId: 'c-bus' })], week);
    expect(over.items.find((i) => i.categoryId === 'c-bus')?.ok).toBe(false);
  });

  it('sin presupuestos no hay porcentaje', () => {
    const none = [{ id: 'x', name: 'X', type: 'expense' as const, monthlyBudget: null }];
    expect(budgetCompliance(none, [], periodFor('month', '2026-10-12')).percent).toBeNull();
  });

  it('evolución del saldo: acumulado diario con saldo inicial', () => {
    const data = [
      mov({ amount: 10000, type: 'income', date: '2026-09-20' }), // saldo inicial
      mov({ amount: 2000, date: '2026-10-12' }),
      mov({ amount: 5000, type: 'income', date: '2026-10-14' }),
    ];
    const series = balanceEvolution(data, periodFor('week', '2026-10-12'), 'day');
    expect(series).toHaveLength(7);
    expect(series.map((p) => p.balance)).toEqual([8000, 8000, 13000, 13000, 13000, 13000, 13000]);
    expect(series[0]).toMatchObject({ expense: 2000, net: -2000, label: '12' });
  });

  it('evolución anual por mes', () => {
    const series = balanceEvolution([mov({ amount: 1000, date: '2026-03-05' })], periodFor('year', '2026-10-12'), 'month');
    expect(series).toHaveLength(12);
    expect(series[2]).toMatchObject({ net: -1000 });
    expect(series[11].balance).toBe(-1000);
  });
});

describe('validación de formularios', () => {
  const categories = [
    { id: 'c-bus', type: 'expense' as const },
    { id: 'c-mesada', type: 'income' as const },
  ];
  const form = {
    amountText: '2.000',
    type: 'expense' as const,
    categoryId: 'c-bus',
    goalId: null,
    date: '2026-10-12',
    note: ' bus ',
  };

  it('acepta un movimiento válido y limpia la nota', () => {
    const r = validateMovement(form, categories, []);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ amount: 2000, type: 'expense', categoryId: 'c-bus', goalId: null, date: '2026-10-12', note: 'bus' });
  });

  it('el monto debe ser un número positivo', () => {
    expect(validateMovement({ ...form, amountText: '' }, categories, []).errors.amount).toBe('Escribe el monto');
    expect(validateMovement({ ...form, amountText: 'abc' }, categories, []).errors.amount).toMatch(/número/);
    expect(validateMovement({ ...form, amountText: '0' }, categories, []).errors.amount).toMatch(/mayor que cero/);
    expect(validateMovement({ ...form, amountText: '-5' }, categories, []).ok).toBe(false);
  });

  it('la categoría debe existir y ser del mismo tipo', () => {
    expect(validateMovement({ ...form, categoryId: null }, categories, []).errors.category).toMatch(/Elige/);
    expect(validateMovement({ ...form, categoryId: 'fantasma' }, categories, []).errors.category).toMatch(/ya no existe/);
    expect(validateMovement({ ...form, categoryId: 'c-mesada' }, categories, []).errors.category).toMatch(/tipo/);
  });

  it('valida la fecha y la longitud de la nota', () => {
    expect(validateMovement({ ...form, date: '2026-02-31' }, categories, []).errors.date).toBeDefined();
    expect(validateMovement({ ...form, note: 'x'.repeat(201) }, categories, []).errors.note).toBeDefined();
  });

  it('el aporte a meta solo vale para gastos y metas que existen', () => {
    expect(validateMovement({ ...form, goalId: 'g1' }, categories, [{ id: 'g1' }]).value?.goalId).toBe('g1');
    expect(validateMovement({ ...form, goalId: 'borrada' }, categories, [{ id: 'g1' }]).value?.goalId).toBeNull();
    const income = validateMovement({ ...form, type: 'income', categoryId: 'c-mesada', goalId: 'g1' }, categories, [{ id: 'g1' }]);
    expect(income.value?.goalId).toBeNull();
  });

  it('categoría: nombre obligatorio, sin duplicados y presupuesto solo en gastos', () => {
    const existing = [{ id: 'c1', name: 'Transporte', type: 'expense' as const }];
    expect(validateCategory({ name: ' ', type: 'expense', budgetText: '' }, existing, null).errors.name).toBeDefined();
    expect(validateCategory({ name: 'transporte', type: 'expense', budgetText: '' }, existing, null).errors.name).toMatch(/Ya tienes/);
    expect(validateCategory({ name: 'transporte', type: 'expense', budgetText: '' }, existing, 'c1').ok).toBe(true);
    expect(validateCategory({ name: 'Mesada', type: 'income', budgetText: '5000' }, existing, null).errors.budget).toBeDefined();
    expect(validateCategory({ name: 'Ocio', type: 'expense', budgetText: '40.000' }, existing, null).value?.monthlyBudget).toBe(40000);
    expect(validateCategory({ name: 'Ocio', type: 'expense', budgetText: '0' }, existing, null).errors.budget).toBeDefined();
  });

  it('meta: campos obligatorios y fecha límite', () => {
    const ok = { name: 'Portátil', targetText: '2.000.000', deadline: '2027-03-01' };
    expect(validateGoal(ok, '2026-10-12', true).value).toEqual({ name: 'Portátil', targetAmount: 2000000, deadline: '2027-03-01' });
    expect(validateGoal({ ...ok, name: '' }, '2026-10-12', true).errors.name).toBeDefined();
    expect(validateGoal({ ...ok, targetText: '0' }, '2026-10-12', true).errors.target).toBeDefined();
    expect(validateGoal({ ...ok, deadline: 'pronto' }, '2026-10-12', true).errors.deadline).toBeDefined();
    expect(validateGoal({ ...ok, deadline: '2026-10-01' }, '2026-10-12', true).errors.deadline).toMatch(/anterior a hoy/);
    expect(validateGoal({ ...ok, deadline: '2026-10-01' }, '2026-10-12', false).ok).toBe(true); // al editar puede haber vencido
  });
});
