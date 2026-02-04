-- Vertriebsgebiet App – Supabase Schema/Helper
-- Sicher (add column if not exists). Kann mehrfach ausgeführt werden.

-- Basisfelder
alter table public.dealers
add column if not exists street text,
add column if not exists zipcode text,
add column if not exists postal_code text,
add column if not exists city text,
add column if not exists country text,
add column if not exists email text,
add column if not exists phone text,
add column if not exists website text,
add column if not exists source text,
add column if not exists notes text;

-- Dedupe / Upsert Key (für "ersetzen statt doppelt")
alter table public.dealers
add column if not exists dedupe_key text;

create index if not exists dealers_dedupe_key_idx on public.dealers(dedupe_key);

-- Versuche, einen Unique Index anzulegen (nur wenn aktuell keine Duplikate existieren)
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='dealers_dedupe_key_uq') then
    if not exists (
      select 1
      from public.dealers
      where dedupe_key is not null
      group by dedupe_key
      having count(*) > 1
      limit 1
    ) then
      execute 'create unique index dealers_dedupe_key_uq on public.dealers(dedupe_key)';
    end if;
  end if;
end
$$;

-- Dubletten / Master
alter table public.dealers
add column if not exists is_master boolean default true,
add column if not exists duplicate_of bigint;

create index if not exists dealers_duplicate_of_idx on public.dealers(duplicate_of);
create index if not exists dealers_is_master_idx on public.dealers(is_master);

-- Geocoding
alter table public.dealers
add column if not exists lat double precision,
add column if not exists lng double precision,
add column if not exists geocode_status text,
add column if not exists geocode_provider text,
add column if not exists geocoded_at timestamp with time zone,
add column if not exists geocode_error text,
add column if not exists geocode_batch_id uuid;

create index if not exists dealers_lat_lng_idx on public.dealers(lat, lng);
create index if not exists dealers_geocode_status_idx on public.dealers(geocode_status);
create index if not exists dealers_geocode_batch_idx on public.dealers(geocode_batch_id);

-- Upload Runs (Upload-Historie)
create table if not exists public.upload_runs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  file_name text,
  source text,
  rows_in_file int,
  inserted_count int,
  updated_count int,
  skipped_count int,
  error_count int,
  notes text
);

create index if not exists upload_runs_created_at_idx on public.upload_runs(created_at desc);

-- upload_run_id an dealers (nur für NEU eingefügte Datensätze pro Run)
alter table public.dealers
add column if not exists upload_run_id bigint;

create index if not exists dealers_upload_run_id_idx on public.dealers(upload_run_id);

-- Quellen pro Händler & Run (damit du weißt, welche Hersteller ihn geliefert haben)
create table if not exists public.dealer_source_runs (
  dealer_id bigint not null references public.dealers(id) on delete cascade,
  source text not null,
  upload_run_id bigint references public.upload_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (dealer_id, source, upload_run_id)
);

create index if not exists dealer_source_runs_source_idx on public.dealer_source_runs(source);
create index if not exists dealer_source_runs_upload_run_idx on public.dealer_source_runs(upload_run_id);

-- Summary View (Upload + aktuelle Datensätze)
create or replace view public.upload_runs_summary as
select
  ur.*,
  coalesce(d.total, 0) as dealers_current,
  coalesce(d.masters, 0) as masters_current
from public.upload_runs ur
left join (
  select
    upload_run_id,
    count(*) as total,
    count(*) filter (where is_master = true) as masters
  from public.dealers
  group by upload_run_id
) d on d.upload_run_id = ur.id;

-- Händler-Quellen aggregiert (für UI)
create or replace view public.dealer_sources_agg as
select
  dealer_id,
  array_agg(distinct source order by source) as sources,
  count(distinct source) as source_count
from public.dealer_source_runs
group by dealer_id;

-- Optional: falls du RLS aktiviert hast, brauchst du Policies.
-- Für dieses Tool ist es am einfachsten, RLS für die Tabellen zu deaktivieren:
-- alter table public.dealers disable row level security;
-- alter table public.upload_runs disable row level security;
-- alter table public.dealer_source_runs disable row level security;

-- Admin Helper (optional): DB komplett leeren
create or replace function public.admin_clear_all()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.dealer_source_runs;
  delete from public.dealers;
  delete from public.upload_runs;
end;
$$;

-- Admin Helper (optional): genau 1 Upload-Run löschen (nur eingefügte Händler dieses Runs)
create or replace function public.admin_clear_run(p_run_id bigint)
returns void
language plpgsql
security definer
as $$
begin
  delete from public.dealers where upload_run_id = p_run_id;
  delete from public.dealer_source_runs where upload_run_id = p_run_id;
  delete from public.upload_runs where id = p_run_id;
end;
$$;
