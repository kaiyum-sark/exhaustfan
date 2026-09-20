// Provisions (or repairs) exactly one SUPER_ADMIN admin_users row. Uses the
// service-role key to bypass RLS — never run this from client code, and never
// commit real credentials. Run with env vars loaded, e.g.:
//   node --env-file=.env.local scripts/seed-super-admin.mjs
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD. Optional: SUPER_ADMIN_NAME.
// Idempotent: safe to re-run (reuses the auth user / role if they exist).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.SUPER_ADMIN_EMAIL;
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const FULL_NAME = process.env.SUPER_ADMIN_NAME || "Super Admin";

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

requireEnv("SUPABASE_URL", SUPABASE_URL);
requireEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
requireEnv("SUPER_ADMIN_EMAIL", EMAIL);
requireEnv("SUPER_ADMIN_PASSWORD", PASSWORD);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findExistingUserByEmail(email) {
  // supabase-js's admin API has no getUserByEmail — page through listUsers.
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

async function main() {
  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "SUPER_ADMIN")
    .single();

  if (roleError || !role) {
    console.error(
      "SUPER_ADMIN role not found — apply supabase/migrations first (supabase db push).",
    );
    process.exit(1);
  }

  let user = await findExistingUserByEmail(EMAIL);

  if (!user) {
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
    if (createError) {
      console.error("Failed to create auth user:", createError.message);
      process.exit(1);
    }
    user = created.user;
    console.log(`Created auth user ${EMAIL} (${user.id}).`);
  } else {
    console.log(`Auth user ${EMAIL} already exists (${user.id}) — reusing.`);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, full_name: FULL_NAME, email: EMAIL },
      { onConflict: "id" },
    );

  if (profileError) {
    console.error("Failed to upsert profile:", profileError.message);
    process.exit(1);
  }

  const { error: adminError } = await supabase
    .from("admin_users")
    .upsert(
      { id: user.id, role_id: role.id, status: "ACTIVE" },
      { onConflict: "id" },
    );

  if (adminError) {
    console.error("Failed to upsert admin_users row:", adminError.message);
    process.exit(1);
  }

  console.log(`SUPER_ADMIN ready: ${EMAIL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
