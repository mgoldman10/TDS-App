import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const serviceAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (serviceAccount) {
    let parsed;
    try {
      // Try direct JSON parse first
      parsed = JSON.parse(serviceAccount);
    } catch {
      // Netlify may base64-encode or double-escape the value
      try {
        parsed = JSON.parse(Buffer.from(serviceAccount, "base64").toString("utf-8"));
      } catch {
        // Try unescaping double-escaped newlines
        parsed = JSON.parse(serviceAccount.replace(/\\\\n/g, "\\n"));
      }
    }
    adminApp = initializeApp({
      credential: cert(parsed),
    });
  } else {
    adminApp = initializeApp();
  }
  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}
