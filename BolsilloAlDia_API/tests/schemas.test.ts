import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "@/lib/domain/defaults";
import {
  categoryWriteSchema,
  changesQuerySchema,
  goalWriteSchema,
  idSchema,
  loginSchema,
  movementWriteSchema,
  registerSchema,
} from "@/lib/schemas";

const sync = { createdAt: "2026-10-12T10:00:00.000Z", clientUpdatedAt: "2026-10-12T10:00:00.000Z" };
const validMovement = {
  amount: 2000,
  type: "expense",
  categoryId: "cat-transporte",
  date: "2026-10-12",
  ...sync,
};

describe("loginSchema / registerSchema", () => {
  it("normaliza el correo", () => {
    expect(loginSchema.parse({ email: "  Ana@Mail.COM ", password: "x" }).email).toBe("ana@mail.com");
  });
  it("rechaza correos inválidos", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
  it("exige contraseña de 6+ caracteres (mínimo de Firebase)", () => {
    expect(registerSchema.safeParse({ email: "a@b.co", password: "12345", displayName: "Ana" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.co", password: "123456", displayName: "Ana" }).success).toBe(true);
  });
});

describe("idSchema", () => {
  it("acepta UUID y rechaza caracteres peligrosos", () => {
    expect(idSchema.safeParse("3f2b8c1e-7d44-4b9a-9a1e-0c5d2f6a7b11").success).toBe(true);
    expect(idSchema.safeParse("../../etc/passwd").success).toBe(false);
    expect(idSchema.safeParse("corto").success).toBe(false);
  });
  it("los ids de las categorías iniciales son válidos", () => {
    for (const c of DEFAULT_CATEGORIES) expect(idSchema.safeParse(c.id).success, c.id).toBe(true);
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.id)).size).toBe(DEFAULT_CATEGORIES.length);
  });
});

describe("movementWriteSchema", () => {
  it("acepta un movimiento válido y rellena nota y meta por defecto", () => {
    const parsed = movementWriteSchema.parse(validMovement);
    expect(parsed.note).toBe("");
    expect(parsed.goalId).toBeNull();
  });
  it("el monto debe ser un número positivo", () => {
    for (const amount of [0, -5, 12.5, "2000", null, Number.NaN]) {
      expect(movementWriteSchema.safeParse({ ...validMovement, amount }).success, String(amount)).toBe(false);
    }
  });
  it("valida tipo y formato de fecha", () => {
    expect(movementWriteSchema.safeParse({ ...validMovement, type: "otro" }).success).toBe(false);
    expect(movementWriteSchema.safeParse({ ...validMovement, date: "12/10/2026" }).success).toBe(false);
    expect(movementWriteSchema.safeParse({ ...validMovement, date: "2026-02-31" }).success).toBe(false);
  });
  it("exige las horas de sincronización", () => {
    const { clientUpdatedAt, ...sinHora } = validMovement;
    void clientUpdatedAt;
    expect(movementWriteSchema.safeParse(sinHora).success).toBe(false);
  });
  it("limita la nota", () => {
    expect(movementWriteSchema.safeParse({ ...validMovement, note: "x".repeat(201) }).success).toBe(false);
  });
});

describe("categoryWriteSchema / goalWriteSchema", () => {
  it("la categoría exige nombre y tipo; el presupuesto es opcional pero positivo", () => {
    expect(categoryWriteSchema.safeParse({ name: " ", type: "expense", ...sync }).success).toBe(false);
    expect(categoryWriteSchema.parse({ name: "Bus", type: "expense", ...sync }).monthlyBudget).toBeNull();
    expect(
      categoryWriteSchema.safeParse({ name: "Bus", type: "expense", monthlyBudget: -1, ...sync }).success,
    ).toBe(false);
  });
  it("la meta exige monto objetivo positivo y fecha límite válida", () => {
    const meta = { name: "Portátil", targetAmount: 2_000_000, deadline: "2027-03-01", ...sync };
    expect(goalWriteSchema.safeParse(meta).success).toBe(true);
    expect(goalWriteSchema.safeParse({ ...meta, targetAmount: 0 }).success).toBe(false);
    expect(goalWriteSchema.safeParse({ ...meta, deadline: "pronto" }).success).toBe(false);
    expect(goalWriteSchema.safeParse({ ...meta, name: "" }).success).toBe(false);
  });
});

describe("changesQuerySchema", () => {
  it("valida updatedSince como fecha ISO", () => {
    expect(changesQuerySchema.safeParse({ updatedSince: "2026-10-12T10:00:00.000Z" }).success).toBe(true);
    expect(changesQuerySchema.safeParse({ updatedSince: "ayer" }).success).toBe(false);
    expect(changesQuerySchema.safeParse({}).success).toBe(true);
  });
});
