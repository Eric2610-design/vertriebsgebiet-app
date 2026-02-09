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

  -- core
  col_a text,
  order_date date,
  col_m text,
  col_v text,
  col_z text,
  col_aa text,
  col_aa_date date,
  col_ah text,
  col_ak text,
  col_ap text,
  col_ar text,
  col_as text,

  -- derived
  article_no text not null,
  customer_no text,
  dealer_name text,
  dealer_id uuid references public.dealers(id) on delete set null,
  dealer_country text,
  dealer_zip text
);

create index if not exists backorder_items_run_id_idx on public.backorder_items(run_id);
create index if not exists backorder_items_article_no_idx on public.backorder_items(article_no);
create index if not exists backorder_items_customer_no_idx on public.backorder_items(customer_no);
create index if not exists backorder_items_order_date_idx on public.backorder_items(order_date);
