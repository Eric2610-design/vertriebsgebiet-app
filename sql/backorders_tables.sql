create table if not exists public.backorder_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  uploaded_by uuid,
  source_filename text,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists public.backorder_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backorder_runs(id) on delete cascade,

  order_date date,
  article_no text not null,

  customer_raw text,
  customer_no text,
  dealer_name text,

  article_raw text,

  col_a text,
  col_m text,
  col_v text,
  col_z text,
  col_aa text,
  col_ah text,
  col_ak text,
  col_ap text,
  col_ar text,
  col_as text,

  dealer_id uuid,
  dealer_country text,
  dealer_zip text
);

alter table public.backorder_items add column if not exists order_no text;
alter table public.backorder_items add column if not exists pos_no text;
alter table public.backorder_items add column if not exists customer_raw text;
alter table public.backorder_items add column if not exists article_raw text;

create index if not exists backorder_runs_created_at_idx on public.backorder_runs(created_at desc);
create index if not exists backorder_items_run_id_idx on public.backorder_items(run_id);
create index if not exists backorder_items_article_no_idx on public.backorder_items(article_no);
create index if not exists backorder_items_customer_no_idx on public.backorder_items(customer_no);
create unique index if not exists backorder_items_run_order_pos_unique on public.backorder_items(run_id, order_no, pos_no);

alter table public.backorder_runs disable row level security;
alter table public.backorder_items disable row level security;
