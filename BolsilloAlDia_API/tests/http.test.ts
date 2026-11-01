import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { parseBody, route } from "@/lib/http";

describe("route()", () => {
  it("traduce ApiError a { error: { code, message } } con su status", async () => {
    const handler = route(async () => {
      throw new ApiError(409, "INVALID_REFERENCE", "La categoría ya no existe");
    });
    const res = await handler(new Request("http://x/api"), undefined);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: "INVALID_REFERENCE", message: "La categoría ya no existe" },
    });
  });

  it("traduce errores de validación a 400", async () => {
    const handler = route(async (req) => {
      await parseBody(req, z.object({ n: z.number() }));
      return Response.json({ ok: true });
    });
    const res = await handler(
      new Request("http://x/api", { method: "POST", body: JSON.stringify({ n: "a" }) }),
      undefined,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("responde 400 si el cuerpo no es JSON", async () => {
    const handler = route(async (req) => Response.json(await parseBody(req, z.object({}))));
    const res = await handler(new Request("http://x/api", { method: "POST", body: "no-json" }), undefined);
    expect(res.status).toBe(400);
  });

  it("oculta los detalles de errores inesperados", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = route(async () => {
      throw new Error("secreto interno de Firestore");
    });
    const res = await handler(new Request("http://x/api"), undefined);
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("secreto");
    spy.mockRestore();
  });
});
