/**
 * Especificación OpenAPI 3.1 de la API, GENERADA a partir de los esquemas Zod.
 *
 * Los cuerpos y parámetros de entrada salen de lib/schemas.ts (los mismos que validan cada ruta),
 * así que la documentación no puede contradecir al código. Las rutas y métodos documentados se
 * comparan con los archivos route.ts en tests/openapi.test.ts: si agregas una ruta y olvidas
 * documentarla, la prueba falla.
 */
import { z } from "zod";
import {
  categoryWriteSchema,
  changesQuerySchema,
  goalWriteSchema,
  loginSchema,
  movementWriteSchema,
  refreshSchema,
  registerSchema,
} from "./schemas";

type Json = Record<string, unknown>;

/** Convierte un esquema Zod a JSON Schema (sin el campo $schema, que sobra dentro de OpenAPI). */
function toSchema(schema: z.ZodType, io: "input" | "output" = "input"): Json {
  const { $schema, ...rest } = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io,
    unrepresentable: "any",
  }) as Json;
  void $schema;
  return rest;
}

/** El correo se normaliza antes de validarse (recorte y minúsculas); aquí se documenta como email. */
function withEmailFormat(schema: Json): Json {
  const props = schema.properties as Record<string, Json> | undefined;
  if (props?.email) props.email = { ...props.email, format: "email" };
  return schema;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

// ───────────────────────────── Esquemas de respuesta ─────────────────────────────

const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "FORBIDDEN",
  "NOT_FOUND",
  "EMAIL_IN_USE",
  "INVALID_REFERENCE",
  "RATE_LIMITED",
  "CONFIG_ERROR",
  "INTERNAL_ERROR",
] as const;

const iso = z.string().meta({ format: "date-time" });
const date = z.string().meta({ format: "date" });
const movementType = z.enum(["expense", "income"]);

const User = z.object({
  uid: z.string(),
  email: z.string().meta({ format: "email" }),
  name: z.string(),
});

const AuthResult = z.object({
  tokens: z.object({
    idToken: z.string().describe("JWT de Firebase; se envía como Authorization: Bearer <idToken>"),
    refreshToken: z.string().describe("Sirve para pedir un idToken nuevo en /api/auth/refresh"),
    expiresIn: z.number().int().describe("Segundos de vigencia del idToken"),
  }),
  user: User,
});

const syncMeta = {
  createdAt: iso,
  clientUpdatedAt: iso.describe("Hora del dispositivo del último cambio (regla de conflictos)"),
  updatedAt: iso.describe("Hora del servidor al guardar: cursor de la sincronización"),
};

const Category = z.object({
  id: z.string(),
  name: z.string(),
  type: movementType,
  monthlyBudget: z.number().int().nullable(),
  ...syncMeta,
});
const Goal = z.object({
  id: z.string(),
  name: z.string(),
  targetAmount: z.number().int(),
  deadline: date,
  ...syncMeta,
});
const Movement = z.object({
  id: z.string(),
  amount: z.number().int(),
  type: movementType,
  categoryId: z.string(),
  goalId: z.string().nullable(),
  date,
  note: z.string(),
  ...syncMeta,
});
const Tombstone = z
  .object({
    id: z.string(),
    deleted: z.literal(true),
    deletedAt: iso,
    updatedAt: iso,
  })
  .describe("Registro eliminado: la app debe borrarlo de su copia local");

const ErrorBody = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

// ───────────────────────────── Piezas reutilizables ─────────────────────────────

const json = (schema: Json) => ({ "application/json": { schema } });
const bearer = [{ bearerAuth: [] }];

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[A-Za-z0-9_-]{8,100}$" },
  description: "Identificador del registro, generado por la app (UUID)",
};

/** Convierte las propiedades de un esquema de query en parámetros OpenAPI. */
function queryParams(schema: z.ZodType): Json[] {
  const props = (toSchema(schema).properties ?? {}) as Record<string, Json>;
  return Object.entries(props).map(([name, s]) => ({
    name,
    in: "query",
    required: false,
    schema: s,
  }));
}

const errorResponse = (description: string) => ({
  description,
  content: json(ref("ErrorBody")),
});

