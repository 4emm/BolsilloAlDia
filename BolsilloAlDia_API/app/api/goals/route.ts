import { route } from "@/lib/http";
import { handleList } from "@/lib/services/resources";

/** GET /api/goals?updatedSince= — cambios de las metas de ahorro del usuario desde el cursor. */
export const GET = route(async (request) => handleList(request, "goal"));
