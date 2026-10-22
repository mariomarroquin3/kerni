-- Kerni RAG Hybrid Search: full-text search (GIN) combined with vector search (HNSW).
-- Enhances retrieval when queries contain specific keywords, file names, or process names.

alter table public.kerni_conocimiento
  add column if not exists tsv tsvector
  generated always as (
    to_tsvector('spanish', coalesce(titulo, '') || ' ' || contenido)
  ) stored;

create index if not exists kerni_conocimiento_tsv_idx
  on public.kerni_conocimiento using gin (tsv);

-- Hybrid search: vector cosine similarity + lexical text rank (Spanish)
create or replace function public.kerni_buscar_conocimiento_hibrido(
  consulta_vector extensions.vector(768),
  consulta_texto text default '',
  k int default 4,
  minimo float default 0.50
)
returns table (fuente text, titulo text, contenido text, similitud float)
language sql stable
set search_path = public, extensions
as $$
  with vectorial as (
    select c.id, c.fuente, c.titulo, c.contenido, (1 - (c.embedding <=> consulta_vector))::float as sim_vec
    from public.kerni_conocimiento c
    where 1 - (c.embedding <=> consulta_vector) >= minimo
  ),
  lexica as (
    select c.id, ts_rank_cd(c.tsv, websearch_to_tsquery('spanish', consulta_texto))::float as rank_lex
    from public.kerni_conocimiento c
    where consulta_texto <> '' and c.tsv @@ websearch_to_tsquery('spanish', consulta_texto)
  )
  select
    v.fuente,
    v.titulo,
    v.contenido,
    (v.sim_vec + coalesce(l.rank_lex * 0.2, 0.0))::float as similitud
  from vectorial v
  left join lexica l on v.id = l.id
  order by (v.sim_vec + coalesce(l.rank_lex * 0.2, 0.0)) desc
  limit least(k, 10);
$$;

revoke execute on function public.kerni_buscar_conocimiento_hibrido(extensions.vector, text, int, float) from public, anon, authenticated;
grant execute on function public.kerni_buscar_conocimiento_hibrido(extensions.vector, text, int, float) to service_role;
