import { describe, expect, it } from "vitest";
import {
  assertMovementReferences,
  clampClientTime,
  decideWrite,
  MAX_CLOCK_SKEW_MS,
} from "@/lib/domain/sync-rules";
import { ApiError } from "@/lib/errors";

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as ApiError).code;
  }
};

describe("decideWrite", () => {
  const t = (m: number) => new Date(Date.UTC(2026, 9, 12, 10, m)).toISOString();

  it("crea cuando el servidor no conoce el registro", () => {
    expect(decideWrite(null, t(0))).toBe("create");
  });
  it("aplica una edición más reciente o igual", () => {
    expect(decideWrite({ clientUpdatedAt: t(5) }, t(10))).toBe("apply");
    expect(decideWrite({ clientUpdatedAt: t(5) }, t(5))).toBe("apply");
  });
  it("descarta una edición más vieja", () => {
    expect(decideWrite({ clientUpdatedAt: t(10) }, t(5))).toBe("stale");
  });
  it("un registro eliminado nunca se revive, sin importar la fecha", () => {
    expect(decideWrite({ deleted: true, clientUpdatedAt: t(1) }, t(999))).toBe("deleted");
  });
});

describe("clampClientTime", () => {
  const now = new Date("2026-10-12T10:00:00.000Z");
  it("conserva una hora válida del pasado", () => {
    expect(clampClientTime("2026-10-12T09:00:00Z", now)).toBe("2026-10-12T09:00:00.000Z");
  });
  it("tolera un pequeño adelanto del reloj", () => {
    const ok = new Date(now.getTime() + MAX_CLOCK_SKEW_MS - 1000).toISOString();
    expect(clampClientTime(ok, now)).toBe(ok);
  });
  it("recorta una hora del futuro lejano al ahora del servidor", () => {
    expect(clampClientTime("2031-01-01T00:00:00.000Z", now)).toBe(now.toISOString());
  });
  it("usa el ahora del servidor si la hora es ilegible", () => {
    expect(clampClientTime("no es fecha", now)).toBe(now.toISOString());
  });
});

describe("assertMovementReferences", () => {
  const mov = { type: "expense" as const, categoryId: "c1", goalId: null };

  it("acepta una categoría válida del mismo tipo", () => {
    expect(() => assertMovementReferences(mov, { type: "expense" }, null)).not.toThrow();
  });
  it("rechaza categoría inexistente o eliminada", () => {
    expect(codeOf(() => assertMovementReferences(mov, null, null))).toBe("INVALID_REFERENCE");
    expect(codeOf(() => assertMovementReferences(mov, { type: "expense", deleted: true }, null))).toBe(
      "INVALID_REFERENCE",
    );
  });
  it("rechaza si el tipo no coincide con el de la categoría", () => {
    expect(codeOf(() => assertMovementReferences(mov, { type: "income" }, null))).toBe("INVALID_REFERENCE");
  });
  it("exige que la meta exista cuando es un aporte", () => {
    const aporte = { ...mov, goalId: "g1" };
    expect(codeOf(() => assertMovementReferences(aporte, { type: "expense" }, null))).toBe("INVALID_REFERENCE");
    expect(
      codeOf(() => assertMovementReferences(aporte, { type: "expense" }, { deleted: true })),
    ).toBe("INVALID_REFERENCE");
    expect(() => assertMovementReferences(aporte, { type: "expense" }, {})).not.toThrow();
  });
  it("solo un gasto puede ser aporte a una meta", () => {
    const ingreso = { type: "income" as const, categoryId: "c1", goalId: "g1" };
    expect(codeOf(() => assertMovementReferences(ingreso, { type: "income" }, {}))).toBe("INVALID_REFERENCE");
  });
});