const RESPONSES = {
  BadRequest: errorResponse("Datos inválidos (VALIDATION_ERROR)"),
  Unauthorized: errorResponse("Falta el token o es inválido o expiró (UNAUTHENTICATED)"),
  NotFound: errorResponse("El registro no existe o fue eliminado (NOT_FOUND)"),
  Conflict: errorResponse(
    "La categoría o la meta del movimiento no existe, fue eliminada o no coincide el tipo (INVALID_REFERENCE)",
  ),
};
const r = (name: keyof typeof RESPONSES) => ({ $ref: `#/components/responses/${name}` });

const listOf = (schemaName: string) =>
  json({
    type: "object",
    properties: {
      items: { type: "array", items: { oneOf: [ref(schemaName), ref("Tombstone")] } },
      serverTime: { type: "string", format: "date-time" },
    },
  });

const writeResult = (schemaName: string) =>
  json({
    type: "object",
    properties: {
      item: { oneOf: [ref(schemaName), ref("Tombstone")] },
      applied: {
        type: "boolean",
        description:
          "false si el servidor conservó su versión (la edición era más vieja, o el registro ya estaba eliminado)",
      },
    },
  });

/** Las tres entidades financieras tienen exactamente las mismas operaciones. */
function resourcePaths(opts: {
  base: string;
  tag: string;
  singular: string;
  plural: string;
  schemaName: string;
  writeSchema: z.ZodType;
  hasReferences?: boolean;
}): Record<string, Json> {
  const { base, tag, singular, plural, schemaName, writeSchema, hasReferences } = opts;
  return {
    [base]: {
      get: {
        tags: [tag],
        summary: `Lista los cambios de ${plural}`,
        description:
          "Devuelve los registros del usuario modificados después de `updatedSince` (todos si se omite), " +
          "incluidas las lápidas de los eliminados. `serverTime` se toma ANTES de consultar y es el valor " +
          "para la próxima llamada (cursor de la sincronización incremental).",
        security: bearer,
        parameters: queryParams(changesQuerySchema),
        responses: {
          "200": { description: "Cambios y hora del servidor", content: listOf(schemaName) },
          "400": r("BadRequest"),
          "401": r("Unauthorized"),
        },
      },
    },
    [`${base}/{id}`]: {
      get: {
        tags: [tag],
        summary: `Obtiene ${singular}`,
        security: bearer,
        parameters: [idParam],
        responses: {
          "200": {
            description: "El registro",
            content: json({ type: "object", properties: { item: ref(schemaName) } }),
          },
          "401": r("Unauthorized"),
          "404": r("NotFound"),
        },
      },
      put: {
        tags: [tag],
        summary: `Crea o actualiza ${singular}`,
        description:
          "IDEMPOTENTE: el id lo genera la app, así que repetir la misma petición no duplica nada. " +
          "Regla de conflictos: la edición con `clientUpdatedAt` más reciente gana; un registro eliminado " +
          "nunca se revive (`applied: false`)." +
          (hasReferences
            ? " Responde 409 si la categoría o la meta indicada no existe o fue eliminada."
            : ""),
        security: bearer,
        parameters: [idParam],
        requestBody: { required: true, content: json(toSchema(writeSchema)) },
        responses: {
          "200": { description: "Resultado de la escritura", content: writeResult(schemaName) },
          "400": r("BadRequest"),
          "401": r("Unauthorized"),
          ...(hasReferences ? { "409": r("Conflict") } : {}),
        },
      },
      delete: {
        tags: [tag],
        summary: `Elimina ${singular}`,
        description:
          "Deja una lápida para que los demás dispositivos lo borren. Repetirlo no tiene efecto.",
        security: bearer,
        parameters: [idParam],
        responses: {
          "200": { description: "Resultado del borrado", content: writeResult(schemaName) },
          "401": r("Unauthorized"),
        },
      },
    },
  };
}

// ───────────────────────────── Documento ─────────────────────────────

