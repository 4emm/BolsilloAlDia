import "server-only";
import type { ZodType } from "zod";
import { deleteRecord, getRecord, listChanges, upsertRecord } from "../data/records";
import { requireUser } from "../guard";
import { parseBody, parseQuery } from "../http";
import {
  categoryWriteSchema,
  changesQuerySchema,
  goalWriteSchema,
  idSchema,
  movementWriteSchema,
} from "../schemas";
import type { EntityKind } from "../types";

/**
 * Los tres recursos (categorías, metas y movimientos) se comportan igual para la sincronización,
 * así que comparten los mismos manejadores. Cada route.ts solo dice de cuál recurso se trata.
 */
const WRITE_SCHEMAS: Record<EntityKind, ZodType<Record<string, unknown> & { createdAt: string; clientUpdatedAt: string }>> = {
  category: categoryWriteSchema,
  goal: goalWriteSchema,
  movement: movementWriteSchema,
};

type Rec = { id: string; updatedAt: string };

/** GET /api/<recurso>?updatedSince= — cambios desde el cursor (incluye lápidas de eliminados). */
export async function handleList(request: Request, kind: EntityKind): Promise<Response> {
  const user = await requireUser(request);
  const { updatedSince } = parseQuery(request, changesQuerySchema);
  return Response.json(await listChanges<Rec>(user.uid, kind, updatedSince));
}

/** GET /api/<recurso>/{id} */
export async function handleGet(request: Request, kind: EntityKind, id: string): Promise<Response> {
  const user = await requireUser(request);
  return Response.json({ item: await getRecord<Rec>(user.uid, kind, idSchema.parse(id)) });
}

/** PUT /api/<recurso>/{id} — crea o actualiza; idempotente por id. */
export async function handlePut(request: Request, kind: EntityKind, id: string): Promise<Response> {
  const user = await requireUser(request);
  const safeId = idSchema.parse(id);
  const body = await parseBody(request, WRITE_SCHEMAS[kind]);
  return Response.json(await upsertRecord<Rec>(user.uid, kind, safeId, body));
}

/** DELETE /api/<recurso>/{id} — deja una lápida; repetirlo no tiene efecto. */
export async function handleDelete(
  request: Request,
  kind: EntityKind,
  id: string,
): Promise<Response> {
  const user = await requireUser(request);
  return Response.json(await deleteRecord<Rec>(user.uid, kind, idSchema.parse(id)));
}
