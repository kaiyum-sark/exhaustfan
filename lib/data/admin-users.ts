import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminStatus } from "@/types/admin";

export interface AdminWithPermissions {
  status: AdminStatus;
  roleName: string;
  permissions: Set<string>;
}

interface AdminUserRow {
  status: AdminStatus;
  role: {
    name: string;
    role_permissions: { permission: { key: string } | null }[] | null;
  } | null;
}

/**
 * Resolves the requesting admin's role + permission set in one round trip.
 * Relies on the `admin_users_select_own` RLS policy — `supabase` must be a
 * client bound to the caller's session (lib/supabase/server.ts), not the
 * service-role client, so this only ever returns the caller's own row.
 */
export async function getAdminWithPermissions(
  supabase: SupabaseClient,
  userId: string,
): Promise<AdminWithPermissions | null> {
  const { data, error } = await supabase
    .from("admin_users")
    .select(
      `status, role:roles!inner ( name, role_permissions ( permission:permissions ( key ) ) )`,
    )
    .eq("id", userId)
    .maybeSingle<AdminUserRow>();

  if (error || !data || !data.role) {
    return null;
  }

  const permissions = new Set<string>(
    (data.role.role_permissions ?? [])
      .map((rp) => rp.permission?.key)
      .filter((key): key is string => Boolean(key)),
  );

  return {
    status: data.status,
    roleName: data.role.name,
    permissions,
  };
}
