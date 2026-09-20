import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged, RLS-bypassing client. Service-role key never reaches the
 * client bundle (`server-only` enforces this at build time). Use only for
 * operations that genuinely need to bypass RLS — not as the default server
 * client (see lib/supabase/server.ts for the per-request, RLS-respecting one).
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
