import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { optionalEnv, requireEnv } from "./env.js";

function getPrivateKey() {
  return requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

export function getAdminDb() {
  const app =
    getApps()[0] ||
    initializeApp({
      credential: cert({
        projectId: requireEnv("FIREBASE_PROJECT_ID"),
        clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
        privateKey: getPrivateKey(),
      }),
    });

  const databaseId = optionalEnv("FIREBASE_FIRESTORE_DATABASE_ID");
  return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export function getAdminAuth() {
  const app =
    getApps()[0] ||
    initializeApp({
      credential: cert({
        projectId: requireEnv("FIREBASE_PROJECT_ID"),
        clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
        privateKey: getPrivateKey(),
      }),
    });

  return getAuth(app);
}
