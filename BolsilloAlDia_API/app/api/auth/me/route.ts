import { requireUser } from "@/lib/guard";
import { route } from "@/lib/http";

export const GET = route(async (request) => {
  return Response.json({ user: await requireUser(request) });
});
