import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError } from "./errors";

/** Convierte cualquier excepción en la respuesta JSON uniforme { error: { code, message } }. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues[0]?.message ?? "Datos inválidos",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  console.error("[api] error no controlado:", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } },
    { status: 500 },
  );
}

type Handler<C> = (request: Request, ctx: C) => Promise<Response>;

/** Envuelve un Route Handler para unificar el manejo de errores. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      // Next usa excepciones internas (p. ej. al leer request.headers durante el prerender):
      // no son errores de la aplicación y deben llegar intactas al framework.
      unstable_rethrow(err);
      return errorResponse(err);
    }
  };
}

/** Lee y valida el cuerpo JSON de la petición. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "El cuerpo debe ser JSON válido");
  }
  return schema.parse(raw);
}

/** Valida los query params de la URL. */
export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return schema.parse(params);
}
