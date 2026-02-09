-- Add parsed AA date column for backorders
alter table public.backorder_items
  add column if not exists col_aa_date date;
