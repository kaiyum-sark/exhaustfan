import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/require-role";
import { LogoutButton } from "@/components/admin/logout-button";

/**
 * Protected admin layout (SYSTEM_ARCHITECTURE.md §5, step 1): every route
 * under this group requires a valid, ACTIVE admin session. requireAdmin()
 * redirects to /admin/login server-side before any child renders — the
 * "Unauthorized Admin" test case. /admin/login itself lives outside this
 * route group so it isn't guarded by the check it exists to satisfy.
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="text-sm">
          <p className="font-medium">{admin.email}</p>
          <p className="text-muted-foreground">{admin.roleName}</p>
        </div>
        <LogoutButton />
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
