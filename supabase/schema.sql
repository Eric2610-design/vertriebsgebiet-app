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
