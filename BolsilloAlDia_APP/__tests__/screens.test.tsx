/**
 * Pruebas de las pantallas: se renderizan con datos de ejemplo (sin red ni SQLite) para comprobar que
 * no fallan, que muestran los totales calculados y que los formularios validan y guardan.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { describeConnection } from '@/lib/connection';
import type { Category, Goal, Movement } from '@/types';
import AlertsScreen from '@/app/alerts';
import CategoriesScreen from '@/app/categories';
import CategoryFormScreen from '@/app/category/[id]';
import GoalFormScreen from '@/app/goal/[id]';
import MovementFormScreen from '@/app/movement/[id]';
import SyncScreen from '@/app/sync';
import GoalsScreen from '@/app/(tabs)/goals';
import HomeScreen from '@/app/(tabs)/index';
import MoreScreen from '@/app/(tabs)/more';
import MovementsScreen from '@/app/(tabs)/movements';
import StatsScreen from '@/app/(tabs)/stats';

// ───────────── Datos de ejemplo ─────────────
const meta = {
  createdAt: '2026-10-01T10:00:00.000Z',
  clientUpdatedAt: '2026-10-01T10:00:00.000Z',
  serverUpdatedAt: '2026-10-01T10:00:00.000Z',
  syncState: 'synced' as const,
  syncError: null,
};
const category = (o: Partial<Category> & Pick<Category, 'id' | 'name' | 'type'>): Category => ({
  monthlyBudget: null,
  ...meta,
  ...o,
});
const goal = (o: Partial<Goal> & Pick<Goal, 'id' | 'name'>): Goal => ({
  targetAmount: 100000,
  deadline: '2026-12-31',
  ...meta,
  ...o,
});
const movement = (o: Partial<Movement> & Pick<Movement, 'id'>): Movement => ({
  amount: 2000,
  type: 'expense',
  categoryId: 'c-bus',
  goalId: null,
  date: '2026-10-12',
  note: '',
  ...meta,
  ...o,
});

const categories = [
  category({ id: 'c-bus', name: 'Transporte', type: 'expense', monthlyBudget: 50000 }),
  category({ id: 'c-food', name: 'Alimentación', type: 'expense' }),
  category({ id: 'c-save', name: 'Ahorro', type: 'expense' }),
  category({ id: 'c-mesada', name: 'Mesada', type: 'income' }),
];
const goals = [
  goal({ id: 'g-pc', name: 'Portátil', targetAmount: 100000, deadline: '2026-10-15' }),
  goal({ id: 'g-done', name: 'Bicicleta', targetAmount: 50000, deadline: '2026-12-31' }),
];
const movements = [
  movement({ id: 'm1', amount: 100000, type: 'income', categoryId: 'c-mesada', date: '2026-10-01' }),
  movement({ id: 'm2', amount: 2000, note: 'Bus a la U' }),
  movement({ id: 'm3', amount: 8000, categoryId: 'c-food', syncState: 'pending' }),
  movement({ id: 'm4', amount: 30000, categoryId: 'c-save', goalId: 'g-pc' }),
  movement({ id: 'm5', amount: 50000, categoryId: 'c-save', goalId: 'g-done' }),
  movement({ id: 'm6', amount: 9999, syncState: 'conflict', syncError: 'La categoría ya no existe' }),
];

// ───────────── Dobles de prueba ─────────────
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

// Los íconos cargan fuentes al montarse; en pruebas no hace falta.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children: ReactElement }) => children,
}));

const actions = {
  createMovement: jest.fn().mockResolvedValue({}),
  updateMovement: jest.fn().mockResolvedValue({}),
  deleteMovement: jest.fn().mockResolvedValue(undefined),
  createCategory: jest.fn().mockResolvedValue({}),
  updateCategory: jest.fn().mockResolvedValue({}),
  deleteCategory: jest.fn().mockResolvedValue({ movementsDeleted: 0 }),
  createGoal: jest.fn().mockResolvedValue({}),
  updateGoal: jest.fn().mockResolvedValue({}),
  deleteGoal: jest.fn().mockResolvedValue({ unlinked: 0 }),
  retryConflict: jest.fn().mockResolvedValue(undefined),
  discardConflict: jest.fn().mockResolvedValue(undefined),
};
const mockData = {
  ready: true,
  categories,
  goals,
  movements,
  countableMovements: movements.filter((m) => m.syncState !== 'conflict'),
  today: '2026-10-12',
  online: true,
  syncing: false,
  lastSyncAt: '2026-10-12T09:00:00.000Z',
  lastError: null as string | null,
  pendingCount: 1,
  conflictCount: 1,
  repos: { activity: { recent: jest.fn().mockResolvedValue([]) } },
  actions,
  syncNow: jest.fn().mockResolvedValue(undefined),
};
jest.mock('@/providers/data-provider', () => ({ useData: () => mockData }));
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    user: { uid: 'u1', name: 'Ana Pérez', email: 'ana@correo.co' },
    signOut: jest.fn(),
  }),
}));


beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockData.online = true;
  mockData.syncing = false;
  mockData.lastError = null;
});

describe('indicador de conexión (en todas las pantallas)', () => {
  const base = { signedIn: true, online: true, syncing: false, pendingCount: 0, conflictCount: 0, lastError: null, lastSyncAt: null };

  it('describe cada estado', () => {
    expect(describeConnection({ ...base, online: false, pendingCount: 2 })).toMatchObject({
      tone: 'warning',
      text: expect.stringContaining('Sin conexión · Tus datos están guardados en el teléfono · 2 cambios por enviar'),
    });
    expect(describeConnection({ ...base, syncing: true }).text).toBe('Sincronizando…');
    expect(describeConnection({ ...base, pendingCount: 1 }).text).toBe('En línea · 1 cambio por enviar');
    expect(describeConnection({ ...base, conflictCount: 2 }).tone).toBe('danger');
    expect(describeConnection({ ...base, lastError: 'x' }).text).toMatch(/No se pudo sincronizar/);
    expect(describeConnection({ ...base, lastSyncAt: new Date().toISOString() }).text).toMatch(/^En línea · Sincronizado/);
    expect(describeConnection({ ...base, signedIn: false, online: false }).text).toMatch(/iniciar sesión/);
  });

  it('toda pantalla muestra el estado de la conexión', async () => {
    mockData.online = false;
    await render(<MoreScreen />);
    expect(screen.getByText(/Sin conexión · Tus datos están guardados en el teléfono · 1 cambio por enviar/)).toBeTruthy();
  });
});

describe('pantallas principales', () => {
  it('Inicio: saldo del periodo calculado con los datos locales', async () => {
    await render(<HomeScreen />);
    // ingresos 100.000 − gastos (2.000 + 8.000 + 30.000 + 50.000); el rechazado (9.999) no cuenta
    expect(screen.getByText('Saldo del periodo')).toBeTruthy();
    expect(screen.getAllByText('$ 10.000').length).toBeGreaterThan(0);
    expect(screen.getByText('$ 100.000')).toBeTruthy();
    expect(screen.getByText('$ 90.000')).toBeTruthy();
    expect(screen.getByLabelText('Registrar')).toBeTruthy();
  });

  it('Inicio: muestra alertas (meta por vencer) y los últimos movimientos', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText(/Meta por vencer: Portátil/)).toBeTruthy();
    expect(screen.getByText('Bus a la U')).toBeTruthy();
  });

  it('Movimientos: lista agrupada por día, con etiquetas de pendiente y de rechazado', async () => {
    await render(<MovementsScreen />);
    expect(screen.getByText('Hoy')).toBeTruthy();
    expect(screen.getByText('Pendiente de envío')).toBeTruthy();
    expect(screen.getByText('No se pudo sincronizar')).toBeTruthy();
  });

  it('Movimientos: filtrar por categoría deja solo sus movimientos', async () => {
    await render(<MovementsScreen />);
    await fireEvent.press(screen.getByLabelText('Alimentación'));
    // aparece en la fila y en el resumen del filtro
    expect(screen.getAllByText('-$ 8.000').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Bus a la U')).toBeNull();
  });

  it('Movimientos: buscar por texto', async () => {
    await render(<MovementsScreen />);
    await fireEvent.changeText(screen.getByLabelText('Buscar movimientos'), 'bus');
    await waitFor(() => expect(screen.getByText('1 movimiento')).toBeTruthy());
    expect(screen.getByText('Bus a la U')).toBeTruthy();
  });

  it('Metas: estados calculados (activa y cumplida) y filtro por estado', async () => {
    await render(<GoalsScreen />);
    expect(screen.getByText('Portátil')).toBeTruthy();
    expect(screen.getByText('Bicicleta')).toBeTruthy();
    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByText('Cumplida')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cumplidas'));
    expect(screen.queryByText('Portátil')).toBeNull();
    expect(screen.getByText('Bicicleta')).toBeTruthy();
  });

  it('Estadísticas: cumplimiento, distribución del gasto y evolución del saldo', async () => {
    await render(<StatsScreen />);
    expect(screen.getByText('Cumplimiento del presupuesto')).toBeTruthy();
    expect(screen.getByText('Distribución del gasto')).toBeTruthy();
    expect(screen.getByText('Evolución del saldo')).toBeTruthy();
    expect(screen.getByText('Metas cumplidas: 1 de 2')).toBeTruthy();
  });

  it('Más: datos de la cuenta y cierre de sesión', async () => {
    await render(<MoreScreen />);
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByLabelText('Cerrar sesión')).toBeTruthy();
  });

  it('Alertas y Sincronización muestran lo pendiente y los rechazados', async () => {
    await render(<AlertsScreen />);
    expect(screen.getByText(/Registros que no se pudieron sincronizar/)).toBeTruthy();
    await render(<SyncScreen />);
    expect(screen.getByText('Registros rechazados')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Descartar'));
    expect(actions.discardConflict).toHaveBeenCalledWith('movement', 'm6');
  });

  it('Categorías: separa gastos e ingresos', async () => {
    await render(<CategoriesScreen />);
    expect(screen.getByText('Gastos')).toBeTruthy();
    expect(screen.getByText('Ingresos')).toBeTruthy();
    expect(screen.getByText('Transporte')).toBeTruthy();
  });
});

describe('formulario de movimiento', () => {
  beforeEach(() => {
    mockParams = { id: 'new' };
  });

  it('registra un gasto en pocos pasos: monto → categoría → Guardar', async () => {
    await render(<MovementFormScreen />);
    await fireEvent.changeText(screen.getByLabelText('Monto'), '12500');
    await fireEvent.press(screen.getByLabelText('Transporte'));
    await fireEvent.press(screen.getByLabelText('Guardar'));
    await waitFor(() => expect(actions.createMovement).toHaveBeenCalledTimes(1));
    expect(actions.createMovement).toHaveBeenCalledWith({
      amount: 12500,
      type: 'expense',
      categoryId: 'c-bus',
      goalId: null,
      date: '2026-10-12',
      note: '',
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('no guarda sin monto ni categoría y explica por qué', async () => {
    await render(<MovementFormScreen />);
    await fireEvent.press(screen.getByLabelText('Guardar'));
    expect(await screen.findByText('Escribe el monto')).toBeTruthy();
    expect(screen.getByText('Elige una categoría')).toBeTruthy();
    expect(actions.createMovement).not.toHaveBeenCalled();
  });

  it('el monto cero no se acepta', async () => {
    await render(<MovementFormScreen />);
    await fireEvent.changeText(screen.getByLabelText('Monto'), '0');
    await fireEvent.press(screen.getByLabelText('Transporte'));
    await fireEvent.press(screen.getByLabelText('Guardar'));
    expect(await screen.findByText('El monto debe ser mayor que cero')).toBeTruthy();
    expect(actions.createMovement).not.toHaveBeenCalled();
  });

  it('cambiar a ingreso muestra solo categorías de ingreso', async () => {
    await render(<MovementFormScreen />);
    await fireEvent.press(screen.getByLabelText('Ingreso'));
    expect(screen.getByLabelText('Mesada')).toBeTruthy();
    expect(screen.queryByLabelText('Transporte')).toBeNull();
  });

  it('editar un movimiento existente lo actualiza', async () => {
    mockParams = { id: 'm2' };
    await render(<MovementFormScreen />);
    expect(screen.getByText('Editar movimiento')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Monto'), '3000');
    await fireEvent.press(screen.getByLabelText('Guardar'));
    await waitFor(() => expect(actions.updateMovement).toHaveBeenCalledWith('m2', expect.objectContaining({ amount: 3000 })));
  });

  it('un movimiento inexistente muestra un aviso en vez de fallar', async () => {
    mockParams = { id: 'no-existe' };
    await render(<MovementFormScreen />);
    expect(screen.getByText('Este movimiento ya no existe')).toBeTruthy();
  });
});

describe('formularios de categoría y de meta', () => {
  it('categoría: exige nombre y guarda con presupuesto', async () => {
    mockParams = { id: 'new' };
    await render(<CategoryFormScreen />);
    await fireEvent.press(screen.getByLabelText('Guardar'));
    expect(await screen.findByText('Escribe el nombre de la categoría')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Gimnasio');
    await fireEvent.changeText(screen.getByLabelText('Presupuesto mensual (opcional)'), '40000');
    await fireEvent.press(screen.getByLabelText('Guardar'));
    await waitFor(() =>
      expect(actions.createCategory).toHaveBeenCalledWith({ name: 'Gimnasio', type: 'expense', monthlyBudget: 40000 }),
    );
  });

  it('categoría: no permite nombres repetidos', async () => {
    mockParams = { id: 'new' };
    await render(<CategoryFormScreen />);
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'transporte');
    await fireEvent.press(screen.getByLabelText('Guardar'));
    expect(await screen.findByText('Ya tienes una categoría con ese nombre')).toBeTruthy();
  });

  it('meta: valida campos obligatorios y la fecha límite', async () => {
    mockParams = { id: 'new' };
    await render(<GoalFormScreen />);
    await fireEvent.press(screen.getByLabelText('Guardar'));
    expect(await screen.findByText('Escribe el nombre de la meta')).toBeTruthy();
    expect(screen.getByText('Escribe el monto objetivo')).toBeTruthy();
    expect(screen.getByText('La fecha límite debe ser válida (AAAA-MM-DD)')).toBeTruthy();
    expect(actions.createGoal).not.toHaveBeenCalled();
  });

  it('meta: crea con nombre, monto y fecha', async () => {
    mockParams = { id: 'new' };
    await render(<GoalFormScreen />);
    await fireEvent.changeText(screen.getByLabelText('Nombre de la meta'), 'Viaje');
    await fireEvent.changeText(screen.getByLabelText('Monto objetivo'), '500000');
    await fireEvent.press(screen.getByLabelText('+3 meses'));
    await fireEvent.press(screen.getByLabelText('Guardar'));
    await waitFor(() =>
      expect(actions.createGoal).toHaveBeenCalledWith({ name: 'Viaje', targetAmount: 500000, deadline: '2027-01-12' }),
    );
  });

  it('meta existente: muestra su avance y los aportes', async () => {
    mockParams = { id: 'g-pc' };
    await render(<GoalFormScreen />);
    expect(screen.getByLabelText('Abonar a esta meta')).toBeTruthy();
    expect(screen.getByText('Aportes')).toBeTruthy();
    expect(screen.getByText('-$ 30.000')).toBeTruthy();
  });
});
