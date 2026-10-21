-- Kerni memory: facts about the person and their PC, chat turns and a light health history.
--
-- Access model: only the local Kerni backend talks to these tables, with the service/secret key
-- (never shipped in the desktop app). Row Level Security is ON with NO policies, so the anon and
-- authenticated roles (the public API keys) can read and write nothing. Each row is scoped by
-- `device_id`, a random UUID the app generates on first run.

create table if not exists public.kerni_hechos (
  device_id   uuid        not null,
  clave       text        not null check (clave ~ '^[a-z0-9_]{2,40}$'),
  valor       text        not null check (char_length(valor) between 1 and 200),
  origen      text        not null default 'persona' check (origen in ('persona', 'kerni')),
  actualizado timestamptz not null default now(),
  primary key (device_id, clave)
);

create table if not exists public.kerni_mensajes (
  id         bigint generated always as identity primary key,
  device_id  uuid        not null,
  session_id uuid        not null,
  rol        text        not null check (rol in ('user', 'assistant')),
  contenido  text        not null check (char_length(contenido) between 1 and 4000),
  creado     timestamptz not null default now()
);
create index if not exists kerni_mensajes_device_id_idx on public.kerni_mensajes (device_id, id desc);

create table if not exists public.kerni_salud (
  id          bigint generated always as identity primary key,
  device_id   uuid        not null,
  creado      timestamptz not null default now(),
  cpu         real        not null check (cpu between 0 and 100),
  ram_pct     real        not null check (ram_pct between 0 and 100),
  disco_pct   real        not null check (disco_pct between 0 and 100),
  proceso_top text,
  proceso_mb  real
);
create index if not exists kerni_salud_device_creado_idx on public.kerni_salud (device_id, creado desc);

alter table public.kerni_hechos   enable row level security;
alter table public.kerni_mensajes enable row level security;
alter table public.kerni_salud    enable row level security;

-- Defense in depth: even if a policy is added by mistake later, the public roles get no grants.
revoke all on public.kerni_hechos   from anon, authenticated;
revoke all on public.kerni_mensajes from anon, authenticated;
revoke all on public.kerni_salud    from anon, authenticated;
