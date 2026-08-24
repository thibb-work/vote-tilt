import 'server-only';
import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';

/**
 * Server-side writer for the session node.
 *
 * The durable state used to live in Postgres, where a host mutation was an RPC
 * guarded by a secret the browser never saw. RTDB has no equivalent, so that
 * authority moves here: the Admin SDK holds a service account and writes past
 * the rules, and the rules themselves refuse every client write to `sessions`.
 * A phone can read the round and nothing more.
 *
 * The credential is one JSON blob in FIREBASE_SERVICE_ACCOUNT rather than three
 * split variables, so rotating it is a single replacement and a malformed value
 * fails here, at startup, instead of at the first write.
 */
const APP_NAME = 'admin';

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  if (!raw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT. See .env.example.');
  }
  if (!databaseURL) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_DATABASE_URL. See .env.example.');
  }

  let parsed: { project_id?: string; client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }

  const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = parsed;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key.',
    );
  }

  return {
    databaseURL,
    // A key pasted into a dashboard arrives with its newlines escaped. Undo that
    // here rather than asking whoever sets the variable to remember.
    credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
  };
}

function adminApp(): App {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;
  initializeApp(credentials(), APP_NAME);
  return getApp(APP_NAME);
}

/** The `sessions/<slug>` node, writable only from the server. */
export function sessionRef(slug: string) {
  const db: Database = getDatabase(adminApp());
  return db.ref(`sessions/${slug}`);
}
