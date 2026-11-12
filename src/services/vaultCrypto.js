/**
 * Web Crypto API AES-256-GCM Decryption & Dynamic Admin Bundle Loader
 * Decrypts `src/encrypted/adminVault.json` in memory using the user-supplied password.
 * Zero passwords, hashes, or secret tokens are stored in the public repository.
 */
import encryptedVault from '../encrypted/adminVault.json';

const SESSION_PASSPHRASE_KEY = 'ksu_hf_session_pass_v2';

function base64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

/**
 * Decrypts `src/encrypted/adminVault.json` using PBKDF2-SHA256 + AES-256-GCM
 * and evaluates the encrypted Admin Dashboard bundle in memory.
 */
export async function decryptAndMountAdminVault(password, runtimeDeps) {
  const cleaned = String(password || '').trim();
  if (!cleaned) {
    return { success: false, error: 'يرجى إدخال كلمة المرور.' };
  }

  try {
    const subtle = window.crypto?.subtle;
    if (!subtle) {
      return { success: false, error: 'متصفحك لا يدعم التشفير القياسي Web Crypto API.' };
    }

    const salt = base64ToBytes(encryptedVault.salt);
    const iv = base64ToBytes(encryptedVault.iv);
    const cipherBytes = base64ToBytes(encryptedVault.ct);
    const iterations = Number(encryptedVault.iter) || 100000;

    const enc = new TextEncoder();
    const keyMaterial = await subtle.importKey(
      'raw',
      enc.encode(cleaned),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const aesKey = await subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const plainBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      cipherBytes
    );

    const decodedJson = new TextDecoder().decode(plainBuffer);
    const vaultPayload = JSON.parse(decodedJson);

    if (!vaultPayload || !vaultPayload.authenticated || !vaultPayload.compiledJs) {
      return { success: false, error: 'بيانات الخزنة المشفرة غير صالحة.' };
    }

    // Provide runtime dependencies to the decrypted Admin bundle
    window.__KSU_HF_RUNTIME__ = runtimeDeps;

    // Execute the decrypted IIFE bundle in memory to register window.__KSU_HF_MOUNT_ADMIN__
    const execFn = new Function(vaultPayload.compiledJs);
    execFn();

    const AdminComponent = window.__KSU_HF_MOUNT_ADMIN__;
    if (typeof AdminComponent !== 'function') {
      return { success: false, error: 'تعذر تهيئة وحدة الإدارة بعد فك التشفير.' };
    }

    return {
      success: true,
      AdminComponent,
      secretCode: vaultPayload.secretCode,
      collection: vaultPayload.collection || 'HousingFootball',
      docId: vaultPayload.docId || 'HousingFootball',
    };
  } catch {
    return {
      success: false,
      error: 'كلمة المرور غير صحيحة — فشل فك التشفير (AES-256-GCM).',
    };
  }
}

export function saveSessionPassphrase(pass) {
  try {
    sessionStorage.setItem(SESSION_PASSPHRASE_KEY, pass);
  } catch {}
}

export function getSessionPassphrase() {
  try {
    return sessionStorage.getItem(SESSION_PASSPHRASE_KEY) || null;
  } catch {
    return null;
  }
}

export function clearSessionPassphrase() {
  try {
    sessionStorage.removeItem(SESSION_PASSPHRASE_KEY);
  } catch {}
}

