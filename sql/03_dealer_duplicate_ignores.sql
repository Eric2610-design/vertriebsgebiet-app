-- Stores explicit "do not merge" decisions so duplicate suggestions can be suppressed.

create table if not exists public.dealer_duplicate_ignores (
  id uuid primary key default gen_random_uuid(),
  -- Store pairs in a canonical order: dealer_id_a < dealer_id_b (lexicographically)
  dealer_id_a uuid not null references public.dealers(id) on delete cascade,
  dealer_id_b uuid not null references public.dealers(id) on delete cascade,
  reason text null,
  created_at timestamptz not null default now()
);

-- Prevent duplicates (same pair stored twice)
create unique index if not exists dealer_duplicate_ignores_pair_uniq
  on public.dealer_duplicate_ignores (dealer_id_a, dealer_id_b);

-- Helpful for lookups
create index if not exists dealer_duplicate_ignores_a_idx on public.dealer_duplicate_ignores (dealer_id_a);
create index if not exists dealer_duplicate_ignores_b_idx on public.dealer_duplicate_ignores (dealer_id_b);
