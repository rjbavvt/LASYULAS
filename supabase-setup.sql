-- LAS YULAS: sincronización del menú + acceso para varios administradores
-- Ejecutar en Supabase → SQL Editor. Las cuentas se crean primero en Authentication → Users.

create table if not exists public.menu_config (
  slug text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.menu_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.menu_config enable row level security;
alter table public.menu_admins enable row level security;

grant select on public.menu_config to anon, authenticated;
grant insert, update on public.menu_config to authenticated;
grant select on public.menu_admins to authenticated;

-- El menú publicado se puede leer sin iniciar sesión.
drop policy if exists "Public can read LAS YULAS menu" on public.menu_config;
create policy "Public can read LAS YULAS menu"
  on public.menu_config for select to anon, authenticated
  using (slug = 'lasyulas');

-- Solo usuarios incluidos en menu_admins pueden crear/editar la configuración.
drop policy if exists "LAS YULAS admins can insert menu" on public.menu_config;
create policy "LAS YULAS admins can insert menu"
  on public.menu_config for insert to authenticated
  with check (
    slug = 'lasyulas'
    and exists (select 1 from public.menu_admins a where a.user_id = (select auth.uid()))
    and updated_by = (select auth.uid())
  );

drop policy if exists "LAS YULAS admins can update menu" on public.menu_config;
create policy "LAS YULAS admins can update menu"
  on public.menu_config for update to authenticated
  using (
    slug = 'lasyulas'
    and exists (select 1 from public.menu_admins a where a.user_id = (select auth.uid()))
  )
  with check (
    slug = 'lasyulas'
    and exists (select 1 from public.menu_admins a where a.user_id = (select auth.uid()))
    and updated_by = (select auth.uid())
  );

-- Un usuario solo puede comprobar su propia membresía de administrador.
drop policy if exists "Admins can read own membership" on public.menu_admins;
create policy "Admins can read own membership"
  on public.menu_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- La tabla de administradores no tiene política INSERT/UPDATE/DELETE para clientes.
-- Añade administradores desde SQL Editor después de crear cada usuario en Authentication.
-- Sustituye UUID_DE_AUTH_USER por el UUID real de Authentication → Users:
-- insert into public.menu_admins (user_id) values ('UUID_DE_AUTH_USER');
