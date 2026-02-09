-- Stock snapshot runs + items

create table if not exists stock_runs (
  id uuid primary key default uuid_generate_v4(),
  file_name text,
  rows_total int not null default 0,
  rows_valid int not null default 0,
  rows_invalid int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists stock_items (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid references stock_runs(id) on delete cascade,
  sku text not null,
  name text,
  model_year int,
  series text,
  model text,
  color text,
  frame_size text,
  frame_type text,
  battery text,
  motor_type text,
  motor_brand text,
  price_eur numeric,
  price_chf numeric,
  avail_now int,
  avail_total int,
  availability_plan jsonb,
  unit text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists stock_items_run_id_idx on stock_items (run_id);
create index if not exists stock_items_sku_idx on stock_items (sku);
