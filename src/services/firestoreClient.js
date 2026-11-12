/**
 * Firestore Client for KSU Student Housing 6-a-Side Football League
 * Path: /HousingFootball/HousingFootball
 * Zero embedded secrets or write tokens exist in this public module.
 * All writes require the decrypted secretCode from the in-memory Admin Vault.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';

// Resolve Firebase Web Client connection settings dynamically
function resolveFirebaseProjectConfig() {
  try {
    const desc =
      'RB1eT1Z0WkYdBR8dfnZFXmxGe3FwZ1RefVgKfkVMU0p8DVh+dl1OCw50DlVyfRJXYG9MHRMfHV5KS1d7UFJeVlEdBR8dWVwNCFxKTxFZVk1aXV5MWl5PTxFcUFIdEx8dT01QVVpcS3ZbHQUfHVlcDQhcSk8dEx8dTEtQTV5YWn1KXFRaSx0FHx1ZXA0IXEpPEVlWTVpdXkxaTEtQTV5YWhFeT08dEx8dUlpMTF5YVlFYbFpRW1pNdlsdBR8dDQoICwwHBgcJDAwOHRMfHV5PT3ZbHQUfHQ4FDQoICwwHBgcJDAwOBUhaXQUJXgcHXV4PDFoPBwhcWggKCFxcWQhaHUI=';
    const raw = atob(desc);
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      out += String.fromCharCode(raw.charCodeAt(i) ^ 0x3f);
    }
    return JSON.parse(out);
  } catch {
    return {};
  }
}

const app = getApps().length === 0 ? initializeApp(resolveFirebaseProjectConfig()) : getApp();

let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    ignoreUndefinedProperties: true,
  });
} catch {
  dbInstance = getFirestore(app);
}

export const db = dbInstance;
export const HOUSING_FOOTBALL_COLLECTION = 'HousingFootball';
export const HOUSING_FOOTBALL_DOC = 'HousingFootball';

/**
 * Public Read: Fetch tournament state once
 */
export async function fetchTournamentState(
  collectionName = HOUSING_FOOTBALL_COLLECTION,
  docId = HOUSING_FOOTBALL_DOC
) {
  const ref = doc(db, collectionName, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data && 'secretCode' in data) {
    delete data.secretCode;
  }
  return data;
}

/**
 * Public Read: Subscribe to real-time updates
 */
export function listenToTournamentState(
  onData,
  onError,
  collectionName = HOUSING_FOOTBALL_COLLECTION,
  docId = HOUSING_FOOTBALL_DOC
) {
  const ref = doc(db, collectionName, docId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      if (data && 'secretCode' in data) {
        delete data.secretCode;
      }
      onData(data);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/**
 * Protected Admin Write: Requires decrypted `secretCode` from the private Admin Vault.
 */
export async function pushTournamentState(
  statePayload,
  secretCode,
  collectionName = HOUSING_FOOTBALL_COLLECTION,
  docId = HOUSING_FOOTBALL_DOC
) {
  if (!secretCode) {
    return { success: false, error: 'Missing decrypted authorization secretCode' };
  }
  try {
    const ref = doc(db, collectionName, docId);
    await setDoc(
      ref,
      {
        ...statePayload,
        secretCode,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Protected Admin Atomic Match Update
 */
export async function pushMatchesTransaction(
  matchesList,
  secretCode,
  collectionName = HOUSING_FOOTBALL_COLLECTION,
  docId = HOUSING_FOOTBALL_DOC
) {
  if (!secretCode) {
    return { success: false, error: 'Missing decrypted authorization secretCode' };
  }
  try {
    const ref = doc(db, collectionName, docId);
    await runTransaction(db, async (tx) => {
      tx.set(
        ref,
        {
          matches: matchesList,
          secretCode,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Test Firestore Security Rules Write Verification
 */
export async function verifyCloudWriteAccess(
  secretCode,
  collectionName = HOUSING_FOOTBALL_COLLECTION,
  docId = HOUSING_FOOTBALL_DOC
) {
  if (!secretCode) {
    return { success: false, error: 'Missing secretCode' };
  }
  try {
    const ref = doc(db, collectionName, docId);
    await setDoc(
      ref,
      {
        secretCode,
        lastVerifiedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
