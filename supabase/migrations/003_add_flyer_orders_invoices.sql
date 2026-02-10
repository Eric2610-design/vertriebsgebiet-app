create extension if not exists pgcrypto;

create table if not exists public.flyer_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid references public.dealers(id) on delete set null,
  customer_name text not null,
  street text,
  zip text,
  city text,
  country text,
  rep_name text,
  invoice_date text,
  invoice_no text not null,
  invoice_pos text,
  follow_no text,
  article text,
  brand text,
  series text,
  color text,
  model_year text,
  id_number text,
  qty double precision,
  amount_eur double precision,
  discount_eur double precision,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists flyer_invoice_dealer_id_idx on public.flyer_invoice_lines (dealer_id);
create index if not exists flyer_invoice_no_idx on public.flyer_invoice_lines (invoice_no);

create table if not exists public.flyer_order_lines (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid references public.dealers(id) on delete set null,
  customer_name text not null,
  street text,
  zip text,
  city text,
  country text,
  rep_name text,
  order_no text not null,
  order_pos text,
  follow_no text,
  order_date text,
  status text,
  planned_delivery text,
  delivery_date text,
  requested_delivery text,
  article text,
  brand text,
  model text,
  series text,
  model_year text,
  color text,
  id_number text,
  open_qty double precision,
  open_value_eur double precision,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists flyer_order_dealer_id_idx on public.flyer_order_lines (dealer_id);
create index if not exists flyer_order_no_idx on public.flyer_order_lines (order_no);
