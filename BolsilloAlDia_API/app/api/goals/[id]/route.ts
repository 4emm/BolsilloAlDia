import { route } from "@/lib/http";
import { handleDelete, handleGet, handlePut } from "@/lib/services/resources";

type Ctx = RouteContext<"/api/goals/[id]">;

export const GET = route(async (request, ctx: Ctx) =>
  handleGet(request, "goal", (await ctx.params).id),
);

/** PUT crea o actualiza (idempotente: el id lo genera la app). */
export const PUT = route(async (request, ctx: Ctx) =>
  handlePut(request, "goal", (await ctx.params).id),
);

export const DELETE = route(async (request, ctx: Ctx) =>
  handleDelete(request, "goal", (await ctx.params).id),
);
