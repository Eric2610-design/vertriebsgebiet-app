-- Optional: if you have a UNIQUE index/constraint that prevents duplicates after normalization,
-- drop it so cleanup/merge can handle duplicates.
drop index if exists public.dealers_norm_unique;
-- if it was created as a constraint instead of an index, use:
-- alter table public.dealers drop constraint if exists dealers_norm_unique;

-- Optional: keep as non-unique index for performance.
create index if not exists dealers_norm_idx
on public.dealers (norm_name, norm_street, zip, norm_city);
