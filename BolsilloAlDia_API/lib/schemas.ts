import { z } from "zod";

// Mensajes de validación por defecto en español (ej. "Invalid input" → "Entrada inválida").
z.config(z.locales.es());

/** Primero se normaliza (los teclados móviles añaden espacios al autocompletar) y luego se valida. */
const emailField = z.string().trim().toLowerCase().pipe(z.email("Correo inválido"));

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export const registerSchema = z.object({
  email: emailField,
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  displayName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(80),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ───────────────────────────── Datos financieros ─────────────────────────────

/**
 * Identificador del registro, GENERADO EN EL DISPOSITIVO (UUID). Es la llave de idempotencia:
 * el servidor lo usa como id del documento, así que reenviar el mismo registro nunca lo duplica.
 * Solo admite letras, números, - y _ porque forma parte de la ruta y del id del documento.
 */
export const idSchema = z
  .string()
  .min(8, "Identificador inválido")
  .max(100, "Identificador inválido")
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador inválido");

/** Monto en pesos enteros, positivo. (Sin decimales: evita errores de redondeo al sumar.) */
export const MAX_AMOUNT = 999_999_999_999;
const amount = z
  .number("El monto debe ser un número")
  .int("El monto debe ser un número entero de pesos")
  .positive("El monto debe ser mayor que cero")
  .max(MAX_AMOUNT, "El monto es demasiado grande");

const movementType = z.enum(["expense", "income"], "El tipo debe ser gasto o ingreso");
const isoDateTime = z.iso.datetime({ message: "Fecha y hora inválidas (ISO 8601)" });
const isoDate = z.iso.date("La fecha debe tener el formato AAAA-MM-DD");
const name = (label: string) =>
  z.string().trim().min(1, `${label} es obligatorio`).max(60, `${label} es demasiado largo`);

/** Campos que acompañan cada escritura para la sincronización (los pone la app). */
const syncFields = {
  /** Cuándo se creó el registro en el dispositivo. */
  createdAt: isoDateTime,
  /** Cuándo se hizo este cambio en el dispositivo (regla de conflictos: la edición más reciente gana). */
  clientUpdatedAt: isoDateTime,
};

export const categoryWriteSchema = z.object({
  name: name("El nombre"),
  type: movementType,
  monthlyBudget: amount.nullable().default(null),
  ...syncFields,
});

export const goalWriteSchema = z.object({
  name: name("El nombre"),
  targetAmount: amount,
  deadline: isoDate,
  ...syncFields,
});

export const movementWriteSchema = z.object({
  amount,
  type: movementType,
  categoryId: idSchema,
  goalId: idSchema.nullable().default(null),
  date: isoDate,
  note: z.string().trim().max(200, "La nota es demasiado larga").default(""),
  ...syncFields,
});

export const changesQuerySchema = z.object({
  /** Cursor: solo se devuelven los registros modificados después de esta hora del servidor. */
  updatedSince: z.iso.datetime().optional(),
});
