import { buildOpenApiSpec } from "@/lib/openapi";

/**
 * GET /api/openapi.json — la especificación OpenAPI, generada desde los esquemas Zod.
 * No lee nada de la petición, así que Next la prerenderiza una sola vez al compilar.
 */
export async function GET() {
  return Response.json(buildOpenApiSpec());
}
