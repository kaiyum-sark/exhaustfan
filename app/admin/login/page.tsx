import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/require-role";
import { LoginForm } from "@/components/admin/login-form";

export default async function AdminLoginPage() {
  const admin = await getCurrentAdmin();
  if (admin) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Admin sign in</h1>
      <LoginForm />
    </main>
  );
}
