import { requireAdmin } from "@/lib/auth/require-role";

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Signed in as {admin.email} ({admin.roleName}). Product, order, and
        inventory management arrive in later phases.
      </p>
    </div>
  );
}
