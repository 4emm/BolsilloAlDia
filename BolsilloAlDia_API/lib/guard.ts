import "server-only";
import { ApiError } from "./errors";
import { verifyIdToken } from "./services/auth";
import type { AuthUser } from "./types";

/**
 * Autenticación de la API móvil: Authorization: Bearer <idToken de Firebase>.
 * Todos los datos financieros cuelgan de `usuarios/{uid}`, así que el uid del token
 * es lo único que decide qué registros se ven: no existe forma de pedir los de otra persona.
 */
export async function requireUser(request: Request): Promise<AuthUser> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new ApiError(401, "UNAUTHENTICATED", "Falta el token de autenticación");
  }
  return verifyIdToken(token);
}
