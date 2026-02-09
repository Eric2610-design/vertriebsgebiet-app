-- Dealer Tool schema (run in Supabase SQL editor)
create extension if not exists "uuid-ossp";

create table if not exists manufacturers (
  key text primary key,
  label text not null
);

create table if not exists dealers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  street text,
  zip text,
  city text,
  country text,
  phone text,
  email text,
  website text,
  opening_hours text,
  lat double precision,
  lng double precision,
  geocode_status text not null default 'missing' check (geocode_status in ('missing','ok','manual','failed')),
  last_geocoded_at timestamptz,
  notes text,
  norm_name text not null,
  norm_street text not null,
  norm_city text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dealers_norm_unique
on dealers (norm_name, norm_street, zip, norm_city);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_dealers_updated_at on dealers;
create trigger trg_dealers_updated_at
before update on dealers
for each row execute procedure set_updated_at();

create table if not exists dealer_manufacturers (
  dealer_id uuid references dealers(id) on delete cascade,
  manufacturer_key text references manufacturers(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (dealer_id, manufacturer_key)
);

create table if not exists dealer_sources (
  id uuid primary key default uuid_generate_v4(),
  dealer_id uuid references dealers(id) on delete cascade,
  source text not null, -- manufacturer_key
  external_id text,
  source_url text,
  created_at timestamptz not null default now(),
  unique (dealer_id, source, external_id)
);

create table if not exists visits (
  id uuid primary key default uuid_generate_v4(),
  dealer_id uuid references dealers(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

-- Territories & profiles (prepared for later Auth/RLS)
create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  display_name text not null,
  email text not null unique,
  role text not null default 'rep' check (role in ('rep','admin')),
  created_at timestamptz not null default now()
);

create table if not exists territories (
  id uuid primary key default uuid_generate_v4(),
  profile_email text not null references profiles(email) on delete cascade,
  country text not null default 'DE',
  plz2_from int not null,
  plz2_to int not null,
  created_at timestamptz not null default now(),
  check (plz2_from between 0 and 99),
  check (plz2_to between 0 and 99),
  check (plz2_from <= plz2_to)
);

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
  avail_now numeric,
  avail_total numeric,
  availability_plan jsonb,
  unit text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists stock_items_run_id_idx on stock_items (run_id);
create index if not exists stock_items_sku_idx on stock_items (sku);

-- Seed manufacturers
insert into manufacturers (key, label) values
('flyer','FLYER'),
('riese_mueller','Riese & Müller'),
('bergamont','Bergamont'),
('zeg','ZEG'),
('bico','BICO'),
('kalkhoff','Kalkhoff')
on conflict (key) do update set label = excluded.label;

-- Seed profiles from AD mapping
insert into profiles (display_name, email, role) values ("Heise, David", "d.heise@flyer.ch", "admin") on conflict (email) do update set display_name=excluded.display_name, role=excluded.role;
insert into profiles (display_name, email, role) values ("Backhaus, Gero", "g.backhaus@flyer.ch", "rep") on conflict (email) do update set display_name=excluded.display_name, role=excluded.role;
insert into profiles (display_name, email, role) values ("Conrad, Alexander", "a.conrad@flyer.ch", "rep") on conflict (email) do update set display_name=excluded.display_name, role=excluded.role;
insert into profiles (display_name, email, role) values ("Dottor, Andrej", "a.dottor@flyer.ch", "rep") on conflict (email) do update set display_name=excluded.display_name, role=excluded.role;
insert into profiles (display_name, email, role) values ("Fuhrmann, Erich", "e.fuhrmann@flyer.ch", "admin") on conflict (email) do update set display_name=excluded.display_name, role=excluded.role;
insert into profiles (display_name, email, role) values ("Jansen-Beckmann, Nils", "n.jansenbeckmann@flyer.ch", "rep") on conflict (email) do update set display_name=excluded.display_name, role=excluded.role;
insert into profiles (display_name, email, role) values ("Kopp, Rainer", "r.kopp@flyer.ch", "rep") on conflict (email) do update set display_name=excluded.display_name, role=excluded.role;
insert into profiles (display_name, email, role) values ("Z\u00f6chbauer, Bernhard", "b.zoechbauer@flyer.ch", "rep") on conflict (email) do update set display_name=excluded.display_name, role=excluded.role;

-- Seed territories (2-stellige PLZ Bereiche)
insert into territories (profile_email, country, plz2_from, plz2_to) values ("d.heise@flyer.ch", 'DE', 0, 99) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("g.backhaus@flyer.ch", 'DE', 30, 33) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("g.backhaus@flyer.ch", 'DE', 40, 48) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("g.backhaus@flyer.ch", 'DE', 50, 52) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("g.backhaus@flyer.ch", 'DE', 58, 59) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("a.conrad@flyer.ch", 'DE', 0, 19) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("a.conrad@flyer.ch", 'DE', 34, 34) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("a.conrad@flyer.ch", 'DE', 37, 39) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("a.conrad@flyer.ch", 'DE', 98, 99) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("a.dottor@flyer.ch", 'DE', 20, 29) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("a.dottor@flyer.ch", 'DE', 49, 49) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("e.fuhrmann@flyer.ch", 'DE', 35, 36) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("e.fuhrmann@flyer.ch", 'DE', 53, 57) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("e.fuhrmann@flyer.ch", 'DE', 60, 69) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("n.jansenbeckmann@flyer.ch", 'DE', 80, 86) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("n.jansenbeckmann@flyer.ch", 'DE', 90, 97) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("r.kopp@flyer.ch", 'DE', 70, 79) on conflict do nothing;
insert into territories (profile_email, country, plz2_from, plz2_to) values ("r.kopp@flyer.ch", 'DE', 87, 89) on conflict do nothing;
