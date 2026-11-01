import { route } from "@/lib/http";
import { handleDelete, handleGet, handlePut } from "@/lib/services/resources";

type Ctx = RouteContext<"/api/movements/[id]">;

export const GET = route(async (request, ctx: Ctx) =>
  handleGet(request, "movement", (await ctx.params).id),
);

/**
 * PUT crea o actualiza un movimiento. El id lo genera la app (UUID), así que reenviar el mismo
 * movimiento tras perder la respuesta NUNCA lo duplica. 409 INVALID_REFERENCE si su categoría
 * o meta ya no existe.
 */
export const PUT = route(async (request, ctx: Ctx) =>
  handlePut(request, "movement", (await ctx.params).id),
);

export const DELETE = route(async (request, ctx: Ctx) =>
  handleDelete(request, "movement", (await ctx.params).id),
);
