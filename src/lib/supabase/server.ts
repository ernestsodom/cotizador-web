import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client. Never import this from a "use client"
 * component — the key it uses has full read/write access to every table
 * (see the migration notes in the repo's SQL) and must not reach the
 * browser bundle.
 */
let client: SupabaseClient | null = null;

export function supabaseServer() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_ANON_KEY environment variables"
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}
