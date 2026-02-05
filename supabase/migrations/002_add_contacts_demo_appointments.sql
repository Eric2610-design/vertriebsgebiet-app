-- 002_add_contacts_demo_appointments.sql
-- Run this after 001_init.sql in Supabase SQL editor.

create extension if not exists "uuid-ossp";

-- Contact persons per dealer
create table if not exists dealer_contacts (
  id uuid primary key default uuid_generate_v4(),
  dealer_id uuid not null references dealers(id) on delete cascade,
  role text not null check (role in ('Geschaeftsfuehrer','Verkauf','Werkstatt','Buchhaltung','Sonstiges')),
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger (reuse set_updated_at from 001 if present)
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create or replace function set_updated_at()
    returns trigger as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$ language plpgsql;
  end if;
end $$;

drop trigger if exists trg_dealer_contacts_updated_at on dealer_contacts;
create trigger trg_dealer_contacts_updated_at
before update on dealer_contacts
for each row execute procedure set_updated_at();

create index if not exists dealer_contacts_dealer_id_idx on dealer_contacts (dealer_id);

-- Demo bikes managed by reps
create table if not exists demo_bikes (
  id uuid primary key default uuid_generate_v4(),
  rep_email text not null references profiles(email) on delete cascade,
  model text not null,
  serial text,
  status text not null default 'available' check (status in ('available','in_use','service','lost')),
  location_type text not null default 'warehouse' check (location_type in ('dealer','warehouse')),
  dealer_id uuid references dealers(id) on delete set null,
  warehouse_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_demo_bikes_updated_at on demo_bikes;
create trigger trg_demo_bikes_updated_at
before update on demo_bikes
for each row execute procedure set_updated_at();

create index if not exists demo_bikes_rep_email_idx on demo_bikes (rep_email);

-- Appointments (rep <-> dealer)
create table if not exists appointments (
  id uuid primary key default uuid_generate_v4(),
  rep_email text not null references profiles(email) on delete cascade,
  dealer_id uuid references dealers(id) on delete set null,
  title text not null default 'Termin',
  starts_at timestamptz not null,
  ends_at timestamptz,
  with_whom text,
  notes text,
  status text not null default 'open' check (status in ('open','done','canceled')),
  report text,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_appointments_updated_at on appointments;
create trigger trg_appointments_updated_at
before update on appointments
for each row execute procedure set_updated_at();

create index if not exists appointments_rep_email_idx on appointments (rep_email);
create index if not exists appointments_starts_at_idx on appointments (starts_at);
