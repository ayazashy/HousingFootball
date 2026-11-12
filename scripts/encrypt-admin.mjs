import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PRIVATE_DIR = path.join(ROOT_DIR, 'private-admin');
const SECRETS_PATH = path.join(PRIVATE_DIR, 'secrets.json');
const ADMIN_ENTRY_PATH = path.join(PRIVATE_DIR, 'AdminApp.jsx');
const OUTPUT_DIR = path.join(ROOT_DIR, 'src', 'encrypted');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'adminVault.json');

const PBKDF2_ITERATIONS = 100000;

function toBase64(uint8) {
  return Buffer.from(uint8).toString('base64');
}

async function encryptPayloadWithWebCrypto(plainObject, password) {
  const subtle = webcrypto.subtle;
  const enc = new TextEncoder();

  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const plainBytes = enc.encode(JSON.stringify(plainObject));
  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plainBytes
  );

  return {
    v: 2,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iter: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(cipherBuffer)),
    generatedAt: new Date().toISOString(),
  };
}

async function run() {
  if (!fs.existsSync(SECRETS_PATH) || !fs.existsSync(ADMIN_ENTRY_PATH)) {
    if (fs.existsSync(OUTPUT_FILE)) {
      console.log('[encrypt-admin] private-admin/ not present (CI environment). Using existing src/encrypted/adminVault.json.');
      return;
    }
    throw new Error('Neither private-admin/ nor src/encrypted/adminVault.json found!');
  }

  console.log('[encrypt-admin] Bundling private-admin/AdminApp.jsx...');
  const secrets = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'));
  const adminPassword = String(secrets.adminPassword || '').trim();
  if (!adminPassword) {
    throw new Error('adminPassword is missing in private-admin/secrets.json');
  }

  const bundleResult = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      react({
        jsxRuntime: 'classic',
      }),
    ],
    build: {
      write: false,
      minify: true,
      lib: {
        entry: ADMIN_ENTRY_PATH,
        name: '__KSU_HF_ADMIN_BUNDLE__',
        formats: ['iife'],
        fileName: () => 'admin-bundle.js',
      },
    },
  });

  const outputs = Array.isArray(bundleResult) ? bundleResult[0].output : bundleResult.output;
  const jsChunk = outputs.find((o) => o.type === 'chunk');
  if (!jsChunk || !jsChunk.code) {
    throw new Error('Failed to compile private-admin bundle');
  }

  const vaultPayload = {
    authenticated: true,
    collection: secrets.firestoreCollection || 'HousingFootball',
    docId: secrets.firestoreDocId || 'HousingFootball',
    secretCode: secrets.firestoreSecretCode || adminPassword,
    compiledJs: jsChunk.code,
  };

  console.log('[encrypt-admin] Encrypting bundle & secrets with AES-256-GCM (PBKDF2 100k SHA-256)...');
  const encryptedEnvelope = await encryptPayloadWithWebCrypto(vaultPayload, adminPassword);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(encryptedEnvelope, null, 2), 'utf8');
  console.log(`[encrypt-admin] Successfully wrote encrypted vault to src/encrypted/adminVault.json (${encryptedEnvelope.ct.length} chars ciphertext)`);
}

run().catch((err) => {
  console.error('[encrypt-admin] ERROR:', err);
  process.exit(1);
});

