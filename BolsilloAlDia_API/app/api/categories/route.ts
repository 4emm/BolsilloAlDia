import { route } from "@/lib/http";
import { handleList } from "@/lib/services/resources";

/** GET /api/categories?updatedSince= — cambios de las categorías del usuario desde el cursor. */
export const GET = route(async (request) => handleList(request, "category"));
