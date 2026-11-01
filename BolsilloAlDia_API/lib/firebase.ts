import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getEnv } from "./env";

function adminApp(): App {
  if (getApps().length > 0) return getApp();
  const env = getEnv();
  // Con emuladores no hay credenciales reales: basta el id del proyecto.
  if (env.useEmulator) return initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  return initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
    }),
  });
}

export const adminAuth = () => getAuth(adminApp());
export const db = () => getFirestore(adminApp());
