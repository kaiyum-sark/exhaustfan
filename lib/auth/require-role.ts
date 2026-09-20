import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminWithPermissions } from "@/lib/data/admin-users";
import { hasPermission } from "@/lib/business/permissions";
import type { CurrentAdmin } from "@/types/admin";

/** Thrown by requirePermission() — callers (Server Actions) catch this and
 * return a safe, generic error to the client instead of a stack trace. */
export class ForbiddenError extends Error {
  constructor(permissionKey: string) {
    super(`Missing permission: ${permissionKey}`);
    this.name = "ForbiddenError";
  }
}

/**
 * Resolves the current request's admin identity + permissions, or null if
 * there is no session, no matching admin_users row, or the admin is
 * SUSPENDED. This is the only place session -> admin identity is resolved —
 * every other guard/action builds on this instead of re-deriving it.
 */
// cache() dedupes this per-request (React server rendering), so the
// layout's requireAdmin() call and a page's requireAdmin()/requirePermission()
// call in the same request don't each re-hit Supabase.
export const getCurrentAdmin = cache(async (): Promise<CurrentAdmin | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = await getAdminWithPermissions(supabase, user.id);
  if (!admin || admin.status !== "ACTIVE") {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? "",
    roleName: admin.roleName,
    permissions: admin.permissions,
  };
});

/**
 * Guard for admin pages/layouts. No valid, ACTIVE admin session -> redirect to
 * login server-side, before any protected content renders (the "Unauthorized
 * Admin" test case — PROJECT_REQUIREMENTS.md §8).
 */
export async function requireAdmin(): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  return admin;
}

/**
 * Guard for sensitive Server Actions. Independent of whatever the calling UI
 * already hid — every action re-checks this itself (SYSTEM_ARCHITECTURE.md
 * §5, CLAUDE.md §4: "hiding a button is not security").
 */
export async function requirePermission(
  permissionKey: string,
): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  if (!hasPermission(admin, permissionKey)) {
    throw new ForbiddenError(permissionKey);
  }
  return admin;
}
