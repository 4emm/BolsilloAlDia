/**
 * Inicia el Admin SDK para los scripts de administración (fuera de Next).
 * Con FIREBASE_AUTH_EMULATOR_HOST usa los emuladores locales; si no, las credenciales del .env.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function initAdmin() {
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.error("Falta FIREBASE_PROJECT_ID. Completa .env a partir de .env.example");
    process.exit(1);
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    console.log("(usando los emuladores de Firebase)");
  } else {
    for (const key of ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_WEB_API_KEY"]) {
      if (!process.env[key]) {
        console.error(`Falta ${key}. Completa .env a partir de .env.example`);
        process.exit(1);
      }
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return { auth: getAuth(), db: getFirestore() };
}

/** Borra TODO lo que cuelga de usuarios/{uid} (categorías, metas, movimientos, historial). */
export async function deleteUserData(db: ReturnType<typeof getFirestore>, uid: string) {
  await db.recursiveDelete(db.collection("usuarios").doc(uid));
}
