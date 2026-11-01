/**
 * Crea (o actualiza) un usuario de prueba, con sus categorías iniciales.
 *   npm run create-user -- correo@dominio.com "Contraseña" "Nombre Apellido"
 * Sirve para dar de alta la cuenta de prueba que se entrega al docente (ver README).
 * Si el correo ya existe, se le asigna la contraseña y el nombre indicados.
 * Ojo: la contraseña queda en el historial de tu terminal; no uses una que uses en otros sitios.
 */
import { DEFAULT_CATEGORIES } from "../lib/domain/defaults.ts";
import { initAdmin } from "./_admin.mts";

const [email, password, displayName] = process.argv.slice(2).filter((a) => a !== "--");
if (!email || !password || !displayName) {
  console.error('Uso: npm run create-user -- <correo> <contraseña> "<nombre>"');
  process.exit(1);
}
if (password.length < 6) {
  console.error("Firebase exige contraseñas de al menos 6 caracteres.");
  process.exit(1);
}

const { auth, db } = initAdmin();

let uid: string;
try {
  uid = (await auth.getUserByEmail(email)).uid;
  await auth.updateUser(uid, { password, displayName });
  console.log(`= usuario existente actualizado: ${email}`);
} catch (err) {
  if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  uid = (await auth.createUser({ email, password, displayName })).uid;
  console.log(`+ usuario creado: ${email}`);
}

const now = new Date().toISOString();
await db.collection("usuarios").doc(uid).set({ email, displayName, createdAt: now }, { merge: true });

// Categorías iniciales: ids fijos, así que repetir el script no las duplica ni pisa las editadas.
let created = 0;
for (const c of DEFAULT_CATEGORIES) {
  const ref = db.collection("usuarios").doc(uid).collection("categorias").doc(c.id);
  if ((await ref.get()).exists) continue;
  await ref.set({
    name: c.name,
    type: c.type,
    monthlyBudget: null,
    createdAt: now,
    clientUpdatedAt: now,
    updatedAt: now,
  });
  created++;
}
console.log(`✓ Listo. Categorías iniciales creadas: ${created}`);
