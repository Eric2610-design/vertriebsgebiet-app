-- Run in Supabase SQL Editor once (idempotent-ish)

create extension if not exists pgcrypto;

create table if not exists public.manufacturers (
  key text primary key,
  name text not null,
  color text null,
  created_at timestamptz not null default now()
);

create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  name text not null,
  street text,
  zip text,
  city text,
  country text,
  lat double precision,
  lng double precision,
  norm_name text not null default '',
  norm_street text not null default '',
  norm_city text not null default '',
  parent_dealer_id uuid null references public.dealers(id) on delete set null,
  branch_label text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dealers_identity_unique on public.dealers(identity_key);

create table if not exists public.dealer_manufacturers (
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  manufacturer_key text not null references public.manufacturers(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (dealer_id, manufacturer_key)
);

create table if not exists public.dealer_contacts (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  role text not null, -- Geschäftsführer/Verkauf/Werkstatt/Buchhaltung
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  rep_email text,
  visited_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value)
values ('flyer_active_threshold_months', to_jsonb(18))
on conflict (key) do update set value = excluded.value, updated_at = now();

create table if not exists public.merge_log (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null,
  merged_id uuid not null,
  reason text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);

-- Optional: Flyer invoice / order lines placeholders
create table if not exists public.flyer_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  doc_no text,
  doc_date date,
  amount numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.flyer_order_lines (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  order_no text,
  order_date date,
  qty numeric,
  created_at timestamptz not null default now()
);
