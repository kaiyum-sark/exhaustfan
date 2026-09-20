import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Only for reads that are safe to be public
 * (RLS-restricted) — never a source of truth for price, inventory, role, or
 * payment data (see SYSTEM_ARCHITECTURE.md §3).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
