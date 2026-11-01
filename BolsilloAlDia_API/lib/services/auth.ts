import "server-only";
import { adminAuth, db } from "../firebase";
import { createDefaultCategories, USERS } from "../data/records";
import { getEnv } from "../env";
import { ApiError } from "../errors";
import type { AuthUser, TokenSet } from "../types";

/**
 * Con los emuladores de Firebase las APIs REST de Auth viven en el host del emulador
 * (con el prefijo del dominio de Google); en producción son las URL públicas de Google.
 */
function identityBase(): string {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  return host
    ? `http://${host}/identitytoolkit.googleapis.com/v1`
    : "https://identitytoolkit.googleapis.com/v1";
}
function secureTokenBase(): string {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  return host
    ? `http://${host}/securetoken.googleapis.com/v1`
    : "https://securetoken.googleapis.com/v1";
}

export interface AuthResult {
  tokens: TokenSet;
  user: AuthUser;
}

function toAuthUser(decoded: { uid: string; email?: string; name?: string }): AuthUser {
  return {
    uid: decoded.uid,
    email: decoded.email ?? "",
    name: decoded.name ?? decoded.email ?? "Usuario",
  };
}

/** Verifica un idToken de Firebase (Authorization: Bearer ...). */
export async function verifyIdToken(idToken: string): Promise<AuthUser> {
  try {
    return toAuthUser(await adminAuth().verifyIdToken(idToken));
  } catch {
    throw new ApiError(401, "UNAUTHENTICATED", "Sesión inválida o expirada");
  }
}

async function firebaseRest<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) {
    const code = body.error?.message ?? "UNKNOWN";
    // Un error de credenciales se traduce siempre al mismo mensaje: no revela si el correo existe.
    if (
      code.startsWith("INVALID_LOGIN_CREDENTIALS") ||
      code.startsWith("INVALID_PASSWORD") ||
      code.startsWith("EMAIL_NOT_FOUND") ||
      code.startsWith("INVALID_REFRESH_TOKEN") ||
      code.startsWith("TOKEN_EXPIRED")
    ) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos");
    }
    if (code.startsWith("USER_DISABLED")) {
      throw new ApiError(403, "FORBIDDEN", "Tu cuenta está deshabilitada");
    }
    if (code.startsWith("TOO_MANY_ATTEMPTS")) {
      throw new ApiError(429, "RATE_LIMITED", "Demasiados intentos, espera un momento");
    }
    throw new ApiError(502, "INTERNAL_ERROR", "Error al contactar el servicio de autenticación");
  }
  return body;
}

/** Login con correo y contraseña usando la API REST de Firebase Auth. */
export async function login(email: string, password: string): Promise<AuthResult> {
  const key = getEnv().FIREBASE_WEB_API_KEY;
  const data = await firebaseRest<{ idToken: string; refreshToken: string; expiresIn: string }>(
    `${identityBase()}/accounts:signInWithPassword?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  return {
    tokens: {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: Number(data.expiresIn),
    },
    user: await verifyIdToken(data.idToken),
  };
}

/** Intercambia el refreshToken por un idToken nuevo (la app lo usa al recibir 401). */
export async function refresh(refreshToken: string): Promise<AuthResult> {
  const key = getEnv().FIREBASE_WEB_API_KEY;
  const data = await firebaseRest<{ id_token: string; refresh_token: string; expires_in: string }>(
    `${secureTokenBase()}/token?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    },
  );
  return {
    tokens: {
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresIn: Number(data.expires_in),
    },
    user: await verifyIdToken(data.id_token),
  };
}

/** Registro público: crea la cuenta, sus categorías iniciales y abre sesión. */
export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  const auth = adminAuth();
  try {
    const created = await auth.createUser({ email, password, displayName });
    await db().collection(USERS).doc(created.uid).set({
      email,
      displayName,
      createdAt: new Date().toISOString(),
    });
    await createDefaultCategories(created.uid);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      throw new ApiError(409, "EMAIL_IN_USE", "Ya existe una cuenta con ese correo");
    }
    if (code === "auth/invalid-password" || code === "auth/invalid-email") {
      throw new ApiError(400, "VALIDATION_ERROR", "Correo o contraseña inválidos");
    }
    throw err;
  }
  return login(email, password);
}
