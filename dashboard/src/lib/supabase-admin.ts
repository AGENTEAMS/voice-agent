import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase client. RLS-bypassing — MUST stay server-side only.
// All dashboard reads/writes go through this; the browser never gets these keys.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const RESTAURANT_ID =
  process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "11111111-1111-1111-1111-111111111111";

let cached: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in dashboard/.env.local",
    );
  }
  if (!cached) {
    cached = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
