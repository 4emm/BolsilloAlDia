/**
 * Deja la cuenta de un usuario "como nueva": borra sus movimientos, metas, historial y categorías,
 * y vuelve a crear las categorías iniciales. No elimina la cuenta de Firebase Authentication.
 *   npm run reset-user -- correo@dominio.com
 * Úsalo entre pruebas de la cuenta de demostración. ⚠ Borra datos: no lo apuntes a una cuenta real.
 */
import { DEFAULT_CATEGORIES } from "../lib/domain/defaults.ts";
import { deleteUserData, initAdmin } from "./_admin.mts";

const [email] = process.argv.slice(2).filter((a) => a !== "--");
if (!email) {
  console.error("Uso: npm run reset-user -- <correo>");
  process.exit(1);
}

const { auth, db } = initAdmin();
const { uid } = await auth.getUserByEmail(email);

await deleteUserData(db, uid);
const now = new Date().toISOString();
await db.collection("usuarios").doc(uid).set({ email, createdAt: now }, { merge: true });
const batch = db.batch();
for (const c of DEFAULT_CATEGORIES) {
  batch.set(db.collection("usuarios").doc(uid).collection("categorias").doc(c.id), {
    name: c.name,
    type: c.type,
    monthlyBudget: null,
    createdAt: now,
    clientUpdatedAt: now,
    updatedAt: now,
  });
}
await batch.commit();
console.log(`✓ ${email} restablecida con ${DEFAULT_CATEGORIES.length} categorías iniciales.`);
