-- Advisor fix (function_search_path_mutable): pin search_path so the function
-- can't be tricked into resolving unqualified names via a hijacked search_path.
-- pg_catalog is always implicitly searched regardless, so now() still resolves.
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
