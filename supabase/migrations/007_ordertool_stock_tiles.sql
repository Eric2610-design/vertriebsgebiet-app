create table if not exists ordertool_stock_tiles (
  id uuid primary key default uuid_generate_v4(),
  market text not null default 'DE',
  version int not null default 1,
  tiles jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ordertool_stock_tiles_market_updated_idx
  on ordertool_stock_tiles (market, updated_at desc);
