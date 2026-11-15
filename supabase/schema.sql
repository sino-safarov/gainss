-- Gainss: run once in the Supabase SQL editor.
-- One row per record of one account; `tbl` + `id` match the tables in the app.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null check (tbl in ('exercises', 'templates', 'workouts', 'sets', 'body')),
  id         bigint      not null,
  data       jsonb       check (data is null or pg_column_size(data) < 32768),
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, tbl, id)
);

create index if not exists records_changes on public.records (user_id, updated_at);

-- The server clock decides the order of changes, whatever the phone says.
create or replace function public.records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

-- Everyone reads and writes their own rows only.
alter table public.records enable row level security;
drop policy if exists records_own on public.records;
create policy records_own on public.records for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- "Delete account" in the app: removes the user; their rows go with it (cascade).
create or replace function public.delete_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = (select auth.uid());
$$;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
