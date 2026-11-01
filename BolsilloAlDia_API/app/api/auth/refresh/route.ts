import { parseBody, route } from "@/lib/http";
import { refreshSchema } from "@/lib/schemas";
import { refresh } from "@/lib/services/auth";

export const POST = route(async (request) => {
  const { refreshToken } = await parseBody(request, refreshSchema);
  return Response.json(await refresh(refreshToken));
});
