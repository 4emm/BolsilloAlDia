/**
 * Firestore en memoria con SOLO lo que usa lib/data/records.ts. Permite probar la lógica de
 * sincronización (idempotencia, conflictos, lápidas) sin red ni credenciales de Firebase.
 * Las pruebas contra Firestore real están en scripts/smoke.mts.
 */
type Data = Record<string, unknown>;

export function createFakeFirestore() {
  const store = new Map<string, Data>();
  let writes = 0;

  const snapshot = (path: string) => {
    const data = store.get(path);
    return {
      id: path.split("/").at(-1)!,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : structuredClone(data)),
    };
  };

  function docRef(path: string) {
    return {
      path,
      id: path.split("/").at(-1)!,
      collection: (name: string) => collectionRef(`${path}/${name}`),
      get: async () => snapshot(path),
    };
  }

  function query(path: string, filters: ((d: Data) => boolean)[]) {
    return {
      where: (field: string, op: string, value: unknown) => {
        if (op !== ">") throw new Error(`Operador no soportado en el fake: ${op}`);
        return query(path, [...filters, (d) => String(d[field]) > String(value)]);
      },
      get: async () => {
        const docs = [...store.keys()]
          .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/"))
          .map((p) => snapshot(p))
          .filter((s) => filters.every((f) => f(s.data()!)));
        return { docs, size: docs.length };
      },
    };
  }

  function collectionRef(path: string) {
    return { ...query(path, []), doc: (id: string) => docRef(`${path}/${id}`) };
  }

  const firestore = {
    collection: (name: string) => collectionRef(name),
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (ref: { path: string }, data: Data) =>
          void ops.push(() => {
            store.set(ref.path, structuredClone(data));
            writes++;
          }),
        commit: async () => ops.forEach((op) => op()),
      };
    },
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: (() => void)[] = [];
      const tx = {
        get: async (ref: { path: string }) => snapshot(ref.path),
        set: (ref: { path: string }, data: Data) =>
          void pending.push(() => {
            store.set(ref.path, structuredClone(data));
            writes++;
          }),
      };
      const result = await fn(tx);
      pending.forEach((op) => op());
      return result;
    },
  };

  return {
    firestore,
    reset: () => {
      store.clear();
      writes = 0;
    },
    /** Documentos guardados bajo una ruta (para inspeccionar en las pruebas). */
    docsUnder: (prefix: string): ({ path: string } & Data)[] =>
      [...store.entries()].filter(([p]) => p.startsWith(prefix)).map(([p, d]) => ({ path: p, ...d })),
    get: (path: string) => store.get(path),
    get writes() {
      return writes;
    },
  };
}
