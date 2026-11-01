import "server-only";
import type { DocumentData, Transaction } from "firebase-admin/firestore";
import { assertMovementReferences, clampClientTime, decideWrite } from "../domain/sync-rules";
import { DEFAULT_CATEGORIES } from "../domain/defaults";
import { ApiError } from "../errors";
import { db } from "../firebase";
import type { EntityKind, Synced, Tombstone } from "../types";

/**
 * Capa de datos de las tres entidades financieras. Es la única que conoce Firestore.
 *
 * Modelo (colecciones en español, como pide el proyecto):
 *   usuarios/{uid}                      → datos de la cuenta
 *   usuarios/{uid}/categorias/{id}      → categorías de gasto e ingreso
 *   usuarios/{uid}/metas/{id}           → metas de ahorro
 *   usuarios/{uid}/movimientos/{id}     → gastos e ingresos
 *   usuarios/{uid}/historial/{id}       → bitácora de cambios (auditoría)
 *
 * Decisiones:
 *  - Todo cuelga de `usuarios/{uid}`: una persona no puede leer ni escribir datos de otra,
 *    porque la ruta se arma con el uid del token verificado, nunca con datos de la petición.
 *  - El id del documento ES el id que el dispositivo generó (UUID). Repetir una escritura
 *    cae sobre el mismo documento: la sincronización es idempotente por construcción.
 *  - Borrar deja una "lápida" (tombstone) en vez de borrar el documento: así los demás
 *    dispositivos se enteran del borrado y ningún reintento puede revivir el registro.
 */
export const USERS = "usuarios";
export const COLLECTIONS: Record<EntityKind, string> = {
  category: "categorias",
  goal: "metas",
  movement: "movimientos",
};
const HISTORY = "historial";

const userRef = (uid: string) => db().collection(USERS).doc(uid);
const collectionOf = (uid: string, kind: EntityKind) =>
  userRef(uid).collection(COLLECTIONS[kind]);

type Rec = { id: string; updatedAt: string };

/** Documento tal como se guarda en Firestore (sin `id`, que es el id del documento). */
type StoredDoc = DocumentData;

/** Convierte un documento en lo que ve el cliente: el registro, o su lápida si fue eliminado. */
export function toRecord<T extends Rec>(id: string, data: StoredDoc): Synced<T> {
  if (data.deleted === true) {
    const tombstone: Tombstone = {
      id,
      deleted: true,
      deletedAt: data.deletedAt,
      updatedAt: data.updatedAt,
    };
    return tombstone;
  }
  return { id, ...data } as unknown as Synced<T>;
}

export interface Changes<T extends Rec> {
  items: Synced<T>[];
  /** Hora del servidor tomada ANTES de consultar: es el cursor de la próxima sincronización. */
  serverTime: string;
}

/** Registros (y lápidas) modificados después de `updatedSince`; sin cursor, todos. */
export async function listChanges<T extends Rec>(
  uid: string,
  kind: EntityKind,
  updatedSince?: string,
): Promise<Changes<T>> {
  const serverTime = new Date().toISOString();
  let query: FirebaseFirestore.Query = collectionOf(uid, kind);
  if (updatedSince) query = query.where("updatedAt", ">", updatedSince);
  const snap = await query.get();
  const items = snap.docs
    .map((d) => toRecord<T>(d.id, d.data()))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return { items, serverTime };
}

export async function getRecord<T extends Rec>(
  uid: string,
  kind: EntityKind,
  id: string,
): Promise<T> {
  const snap = await collectionOf(uid, kind).doc(id).get();
  const data = snap.data();
  if (!snap.exists || !data || data.deleted === true) {
    throw new ApiError(404, "NOT_FOUND", "Registro no encontrado");
  }
  return toRecord<T>(snap.id, data) as T;
}

export interface WriteResult<T extends Rec> {
  item: Synced<T>;
  /** false cuando el servidor conservó su versión (cambio viejo o registro eliminado). */
  applied: boolean;
}

const historyId = (kind: EntityKind, id: string, action: string, stamp: string) =>
  `${kind}_${id}_${action}_${stamp.replace(/[^0-9A-Za-z]/g, "")}`;

