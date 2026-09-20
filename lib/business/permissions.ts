import type { CurrentAdmin } from "@/types/admin";

/**
 * Single source of truth for "does this admin have permission X" — reused by
 * both the server-side guard (lib/auth/require-role.ts) and any UI that wants
 * to hide a button. The UI check is a courtesy only; the guard is the actual
 * security boundary (SYSTEM_ARCHITECTURE.md §5, CLAUDE.md §4).
 */
export function hasPermission(
  admin: Pick<CurrentAdmin, "permissions"> | null,
  permissionKey: string,
): boolean {
  return admin?.permissions.has(permissionKey) ?? false;
}
