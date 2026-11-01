import { route } from "@/lib/http";
import { handleList } from "@/lib/services/resources";

/** GET /api/movements?updatedSince= — cambios de los movimientos del usuario desde el cursor. */
export const GET = route(async (request) => handleList(request, "movement"));
