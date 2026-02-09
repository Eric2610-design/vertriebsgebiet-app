-- 006_stock_and_backorders.sql
-- Stock snapshots (from daily Lagerbestand import) + Backorders (Auftragsrückstand)

-- Stock snapshot tables (minimal schema)
create table if not exists public.stock_runs (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  uploaded_by uuid,
  source_filename text,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists public.stock_items (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.stock_runs(id) on delete cascade,
  article_no text not null,
  frame_size text,
  created_at timestamptz not null default now()
);

create index if not exists stock_items_run_id_idx on public.stock_items(run_id);
create index if not exists stock_items_article_no_idx on public.stock_items(article_no);

-- Backorder imports (Auftragsbestandsposten)
create table if not exists public.backorder_runs (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  uploaded_by uuid,
  source_filename text,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists public.backorder_items (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.backorder_runs(id) on delete cascade,

  col_a text,
  order_date date,
  col_m text,
  col_v text,
  col_z text,
  col_aa text,
  col_ah text,
  col_ak text,
  col_ap text,
  col_ar text,
  col_as text,

  col_g text,
  customer_no text,
  dealer_name text,

  col_n text,
  article_no text,

  created_at timestamptz not null default now()
);

create index if not exists backorder_items_run_id_idx on public.backorder_items(run_id);
create index if not exists backorder_items_article_no_idx on public.backorder_items(article_no);
create index if not exists backorder_items_customer_no_idx on public.backorder_items(customer_no);
create index if not exists backorder_items_order_date_idx on public.backorder_items(order_date);

-- Latest view: numbering is global per article_no and MUST NOT be affected by later territory filters.
create or replace view public.backorders_latest as
with latest_backorder as (
  select id from public.backorder_runs order by created_at desc limit 1
),
latest_stock as (
  select id from public.stock_runs order by created_at desc limit 1
)
select
  bi.*,
  row_number() over (
    partition by bi.article_no
    order by bi.order_date asc nulls last, bi.id asc
  ) as prio_no,

  dealer.dealer_id,
  dealer.dealer_country,
  dealer.dealer_zip,
  case when dealer.dealer_country = 'CH' then bi.col_as else bi.col_ar end as col_price,

  si.frame_size
from public.backorder_items bi
join latest_backorder lb on bi.run_id = lb.id
left join latest_stock ls on true
left join public.stock_items si
  on si.run_id = ls.id and si.article_no = bi.article_no
left join lateral (
  select
    d2.id as dealer_id,
    d2.country as dealer_country,
    d2.zip as dealer_zip
  from public.dealer_sources ds2
  join public.dealers d2 on d2.id = ds2.dealer_id
  where ds2.external_id = bi.customer_no
    and ds2.source in ('flyer', 'zeg')
  order by (case when ds2.source = 'flyer' then 0 else 1 end), ds2.created_at desc
  limit 1
) dealer on true;
