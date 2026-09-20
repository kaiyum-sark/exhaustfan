-- Identity & access schema (DATABASE_SCHEMA.md §1): profiles, admin_users, roles,
-- permissions, role_permissions. Admin-only in MVP — customers are never auth.users
-- rows (PROJECT_REQUIREMENTS.md §2.1/§9).

-- Shared trigger: keep `updated_at` current on every UPDATE. Reused by every
-- mutable table below instead of duplicating the same trigger body per table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles ------------------------------------------------------------------
-- 1:1 with auth.users. Row is created explicitly by admin-provisioning code
-- (scripts/seed-super-admin.mjs today; an admin "invite" Server Action later) —
-- there is no public self-signup flow in MVP, so no auth.users trigger is needed.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

-- roles -----------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger roles_set_updated_at
  before update on public.roles
  for each row
  execute function public.set_updated_at();

alter table public.roles enable row level security;

-- Role catalog is not sensitive by itself (no customer/order data) and every
-- admin needs to resolve their own role name — safe to expose read-only to any
-- authenticated (i.e. logged-in admin) principal. Writes are service-role only
-- (role management UI is PROJECT_REQUIREMENTS.md §5.8, a later phase).
create policy "roles_select_authenticated"
  on public.roles for select
  to authenticated
  using (true);

-- permissions -------------------------------------------------------------------
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.permissions enable row level security;

create policy "permissions_select_authenticated"
  on public.permissions for select
  to authenticated
  using (true);

-- role_permissions ----------------------------------------------------------
create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

alter table public.role_permissions enable row level security;

create policy "role_permissions_select_authenticated"
  on public.role_permissions for select
  to authenticated
  using (true);

-- admin_users -----------------------------------------------------------------
create table public.admin_users (
  id uuid primary key references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  created_by uuid references public.admin_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admin_users_role_id_idx on public.admin_users (role_id);
create index admin_users_status_idx on public.admin_users (status);

create trigger admin_users_set_updated_at
  before update on public.admin_users
  for each row
  execute function public.set_updated_at();

alter table public.admin_users enable row level security;

-- An admin can read their own row (status + role_id) to resolve their own
-- permissions — see lib/data/admin-users.ts. No cross-admin read, no write:
-- provisioning/suspension is service-role only (bypasses RLS) until
-- PROJECT_REQUIREMENTS.md §5.8 (admin management UI) ships with its own
-- SUPER_ADMIN-gated Server Actions.
create policy "admin_users_select_own"
  on public.admin_users for select
  to authenticated
  using (id = (select auth.uid()));
