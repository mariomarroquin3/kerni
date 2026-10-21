-- Kerni RAG: knowledge about PCs, hardware, Office and good practices, searched by meaning (pgvector).
--
-- The embedding size (768) must match EMBEDDINGS_DIMENSIONS in src/backend/.env. Changing the
-- embedding model later means re-indexing: vectors from different models are not comparable.
-- Same access model as the memory tables: RLS on with no policies, only the backend's secret key.

create extension if not exists vector with schema extensions;

create table if not exists public.kerni_conocimiento (
  id        bigint generated always as identity primary key,
  fuente    text   not null,                        -- file the text came from, e.g. "hardware/ram.md"
  titulo    text   not null default '',             -- nearest heading
  contenido text   not null check (char_length(contenido) between 1 and 4000),
  hash      text   not null unique,                 -- sha256 of fuente + contenido: makes indexing idempotent
  embedding extensions.vector(768) not null,
  creado    timestamptz not null default now()
);
create index if not exists kerni_conocimiento_fuente_idx on public.kerni_conocimiento (fuente);
create index if not exists kerni_conocimiento_embedding_idx
  on public.kerni_conocimiento using hnsw (embedding extensions.vector_cosine_ops);

alter table public.kerni_conocimiento enable row level security;
revoke all on public.kerni_conocimiento from anon, authenticated;

-- Closest passages to a question. `similitud` = 1 - cosine distance (1 = identical).
create or replace function public.kerni_buscar_conocimiento(
  consulta extensions.vector(768),
  k int default 4,
  minimo float default 0.55
)
returns table (fuente text, titulo text, contenido text, similitud float)
language sql stable
set search_path = public, extensions
as $$
  select c.fuente, c.titulo, c.contenido, (1 - (c.embedding <=> consulta))::float as similitud
  from public.kerni_conocimiento c
  where 1 - (c.embedding <=> consulta) >= minimo
  order by c.embedding <=> consulta
  limit least(k, 10);
$$;

revoke execute on function public.kerni_buscar_conocimiento(extensions.vector, int, float) from public, anon, authenticated;
grant execute on function public.kerni_buscar_conocimiento(extensions.vector, int, float) to service_role;
