-- Branch relationships + merge log + manufacturer status metadata

-- Dealers: allow branches (Filialen)
alter table public.dealers
  add column if not exists parent_dealer_id uuid references public.dealers(id) on delete set null,
  add column if not exists branch_label text;

create index if not exists dealers_parent_dealer_id_idx
on public.dealers (parent_dealer_id);

-- dealer_manufacturers: keep status metadata (used for Flyer active/former later)
alter table public.dealer_manufacturers
  add column if not exists status text not null default 'active'
    check (status in ('active','former','ignored')),
  add column if not exists source text,
  add column if not exists last_activity_at timestamptz;

create index if not exists dealer_manufacturers_status_idx
on public.dealer_manufacturers (manufacturer_key, status);

-- Merge log for traceability
create table if not exists public.merge_log (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.dealers(id) on delete cascade,
  merged_id uuid not null references public.dealers(id) on delete cascade,
  reason text,
  snapshot jsonb,
  merged_at timestamptz not null default now()
);

create index if not exists merge_log_master_idx on public.merge_log (master_id);
create index if not exists merge_log_merged_idx on public.merge_log (merged_id);