/** Lee categoría y meta de un movimiento DENTRO de la transacción y valida las referencias. */
async function checkMovementReferences(tx: Transaction, uid: string, input: StoredDoc) {
  const [cat, goal] = await Promise.all([
    tx.get(collectionOf(uid, "category").doc(input.categoryId)),
    input.goalId ? tx.get(collectionOf(uid, "goal").doc(input.goalId)) : Promise.resolve(null),
  ]);
  assertMovementReferences(
    input as { type: "expense" | "income"; categoryId: string; goalId: string | null },
    cat.exists ? (cat.data() as { type: "expense" | "income"; deleted?: boolean }) : null,
    goal && goal.exists ? (goal.data() as { deleted?: boolean }) : null,
  );
}

/**
 * Crea o actualiza un registro de forma idempotente (PUT /api/<recurso>/{id}).
 * Aplica la regla de conflictos de lib/domain/sync-rules.ts dentro de una transacción.
 */
export async function upsertRecord<T extends Rec>(
  uid: string,
  kind: EntityKind,
  id: string,
  input: StoredDoc & { createdAt: string; clientUpdatedAt: string },
): Promise<WriteResult<T>> {
  const firestore = db();
  const ref = collectionOf(uid, kind).doc(id);
  const now = new Date();
  const nowIso = now.toISOString();
  const clientUpdatedAt = clampClientTime(input.clientUpdatedAt, now);

  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data() as StoredDoc) : null;
    const decision = decideWrite(existing, clientUpdatedAt);

    // Cambio viejo o registro eliminado: gana lo que ya está en el servidor.
    if (decision === "stale" || decision === "deleted") {
      return { item: toRecord<T>(id, existing!), applied: false };
    }
    // Reintento idéntico (misma edición): no se escribe nada, así `updatedAt` no cambia.
    if (existing && existing.clientUpdatedAt === clientUpdatedAt) {
      return { item: toRecord<T>(id, existing), applied: true };
    }
    if (kind === "movement") await checkMovementReferences(tx, uid, input);

    const doc: StoredDoc = {
      ...input,
      createdAt: existing?.createdAt ?? input.createdAt,
      clientUpdatedAt,
      updatedAt: nowIso,
    };
    tx.set(ref, doc);
    const action = existing ? "update" : "create";
    tx.set(userRef(uid).collection(HISTORY).doc(historyId(kind, id, action, clientUpdatedAt)), {
      entity: kind,
      entityId: id,
      action,
      at: nowIso,
      clientUpdatedAt,
    });
    return { item: toRecord<T>(id, doc), applied: true };
  });
}

/** Elimina un registro dejando una lápida (DELETE /api/<recurso>/{id}). Es idempotente. */
export async function deleteRecord<T extends Rec>(
  uid: string,
  kind: EntityKind,
  id: string,
): Promise<WriteResult<T>> {
  const firestore = db();
  const ref = collectionOf(uid, kind).doc(id);
  const nowIso = new Date().toISOString();

  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data() as StoredDoc) : null;
    if (existing?.deleted === true) return { item: toRecord<T>(id, existing), applied: false };

    // Se reemplaza el documento por la lápida: los datos del registro dejan de guardarse.
    const tombstone: StoredDoc = {
      deleted: true,
      deletedAt: nowIso,
      updatedAt: nowIso,
      createdAt: existing?.createdAt ?? nowIso,
      clientUpdatedAt: existing?.clientUpdatedAt ?? nowIso,
    };
    tx.set(ref, tombstone);
    tx.set(userRef(uid).collection(HISTORY).doc(historyId(kind, id, "delete", "")), {
      entity: kind,
      entityId: id,
      action: "delete",
      at: nowIso,
    });
    return { item: toRecord<T>(id, tombstone), applied: true };
  });
}

/** Crea las categorías iniciales de una cuenta nueva (ids fijos: no se duplican). */
export async function createDefaultCategories(uid: string): Promise<void> {
  const firestore = db();
  const nowIso = new Date().toISOString();
  const batch = firestore.batch();
  for (const c of DEFAULT_CATEGORIES) {
    batch.set(collectionOf(uid, "category").doc(c.id), {
      name: c.name,
      type: c.type,
      monthlyBudget: null,
      createdAt: nowIso,
      clientUpdatedAt: nowIso,
      updatedAt: nowIso,
    });
  }
  await batch.commit();
}
