import { route } from "@/lib/http";
import { handleDelete, handleGet, handlePut } from "@/lib/services/resources";

type Ctx = RouteContext<"/api/categories/[id]">;

export const GET = route(async (request, ctx: Ctx) =>
  handleGet(request, "category", (await ctx.params).id),
);

/** PUT crea o actualiza (idempotente: el id lo genera la app). */
export const PUT = route(async (request, ctx: Ctx) =>
  handlePut(request, "category", (await ctx.params).id),
);

export const DELETE = route(async (request, ctx: Ctx) =>
  handleDelete(request, "category", (await ctx.params).id),
);
