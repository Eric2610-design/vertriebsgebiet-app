-- 006: Dealer field overrides + master view that respects overrides
-- Ziel: AD-/Admin-Änderungen bleiben nach Reload sichtbar, auch wenn Uploads Basisdaten überschreiben.

-- 1) Sicherstellen, dass dealer_field_overrides existiert und die erwarteten Spalten hat
create table if not exists public.dealer_field_overrides (
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  field_name text not null,
  field_value text,
  value_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (dealer_id, field_name)
);

alter table public.dealer_field_overrides
  add column if not exists field_value text,
  add column if not exists value_json jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- 2) Dealers: einige Spalten werden im UI bereits verwendet (in Prod vorhanden), für Neu-Setups ergänzen wir sie.
alter table public.dealers
  add column if not exists status text,
  add column if not exists merged_into uuid references public.dealers(id) on delete set null,
  add column if not exists country_iso text,
  add column if not exists zipcode_int int,
  add column if not exists buying_group_key text;

create index if not exists dealers_country_iso_idx on public.dealers(country_iso);
create index if not exists dealers_zipcode_int_idx on public.dealers(zipcode_int);
create index if not exists dealers_merged_into_idx on public.dealers(merged_into);

-- 3) Master-View: coalesce(overrides, dealers) + Quellen-Aggregation
create or replace view public.v_dealers_master as
with ov as (
  select
    dealer_id,
    max(case when field_name='name' then field_value end) as ov_name,
    max(case when field_name='street' then field_value end) as ov_street,
    max(case when field_name='zip' then field_value end) as ov_zip,
    max(case when field_name='city' then field_value end) as ov_city,
    max(case when field_name='country_iso' then field_value end) as ov_country_iso,
    max(case when field_name='phone' then field_value end) as ov_phone,
    max(case when field_name='email' then field_value end) as ov_email,
    max(case when field_name='website' then field_value end) as ov_website,
    max(case when field_name='opening_hours' then field_value end) as ov_opening_hours,
    max(case when field_name='notes' then field_value end) as ov_notes,

    max(case when field_name='lat' then value_json end) as ov_lat_json,
    max(case when field_name='lng' then value_json end) as ov_lng_json,
    max(case when field_name='lat' then field_value end) as ov_lat_text,
    max(case when field_name='lng' then field_value end) as ov_lng_text
  from public.dealer_field_overrides
  group by dealer_id
),
src as (
  select
    dealer_id,
    array_agg(distinct source order by source) as sources,
    count(distinct source) as source_count
  from public.dealer_sources
  group by dealer_id
)
select
  d.id,

  coalesce(ov.ov_name, d.name) as name,
  coalesce(ov.ov_street, d.street) as street,
  coalesce(ov.ov_zip, d.zip) as zip,
  coalesce(ov.ov_city, d.city) as city,

  d.country,
  coalesce(nullif(trim(ov.ov_country_iso),''), nullif(trim(d.country_iso),''), nullif(trim(upper(d.country)),'')) as country_iso,

  coalesce(ov.ov_phone, d.phone) as phone,
  coalesce(ov.ov_email, d.email) as email,
  coalesce(ov.ov_website, d.website) as website,
  coalesce(ov.ov_opening_hours, d.opening_hours) as opening_hours,
  coalesce(ov.ov_notes, d.notes) as notes,

  coalesce(
    nullif(trim(both '"' from coalesce(ov.ov_lat_json::text,'')), '')::double precision,
    nullif(replace(trim(coalesce(ov.ov_lat_text,'')), ',', '.'), '')::double precision,
    d.lat
  ) as lat,
  coalesce(
    nullif(trim(both '"' from coalesce(ov.ov_lng_json::text,'')), '')::double precision,
    nullif(replace(trim(coalesce(ov.ov_lng_text,'')), ',', '.'), '')::double precision,
    d.lng
  ) as lng,

  d.geocode_status,
  d.last_geocoded_at,

  d.status,
  d.merged_into,
  d.parent_dealer_id,
  d.branch_label,
  d.buying_group_key,
  d.zipcode_int,

  d.norm_name,
  d.norm_street,
  d.norm_city,
  d.created_at,
  d.updated_at,

  src.sources,
  src.source_count
from public.dealers d
left join ov on ov.dealer_id = d.id
left join src on src.dealer_id = d.id
where
  d.merged_into is null
  and coalesce(d.status,'') not in ('merged','merged_force');

