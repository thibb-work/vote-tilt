import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Server-side caller for the host_* RPCs. Uses the same public key as the
 * browser -- authority comes from HOST_DB_SECRET, which never leaves the server.
 */
export function hostRpc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.HOST_DB_SECRET;

  if (!url || !key || !secret) {
    throw new Error('Missing Supabase or HOST_DB_SECRET environment variables.');
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  return { client, secret };
}
