/**
 * Reglas de sincronización y de integridad. Son funciones puras (sin Firebase ni red):
 * se prueban en milisegundos y son la ÚNICA definición de la regla de resolución de conflictos.
 *
 * REGLA DE CONFLICTOS ("la última edición gana, y borrar gana siempre"):
 *  1. Cada cambio viaja con `clientUpdatedAt`: la hora del dispositivo en que el usuario lo hizo.
 *  2. Si el servidor ya tiene una versión con `clientUpdatedAt` MÁS RECIENTE, el cambio entrante
 *     es viejo ("stale"): se descarta y se devuelve la versión del servidor.
 *  3. Si el registro fue eliminado, nada lo revive: ni una edición tardía ni un reintento.
 *  4. Repetir exactamente la misma escritura da el mismo resultado (idempotencia).
 *
 * Por qué: los datos son personales y casi siempre los edita una sola persona; los choques
 * reales son raros (dos dispositivos del mismo dueño). "Última edición gana" es determinista,
 * fácil de explicar y no exige que el servidor calcule totales: la app los recalcula con sus datos.
 */
import { ApiError } from "../errors";
import type { MovementType } from "../types";

export type WriteDecision = "create" | "apply" | "stale" | "deleted";

/** Tolerancia al reloj adelantado de un dispositivo: no se acepta una "edición del futuro". */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface ExistingMeta {
  deleted?: boolean;
  clientUpdatedAt?: string;
}

export function decideWrite(existing: ExistingMeta | null, incomingClientUpdatedAt: string): WriteDecision {
  if (!existing) return "create";
  if (existing.deleted) return "deleted";
  const current = Date.parse(existing.clientUpdatedAt ?? "");
  const incoming = Date.parse(incomingClientUpdatedAt);
  if (Number.isFinite(current) && incoming < current) return "stale";
  return "apply";
}

/** Normaliza a ISO con milisegundos y recorta relojes adelantados al "ahora" del servidor. */
export function clampClientTime(iso: string, now: Date): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || t > now.getTime() + MAX_CLOCK_SKEW_MS) return now.toISOString();
  return new Date(t).toISOString();
}

export interface RefCategory {
  type: MovementType;
  deleted?: boolean;
}

/**
 * Un movimiento solo puede apuntar a una categoría existente (y del mismo tipo)
 * y, si es un aporte, a una meta existente. Si la categoría o la meta se eliminaron en otro
 * dispositivo, el servidor responde 409 y la app explica el motivo.
 */
export function assertMovementReferences(
  movement: { type: MovementType; categoryId: string; goalId: string | null },
  category: RefCategory | null,
  goal: { deleted?: boolean } | null,
): void {
  if (!category || category.deleted) {
    throw new ApiError(409, "INVALID_REFERENCE", "La categoría del movimiento no existe o fue eliminada");
  }
  if (category.type !== movement.type) {
    throw new ApiError(
      409,
      "INVALID_REFERENCE",
      "El tipo del movimiento no coincide con el tipo de la categoría",
    );
  }
  if (movement.goalId) {
    if (movement.type !== "expense") {
      throw new ApiError(409, "INVALID_REFERENCE", "Solo un gasto puede ser aporte a una meta");
    }
    if (!goal || goal.deleted) {
      throw new ApiError(409, "INVALID_REFERENCE", "La meta del aporte no existe o fue eliminada");
    }
  }
}
