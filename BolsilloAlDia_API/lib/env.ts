import { z } from "zod";
import { ApiError } from "./errors";

const envSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  /** "Web API Key" de la configuración del proyecto Firebase (para Auth REST). */
  FIREBASE_WEB_API_KEY: z.string().optional(),
  /** Si están definidas, la API usa los emuladores locales de Firebase en vez del proyecto real. */
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
});

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  FIREBASE_WEB_API_KEY: string;
  /** true cuando se trabaja contra los emuladores de Firebase (no necesita credenciales reales). */
  useEmulator: boolean;
}

let cached: Env | null = null;

/** Se valida de forma perezosa para que `next build` no exija secretos. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  const fail = (missing: string[]) => {
    throw new ApiError(
      500,
      "CONFIG_ERROR",
      `Faltan variables de entorno: ${missing.join(", ")}. Revisa .env`,
    );
  };
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.path.join(".")));
  const data = parsed.data;
  const useEmulator = !!data.FIREBASE_AUTH_EMULATOR_HOST;
  if (!useEmulator) {
    const missing = (
      ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_WEB_API_KEY"] as const
    ).filter((k) => !data[k]);
    if (missing.length > 0) return fail([...missing]);
  }
  cached = {
    FIREBASE_PROJECT_ID: data.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: data.FIREBASE_CLIENT_EMAIL ?? "",
    // En .env las saltos de línea de la llave privada llegan escapadas como \n
    FIREBASE_PRIVATE_KEY: (data.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    FIREBASE_WEB_API_KEY: data.FIREBASE_WEB_API_KEY ?? "emulator-key",
    useEmulator,
  };
  return cached;
}
