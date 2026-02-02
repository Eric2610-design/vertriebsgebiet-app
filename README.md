# Vertriebsgebiet App (Upload → Mapping → Merge-Vorschläge)

## 1) Voraussetzungen
- Supabase Projekt (SQL Schema bereits installiert)
- Storage Bucket: `imports` (private)
- Vercel Env Vars:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY

## 2) Zusätzliche SQL Funktion (Match-Candidates generieren)
Führe diese SQL in Supabase -> SQL Editor aus:

```sql
create or replace function app.generate_match_candidates(_workspace_id uuid, _import_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare inserted_count integer;
begin
  insert into app.match_candidates (workspace_id, left_source_record_id, right_source_record_id, score, reason)
  select
    sr_new.workspace_id,
    sr_new.id,
    sr_old.id,
    greatest(similarity(sr_new.name_norm, sr_old.name_norm), 0)::numeric(5,2) as score,
    'same zipcode + name similarity' as reason
  from app.source_records sr_new
  join app.source_records sr_old
    on sr_old.workspace_id = sr_new.workspace_id
   and sr_old.id <> sr_new.id
   and sr_old.import_run_id <> sr_new.import_run_id
   and sr_old.zipcode is not null
   and sr_new.zipcode = sr_old.zipcode
  where sr_new.workspace_id = _workspace_id
    and sr_new.import_run_id = _import_run_id
    and similarity(sr_new.name_norm, sr_old.name_norm) >= 0.55
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function app.generate_match_candidates(uuid, uuid) from public;
grant execute on function app.generate_match_candidates(uuid, uuid) to authenticated;
```

## 3) Lokal starten
```bash
npm install
npm run dev
```

## 4) Deploy
- Repo zu GitHub pushen
- In Vercel importieren
- Env Vars setzen (Production + Preview + Development)
- Redeploy

## 5) App Nutzung
- Login mit Email/Passwort
- Workspace auswählen
- Quelle wählen, Excel hochladen
- Mapping (Spaltenzuordnung) festlegen
- Import starten → Vorschläge prüfen → Accept/Reject