export function buildOpenApiSpec(): Json {
  return {
    openapi: "3.1.0",
    info: {
      title: "API de BolsilloAlDía",
      version: "1.0.0",
      description: [
        "API REST de BolsilloAlDía: autenticación con Firebase y sincronización de categorías, metas de ahorro y movimientos.",
        "",
        "**Cómo probarla desde esta página:** 1) ejecuta `POST /api/auth/register` o `POST /api/auth/login`;",
        "2) copia el `idToken` de la respuesta; 3) pulsa **Authorize** y pégalo (sin la palabra Bearer). El token dura 1 hora.",
        "",
        "Los errores siempre tienen la forma `{ error: { code, message } }`.",
        "",
        "**Sincronización:** la app trabaja sin conexión y envía sus cambios con `PUT`/`DELETE` (idempotentes por `id`); " +
          "luego descarga los cambios con `GET ?updatedSince=`. Regla de conflictos: la última edición gana y borrar gana siempre.",
      ].join("\n"),
    },
    servers: [{ url: "/", description: "El mismo servidor que sirve esta documentación" }],
    tags: [
      { name: "Sistema" },
      { name: "Autenticación" },
      { name: "Categorías" },
      { name: "Metas" },
      { name: "Movimientos" },
    ],
    paths: {
      "/api/health": {
        get: {
          tags: ["Sistema"],
          summary: "Comprueba que el servidor responde",
          security: [],
          responses: {
            "200": {
              description: "Servidor activo",
              content: json({
                type: "object",
                properties: { status: { const: "ok" }, service: { type: "string" } },
              }),
            },
          },
        },
      },
      "/api/openapi.json": {
        get: {
          tags: ["Sistema"],
          summary: "Esta especificación OpenAPI",
          security: [],
          responses: {
            "200": { description: "Documento OpenAPI 3.1", content: json({ type: "object" }) },
          },
        },
      },
      "/api/docs": {
        get: {
          tags: ["Sistema"],
          summary: "Documentación interactiva (Swagger UI)",
          security: [],
          responses: {
            "200": {
              description: "Página HTML",
              content: { "text/html": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/api/auth/register": {
        post: {
          tags: ["Autenticación"],
          summary: "Crea una cuenta",
          description: "Crea la cuenta, sus categorías iniciales e inicia sesión.",
          security: [],
          requestBody: { required: true, content: json(withEmailFormat(toSchema(registerSchema))) },
          responses: {
            "201": {
              description: "Cuenta creada e inicio de sesión",
              content: json(ref("AuthResult")),
            },
            "400": r("BadRequest"),
            "409": errorResponse("Ya existe una cuenta con ese correo (EMAIL_IN_USE)"),
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Autenticación"],
          summary: "Inicia sesión con correo y contraseña",
          security: [],
          requestBody: { required: true, content: json(withEmailFormat(toSchema(loginSchema))) },
          responses: {
            "200": { description: "Tokens y usuario", content: json(ref("AuthResult")) },
            "400": r("BadRequest"),
            "401": errorResponse("Correo o contraseña incorrectos (INVALID_CREDENTIALS)"),
          },
        },
      },
      "/api/auth/refresh": {
        post: {
          tags: ["Autenticación"],
          summary: "Cambia un refreshToken por un idToken nuevo",
          security: [],
          requestBody: { required: true, content: json(toSchema(refreshSchema)) },
          responses: {
            "200": { description: "Tokens nuevos", content: json(ref("AuthResult")) },
            "400": r("BadRequest"),
            "401": errorResponse("refreshToken inválido (INVALID_CREDENTIALS)"),
          },
        },
      },
      "/api/auth/me": {
        get: {
          tags: ["Autenticación"],
          summary: "Usuario de la sesión actual",
          security: bearer,
          responses: {
            "200": {
              description: "Usuario",
              content: json({ type: "object", properties: { user: ref("User") } }),
            },
            "401": r("Unauthorized"),
          },
        },
      },
      ...resourcePaths({
        base: "/api/categories",
        tag: "Categorías",
        singular: "una categoría",
        plural: "las categorías",
        schemaName: "Category",
        writeSchema: categoryWriteSchema,
      }),
      ...resourcePaths({
        base: "/api/goals",
        tag: "Metas",
        singular: "una meta de ahorro",
        plural: "las metas de ahorro",
        schemaName: "Goal",
        writeSchema: goalWriteSchema,
      }),
      ...resourcePaths({
        base: "/api/movements",
        tag: "Movimientos",
        singular: "un movimiento",
        plural: "los movimientos",
        schemaName: "Movement",
        writeSchema: movementWriteSchema,
        hasReferences: true,
      }),
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "idToken de Firebase",
        },
      },
      schemas: {
        User: toSchema(User, "output"),
        AuthResult: toSchema(AuthResult, "output"),
        Category: toSchema(Category, "output"),
        Goal: toSchema(Goal, "output"),
        Movement: toSchema(Movement, "output"),
        Tombstone: toSchema(Tombstone, "output"),
        ErrorBody: toSchema(ErrorBody, "output"),
      },
      responses: RESPONSES,
    },
  };
}
