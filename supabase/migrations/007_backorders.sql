-- Backorders (Auftragsrückstand)
-- Import runs + line items from the Excel "Auftragsbestandsposten" export.

create table if not exists public.backorder_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  uploaded_by text,
  source_filename text,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists public.backorder_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backorder_runs(id) on delete cascade,

  -- Unique identity inside one order (Auftragsnummer + Auftragsposition)
  order_no text,
  pos_no text,

  -- Core
  order_date date,
  article_no text not null,

  -- Raw values
  customer_raw text,
  article_raw text,

  -- Parsed values
  customer_no text,
  dealer_name text,

  -- Requested columns (M, V, Z, AA, AH, AK, AP, AR/AS)
  col_m text,
  col_v text,
  col_z text,
  col_aa text,
  col_ah text,
  col_ak text,
  col_ap text,
  col_ar text,
  col_as text,

  -- Dealer match (optional)
  dealer_id uuid references public.dealers(id) on delete set null,
  dealer_country text,
  dealer_zip text,

  constraint backorder_items_run_order_pos_unique unique (run_id, order_no, pos_no)
);

create index if not exists backorder_runs_created_at_idx on public.backorder_runs(created_at desc);
create index if not exists backorder_items_run_id_idx on public.backorder_items(run_id);
create index if not exists backorder_items_article_no_idx on public.backorder_items(article_no);
create index if not exists backorder_items_customer_no_idx on public.backorder_items(customer_no);
create index if not exists backorder_items_dealer_id_idx on public.backorder_items(dealer_id);
create index if not exists backorder_items_order_date_idx on public.backorder_items(order_date);

alter table public.backorder_runs disable row level security;
alter table public.backorder_items disable row level security;
