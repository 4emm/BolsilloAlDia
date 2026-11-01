/**
 * Servidor falso en memoria que imita el comportamiento de BolsilloAlDia_API (las mismas reglas:
 * PUT idempotente por id, "la última edición gana", lápidas al borrar, 409 INVALID_REFERENCE).
 * Permite probar la sincronización de la app sin red. El servidor real se prueba con `npm run smoke`
 * en el proyecto de la API.
 */
import { ApiRequestError, NetworkError, type ApiClient } from '@/services/api/client';

type Doc = Record<string, unknown> & { id: string; updatedAt: string };

const COLLECTION_OF: Record<string, 'category' | 'goal' | 'movement'> = {
  categories: 'category',
  goals: 'goal',
  movements: 'movement',
};

export function createFakeServer() {
  const store = {
    category: new Map<string, Doc>(),
    goal: new Map<string, Doc>(),
    movement: new Map<string, Doc>(),
  };
  const tombstones = new Set<string>();
  let clock = Date.parse('2026-10-12T12:00:00.000Z');
  const state = {
    online: true,
    /** Cuántas escrituras (PUT/DELETE) llegaron, incluidas las repetidas. */
    requests: 0,
    /** Falla las próximas N peticiones con este estado (para simular 500). */
    failNext: 0,
    failStatus: 500,
    /** Si es true, ejecuta la petición pero finge que la respuesta se perdió (NetworkError). */
    dropResponses: false,
  };
  const now = () => new Date((clock += 1000)).toISOString();

  const key = (kind: string, id: string) => `${kind}:${id}`;

  function handle(method: string, path: string, body: any) {
    const [route, queryString] = path.split('?');
    const [, , resource, id] = route.split('/');
    const kind = COLLECTION_OF[resource];
    if (!kind) throw new ApiRequestError(404, 'NOT_FOUND', 'Ruta desconocida');
    const map = store[kind];

    if (method === 'GET' && !id) {
      const since = new URLSearchParams(queryString ?? '').get('updatedSince');
      const items: unknown[] = [];
      for (const doc of map.values()) if (!since || doc.updatedAt > since) items.push(doc);
      for (const t of tombstones) {
        const [k, tid] = t.split(':');
        if (k === kind) items.push({ id: tid, deleted: true, deletedAt: now(), updatedAt: now() });
      }
      return { items, serverTime: new Date(clock).toISOString() };
    }

    state.requests++;
    if (method === 'PUT') {
      if (tombstones.has(key(kind, id))) {
        return { item: { id, deleted: true, deletedAt: now(), updatedAt: now() }, applied: false };
      }
      const existing = map.get(id);
      if (existing && Date.parse(body.clientUpdatedAt) < Date.parse(existing.clientUpdatedAt as string)) {
        return { item: existing, applied: false };
      }
      if (existing && existing.clientUpdatedAt === body.clientUpdatedAt) {
        return { item: existing, applied: true }; // reintento idéntico: no cambia nada
      }
      if (kind === 'movement') {
        const cat = store.category.get(body.categoryId);
        if (!cat || cat.type !== body.type) {
          throw new ApiRequestError(409, 'INVALID_REFERENCE', 'La categoría del movimiento no existe');
        }
        if (body.goalId && !store.goal.get(body.goalId)) {
          throw new ApiRequestError(409, 'INVALID_REFERENCE', 'La meta del aporte no existe');
        }
      }
      const doc: Doc = { ...body, id, createdAt: existing?.createdAt ?? body.createdAt, updatedAt: now() };
      map.set(id, doc);
      return { item: doc, applied: true };
    }
    if (method === 'DELETE') {
      const was = tombstones.has(key(kind, id));
      map.delete(id);
      tombstones.add(key(kind, id));
      return { item: { id, deleted: true, deletedAt: now(), updatedAt: now() }, applied: !was };
    }
    throw new ApiRequestError(405, 'UNKNOWN', 'Método no soportado');
  }

  const api: Pick<ApiClient, 'get' | 'put' | 'delete' | 'post' | 'patch' | 'request'> = {
    async request(path, options) {
      if (!state.online) throw new NetworkError();
      if (state.failNext > 0) {
        state.failNext--;
        throw new ApiRequestError(state.failStatus, 'INTERNAL_ERROR', 'Error del servidor');
      }
      const result = handle(options?.method ?? 'GET', path, options?.body);
      if (state.dropResponses && options?.method !== 'GET') throw new NetworkError();
      return JSON.parse(JSON.stringify(result));
    },
    get: (path) => api.request(path, { method: 'GET' }),
    put: (path, body) => api.request(path, { method: 'PUT', body }),
    delete: (path) => api.request(path, { method: 'DELETE' }),
    post: (path, body) => api.request(path, { method: 'POST', body }),
    patch: (path, body) => api.request(path, { method: 'PATCH', body }),
  };

  return {
    api: api as ApiClient,
    state,
    store,
    /** Cuántos documentos vivos hay de cada tipo. */
    count: (kind: 'category' | 'goal' | 'movement') => store[kind].size,
    /** Inserta un documento como si otro dispositivo lo hubiera creado. */
    seed(kind: 'category' | 'goal' | 'movement', doc: { id: string } & Record<string, unknown>) {
      store[kind].set(doc.id, { ...doc, updatedAt: now() } as Doc);
    },
    /** Simula que otro dispositivo eliminó un registro. */
    remoteDelete(kind: 'category' | 'goal' | 'movement', id: string) {
      store[kind].delete(id);
      tombstones.add(key(kind, id));
    },
    tick: now,
  };
}
