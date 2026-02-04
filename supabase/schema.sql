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

-- upload_run_id an dealers (für gezieltes Löschen pro Upload)
alter table public.dealers
add column if not exists upload_run_id bigint;

create index if not exists dealers_upload_run_id_idx on public.dealers(upload_run_id);

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

-- Optional: falls du RLS aktiviert hast, brauchst du Policies.
-- Für dieses Tool ist es am einfachsten, RLS auf upload_runs auszuschalten:
-- alter table public.upload_runs disable row level security;
