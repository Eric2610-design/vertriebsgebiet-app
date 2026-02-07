-- Einkaufsverbände + Icon-Handling

create table if not exists buying_groups (
  key text primary key,
  label text not null,
  icon_data_url text,
  icon_missing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_buying_groups_updated_at on buying_groups;
create trigger trg_buying_groups_updated_at
before update on buying_groups
for each row execute procedure set_updated_at();

alter table if exists dealers
add column if not exists buying_group_key text references buying_groups(key);

alter table if exists manufacturers
add column if not exists icon_data_url text;
alter table if exists manufacturers
add column if not exists icon_missing boolean not null default false;

-- Seeds
insert into buying_groups (key, label) values
('zeg','ZEG'),
('bico','BICO'),
('bikeco','BIKE&CO')
on conflict (key) do update set label = excluded.label;
