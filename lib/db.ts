import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-only. Tables are RLS-protected; the only policy admits requests carrying
// x-app-secret == private.config('app_secret'). APP_DB_SECRET never reaches the browser.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const secret = process.env.APP_DB_SECRET;
  if (!url || !key || !secret) throw new Error('Supabase env is not configured (SUPABASE_URL, SUPABASE_ANON_KEY, APP_DB_SECRET)');
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-app-secret': secret } },
  });
  return client;
}

export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}
