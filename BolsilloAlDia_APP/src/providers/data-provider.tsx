/**
 * Datos de la app: SQLite es la fuente de lo que ve el usuario; la red solo sirve para sincronizar.
 *
 * Este proveedor:
 *  - carga categorías, metas y movimientos desde SQLite (y los recarga tras cada cambio),
 *  - ofrece las operaciones de escritura "local primero" (`actions`) que además intentan sincronizar,
 *  - decide CUÁNDO sincronizar: al iniciar sesión, al volver la red (NetInfo), al volver la app a
 *    primer plano, al deslizar para refrescar y tras cada cambio,
 *  - protege los datos de cada cuenta: se limpian al cerrar sesión o al entrar otro usuario.
 */
import NetInfo from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { createRepositories, type Repositories } from '@/db/repositories';
import { todayLocal } from '@/domain/periods';
import { countable } from '@/domain/summary';
import { api } from '@/services/api';
import { describeError } from '@/services/api/client';
import { createFinanceService, type FinanceService } from '@/services/data/finance-service';
import { createSyncService } from '@/services/sync/sync-service';
import type { Category, Goal, Movement } from '@/types';
import { useAuth } from './auth-provider';

interface DataContextValue {
  /** Ya se hizo la primera lectura de SQLite (antes de eso se muestra "cargando"). */
  ready: boolean;
  categories: Category[];
  goals: Goal[];
  /** Todos los movimientos guardados, incluidos los rechazados por el servidor (en conflicto). */
  movements: Movement[];
  /** Los que cuentan para totales: sin los rechazados por el servidor. */
  countableMovements: Movement[];
  /** Fecha de hoy (AAAA-MM-DD, hora local). Se actualiza al volver a la app y al cambiar el día. */
  today: string;
  /** Hay red y el dispositivo puede salir a internet. */
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  /** Mensaje del último intento fallido de sincronización, o null. */
  lastError: string | null;
  /** Cuántos cambios hechos en el teléfono esperan ser enviados. */
  pendingCount: number;
  /** Cuántos registros rechazó el servidor y esperan una decisión del usuario. */
  conflictCount: number;
  repos: Repositories;
  /** Escrituras locales (guardan en SQLite, encolan y piden una sincronización). */
  actions: FinanceService;
  syncNow: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { status, user } = useAuth();
  const uid = user?.uid ?? null;

  const repos = useMemo(() => createRepositories(db), [db]);
  const syncService = useMemo(() => createSyncService({ api, repos }), [repos]);
  const finance = useMemo(() => createFinanceService({ repos, newId: randomUUID }), [repos]);

  const [ready, setReady] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [today, setToday] = useState(() => todayLocal());

  const inFlight = useRef<Promise<void> | null>(null);
  const wasOnline = useRef(true);
  const loadToken = useRef(0);

  /** Lee SQLite y actualiza el estado. Si llegan dos lecturas seguidas, solo vale la última. */
  const reload = useCallback(async () => {
    const token = ++loadToken.current;
    const [c, g, m, pending, last] = await Promise.all([
      repos.categories.list(),
      repos.goals.list(),
      repos.movements.list(),
      repos.outbox.count(),
      syncService.lastSyncAt(),
    ]);
    if (token !== loadToken.current) return;
    setCategories(c);
    setGoals(g);
    setMovements(m);
    setPendingCount(pending);
    setLastSyncAt(last);
    setReady(true);
  }, [repos, syncService]);

  /** Un solo ciclo de sincronización a la vez: llamadas simultáneas comparten la misma promesa. */
  const syncNow = useCallback(async () => {
    if (!uid) return;
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setSyncing(true);
      try {
        await syncService.run();
        setLastError(null);
      } catch (err) {
        setLastError(describeError(err));
      } finally {
        setSyncing(false);
        inFlight.current = null;
        await reload();
      }
    })();
    inFlight.current = run;
    return run;
  }, [uid, syncService, reload]);

  // Conectividad: al volver la red se vacía la cola automáticamente.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline && !wasOnline.current) void syncNow();
      wasOnline.current = isOnline;
    });
    return unsubscribe;
  }, [syncNow]);

  // Al volver a primer plano: sincronizar y recalcular "hoy" (las metas pueden haber vencido).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setToday(todayLocal());
        void syncNow();
      }
    });
    return () => sub.remove();
  }, [syncNow]);

  // Si la app queda abierta pasada la medianoche, "hoy" cambia solo.
  useEffect(() => {
    const id = setInterval(() => setToday((prev) => (prev === todayLocal() ? prev : todayLocal())), 60_000);
    return () => clearInterval(id);
  }, []);

  // Al iniciar o cerrar sesión: proteger los datos de cada cuenta.
  useEffect(() => {
    if (status === 'loading') return;
    let cancelled = false;
    (async () => {
      if (uid) {
        // Los datos pertenecen a UNA cuenta. Si cambió el usuario (p. ej. se cerró la sesión a la fuerza
        // con cambios pendientes), se descartan para no enviar cambios a nombre de otra persona.
        const owner = await repos.meta.get('owner.uid');
        if (owner && owner !== uid) await clearPrivateData(repos);
        await repos.meta.set('owner.uid', uid);
        if (cancelled) return;
        await reload();
        await syncNow();
      } else {
        // Sesión cerrada: se borran los datos financieros del dispositivo.
        await clearPrivateData(repos);
        if (cancelled) return;
        setLastError(null);
        await reload();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, uid, repos, reload, syncNow]);

  /**
   * Cada escritura local: 1) se guarda en SQLite + cola, 2) se recarga la interfaz (los totales cambian
   * de inmediato) y 3) se intenta enviar; si no hay red, queda en la cola.
   */
  const actions = useMemo(() => {
    const wrap = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        const result = await fn(...args);
        await reload();
        void syncNow();
        return result;
      };
    return Object.fromEntries(
      Object.entries(finance).map(([name, fn]) => [name, wrap(fn as (...a: unknown[]) => Promise<unknown>)]),
    ) as unknown as FinanceService;
  }, [finance, reload, syncNow]);

  const countableMovements = useMemo(() => countable(movements), [movements]);
  const conflictCount = useMemo(
    () =>
      [...categories, ...goals, ...movements].filter((r) => r.syncState === 'conflict').length,
    [categories, goals, movements],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      ready,
      categories,
      goals,
      movements,
      countableMovements,
      today,
      online,
      syncing,
      lastSyncAt,
      lastError,
      pendingCount,
      conflictCount,
      repos,
      actions,
      syncNow,
    }),
    [
      ready,
      categories,
      goals,
      movements,
      countableMovements,
      today,
      online,
      syncing,
      lastSyncAt,
      lastError,
      pendingCount,
      conflictCount,
      repos,
      actions,
      syncNow,
    ],
  );
  return <DataContext value={value}>{children}</DataContext>;
}

async function clearPrivateData(repos: Repositories) {
  await repos.db.withTransactionAsync(async () => {
    await repos.categories.clear();
    await repos.goals.clear();
    await repos.movements.clear();
    await repos.outbox.clear();
    await repos.meta.clear();
    await repos.activity.clear();
  });
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de <DataProvider>');
  return ctx;
}
