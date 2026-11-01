import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeFirestore } from "./helpers/fake-firestore";

const fake = createFakeFirestore();
vi.mock("@/lib/firebase", () => ({ db: () => fake.firestore, adminAuth: () => ({}) }));

import {
  createDefaultCategories,
  deleteRecord,
  listChanges,
  upsertRecord,
} from "@/lib/data/records";
import { DEFAULT_CATEGORIES } from "@/lib/domain/defaults";

const UID = "usuario-a";
const T0 = new Date("2026-10-12T10:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000).toISOString();

const category = (over: Record<string, unknown> = {}) => ({
  name: "Transporte",
  type: "expense",
  monthlyBudget: null,
  createdAt: at(0),
  clientUpdatedAt: at(0),
  ...over,
});
const movement = (over: Record<string, unknown> = {}) => ({
  amount: 2000,
  type: "expense",
  categoryId: "cat-transporte",
  goalId: null,
  date: "2026-10-12",
  note: "",
  createdAt: at(1),
  clientUpdatedAt: at(1),
  ...over,
});

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0.getTime() + 30 * 60_000)); // el servidor está 30 min después de T0
  fake.reset();
});
afterEach(() => vi.useRealTimers());

describe("idempotencia", () => {
  it("repetir la misma escritura no duplica ni cambia nada (reintento tras perder la respuesta)", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    const first = await upsertRecord(UID, "movement", "mov-00000001", movement());
    const writesAfterFirst = fake.writes;
    const stamp = (first.item as unknown as { updatedAt: string }).updatedAt;

    vi.setSystemTime(new Date(T0.getTime() + 45 * 60_000));
    const retry = await upsertRecord(UID, "movement", "mov-00000001", movement());

    expect(retry.applied).toBe(true);
    expect(fake.writes).toBe(writesAfterFirst); // no se escribió nada
    expect((retry.item as unknown as { updatedAt: string }).updatedAt).toBe(stamp);
    const { items } = await listChanges(UID, "movement");
    expect(items).toHaveLength(1);
  });

  it("dos usuarios con el mismo id de registro no se mezclan", async () => {
    await upsertRecord("usuario-a", "category", "cat-transporte", category({ name: "De A" }));
    await upsertRecord("usuario-b", "category", "cat-transporte", category({ name: "De B" }));
    const a = await listChanges<{ id: string; updatedAt: string; name: string }>("usuario-a", "category");
    expect(a.items.map((i) => (i as { name: string }).name)).toEqual(["De A"]);
  });
});

describe("regla de conflictos: la última edición gana", () => {
  it("aplica una edición más reciente", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    await upsertRecord(UID, "movement", "mov-00000001", movement());
    const res = await upsertRecord(
      UID,
      "movement",
      "mov-00000001",
      movement({ amount: 3500, clientUpdatedAt: at(10) }),
    );
    expect(res.applied).toBe(true);
    expect((res.item as unknown as { amount: number }).amount).toBe(3500);
  });

  it("descarta una edición más vieja y devuelve la versión del servidor", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    await upsertRecord(UID, "movement", "mov-00000001", movement({ amount: 3500, clientUpdatedAt: at(10) }));
    const res = await upsertRecord(
      UID,
      "movement",
      "mov-00000001",
      movement({ amount: 999, clientUpdatedAt: at(5) }),
    );
    expect(res.applied).toBe(false);
    expect((res.item as unknown as { amount: number }).amount).toBe(3500);
  });

  it("conserva createdAt de la primera escritura", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    await upsertRecord(UID, "movement", "mov-00000001", movement());
    const res = await upsertRecord(
      UID,
      "movement",
      "mov-00000001",
      movement({ createdAt: at(99), clientUpdatedAt: at(10) }),
    );
    expect((res.item as unknown as { createdAt: string }).createdAt).toBe(at(1));
  });

  it("recorta una edición con el reloj del teléfono adelantado", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    const res = await upsertRecord(
      UID,
      "movement",
      "mov-00000001",
      movement({ clientUpdatedAt: "2030-01-01T00:00:00.000Z" }),
    );
    const stored = (res.item as unknown as { clientUpdatedAt: string }).clientUpdatedAt;
    expect(Date.parse(stored)).toBeLessThanOrEqual(Date.now());
  });
});

