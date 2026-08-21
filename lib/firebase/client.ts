'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';

/**
 * Positions ride Firebase RTDB rather than Supabase Realtime. Presence fan-out
 * on the Supabase free tier tops out around twenty messages a second, which a
 * single phone sweeping the dial can exhaust on its own; RTDB handled thirty
 * phones at three updates a second in load testing with no drops.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let db: Database | null = null;

export function roomDb(): Database {
  if (db) return db;
  if (!config.databaseURL) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_DATABASE_URL. See .env.example.');
  }
  const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
  db = getDatabase(app);
  return db;
}