describe("borrado: no se resucitan registros", () => {
  it("borrar deja una lápida y deja de guardar los datos", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    await upsertRecord(UID, "movement", "mov-00000001", movement({ note: "secreto" }));
    const res = await deleteRecord(UID, "movement", "mov-00000001");
    expect(res.applied).toBe(true);
    expect(res.item).toMatchObject({ id: "mov-00000001", deleted: true });
    expect(JSON.stringify(fake.get(`usuarios/${UID}/movimientos/mov-00000001`))).not.toContain("secreto");
  });

  it("una edición tardía (hecha sin conexión) NO revive el registro", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    await upsertRecord(UID, "movement", "mov-00000001", movement());
    await deleteRecord(UID, "movement", "mov-00000001");
    const res = await upsertRecord(
      UID,
      "movement",
      "mov-00000001",
      movement({ amount: 8000, clientUpdatedAt: at(25) }),
    );
    expect(res.applied).toBe(false);
    expect(res.item).toMatchObject({ deleted: true });
  });

  it("borrar dos veces es inofensivo", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    await deleteRecord(UID, "category", "cat-transporte");
    const again = await deleteRecord(UID, "category", "cat-transporte");
    expect(again.applied).toBe(false);
  });

  it("borrar algo que el servidor nunca vio deja lápida: un envío tardío no lo crea", async () => {
    await deleteRecord(UID, "category", "cat-fantasma");
    const res = await upsertRecord(UID, "category", "cat-fantasma", category({ clientUpdatedAt: at(2) }));
    expect(res.applied).toBe(false);
  });

  it("los cambios incluyen las lápidas para que otros dispositivos borren su copia", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    await deleteRecord(UID, "category", "cat-transporte");
    const { items } = await listChanges(UID, "category");
    expect(items).toEqual([expect.objectContaining({ id: "cat-transporte", deleted: true })]);
  });
});

describe("integridad entre registros", () => {
  it("rechaza un movimiento de una categoría que no existe (409 INVALID_REFERENCE)", async () => {
    expect(await codeOf(upsertRecord(UID, "movement", "mov-00000001", movement()))).toBe("INVALID_REFERENCE");
  });

  it("rechaza un movimiento de una categoría eliminada", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    await deleteRecord(UID, "category", "cat-transporte");
    expect(await codeOf(upsertRecord(UID, "movement", "mov-00000001", movement()))).toBe("INVALID_REFERENCE");
  });

  it("rechaza un gasto en una categoría de ingresos", async () => {
    await upsertRecord(UID, "category", "cat-mesada", category({ type: "income", name: "Mesada" }));
    expect(
      await codeOf(upsertRecord(UID, "movement", "mov-00000001", movement({ categoryId: "cat-mesada" }))),
    ).toBe("INVALID_REFERENCE");
  });

  it("rechaza un aporte a una meta que no existe, y lo acepta cuando existe", async () => {
    await upsertRecord(UID, "category", "cat-ahorro", category({ name: "Ahorro" }));
    const aporte = movement({ categoryId: "cat-ahorro", goalId: "meta-0000001" });
    expect(await codeOf(upsertRecord(UID, "movement", "mov-00000001", aporte))).toBe("INVALID_REFERENCE");

    await upsertRecord(UID, "goal", "meta-0000001", {
      name: "Portátil",
      targetAmount: 2_000_000,
      deadline: "2027-03-01",
      createdAt: at(0),
      clientUpdatedAt: at(0),
    });
    const ok = await upsertRecord(UID, "movement", "mov-00000001", aporte);
    expect(ok.applied).toBe(true);
  });

  it("un ingreso no puede ser aporte a una meta", async () => {
    await upsertRecord(UID, "category", "cat-mesada", category({ type: "income" }));
    await upsertRecord(UID, "goal", "meta-0000001", {
      name: "Meta",
      targetAmount: 1000,
      deadline: "2027-03-01",
      createdAt: at(0),
      clientUpdatedAt: at(0),
    });
    const res = upsertRecord(
      UID,
      "movement",
      "mov-00000001",
      movement({ type: "income", categoryId: "cat-mesada", goalId: "meta-0000001" }),
    );
    expect(await codeOf(res)).toBe("INVALID_REFERENCE");
  });
});

describe("sincronización incremental y bitácora", () => {
  it("updatedSince devuelve solo lo que cambió después del cursor", async () => {
    await upsertRecord(UID, "category", "cat-viejo01", category({ name: "Viejo" }));
    vi.setSystemTime(new Date(T0.getTime() + 60 * 60_000));
    const cursor = new Date().toISOString();
    vi.setSystemTime(new Date(T0.getTime() + 61 * 60_000));
    await upsertRecord(UID, "category", "cat-nuevo01", category({ name: "Nuevo", clientUpdatedAt: at(61) }));

    const { items, serverTime } = await listChanges(UID, "category", cursor);
    expect(items.map((i) => i.id)).toEqual(["cat-nuevo01"]);
    expect(serverTime).toBe(new Date().toISOString());
  });

  it("registra cada cambio en el historial, sin duplicar los reintentos", async () => {
    await upsertRecord(UID, "category", "cat-transporte", category());
    await upsertRecord(UID, "category", "cat-transporte", category()); // reintento idéntico
    await upsertRecord(UID, "category", "cat-transporte", category({ name: "Bus", clientUpdatedAt: at(5) }));
    await deleteRecord(UID, "category", "cat-transporte");
    const actions = fake
      .docsUnder(`usuarios/${UID}/historial/`)
      .map((d) => d.action)
      .sort();
    expect(actions).toEqual(["create", "delete", "update"]);
  });

  it("crea las categorías iniciales con ids fijos (no se duplican al repetir)", async () => {
    await createDefaultCategories("usuario-nuevo");
    await createDefaultCategories("usuario-nuevo");
    const { items } = await listChanges("usuario-nuevo", "category");
    expect(items).toHaveLength(DEFAULT_CATEGORIES.length);
  });
});
