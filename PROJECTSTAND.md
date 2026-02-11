# Projektstand – Vertriebsgebiet-App

**Datum:** 2026-02-10 (Europe/Berlin)

Dieses ZIP enthält **nur die aktuellste Version** (kein "previous"-Ordner).

## Änderungen in dieser Version

### 1000er-Limit / "nur bis F" / ~1037 Datensätze
Mehrere Listen wurden durch das typische PostgREST/Supabase-Response-Limit (häufig 1000 Zeilen) abgeschnitten.
Diese Version stellt alle betroffenen Endpunkte auf **Paging via `.range(from,to)`** um.

**Neu:** `lib/supabasePaging.ts`
- Helper `fetchAllPaged()` zum robusten Batch-Fetch über `.range()`.

**Gefixt:**
- `app/api/reps/list/route.ts` – AD/Profiles + Territories laden jetzt vollständig (Paging)
- `app/api/reps/[email]/summary/route.ts` – Händler im AD-Gebiet werden jetzt **paged** geladen (nicht mehr nur die ersten ~1000) + `manufacturer_keys` für Piktogramme
- `app/api/backorders/route.ts` – Backorders laden jetzt bis `limit` (default 5000, max 10000) via Paging
- `app/api/ordertool/bootstrap/route.ts` – Stock-Items für Ordertool via Paging (verhindert abgeschnittene Treffer)
- `app/api/ordertool/data/route.ts` – Attribute/Filter-Daten via Paging (nicht nur erste ~1000)
- `app/api/admin/dealers/no-geo/route.ts` – Admin-Geodaten-Übersicht (Händler ohne Geodaten) via Paging
- `app/api/admin/dealers/no-geo/export/route.ts` – Export ebenfalls via Paging

### AD-Ansicht: Liste nicht mehr „nur bis F“
Auf der Detailseite eines Außendienstlers wurde die Händlerliste bisher auf 800 Einträge gekürzt.
Jetzt gibt es "Mehr anzeigen" / "Alle anzeigen" – so kannst du alle Händler durchscrollen.

### Händlerdetail: "Nicht gefunden" bei gemergten Datensätzen
Manche Händler tauchten in der AD-Liste auf, ließen sich aber nicht öffnen, weil die Detailansicht aus der
Master-View lädt (die gemergte/ausgeschlossene Datensätze filtert).

**Neu:**
- `app/api/dealers/[id]/route.ts` – wenn ein Händler nicht in der Master-View ist, wird geprüft, ob er `merged_into` ist.
  Dann liefert die API `redirect_to` zurück.
- `app/dealer/[id]/DealerClient.tsx` – erkennt `redirect_to` und leitet automatisch auf den Master-Händler um.
- `app/api/reps/[email]/summary/route.ts` – filtert gemergte/ausgeschlossene Händler (wenn Spalten vorhanden),
  damit in der AD-Liste weniger "tote" Links auftauchen.

## Start / Setup (Kurz)

- `.env` aus `.env.example` ableiten
- Install:
  - `npm install`
- Dev:
  - `npm run dev`

## Hinweis
Wenn erneut ein Listen-Endpunkt bei ~1000 Einträgen "abgeschnitten" wirkt, immer prüfen:
- wird `.range()` verwendet?
- ist eine stabile `.order()` gesetzt (für Paging)?

## Hotfix (2026-02-11)
- Fix: Build-Fehler in `app/admin/zip-duplicates/page.tsx` behoben (UI-Select nutzt nun korrekt `onChange` + `<option>` statt `onValueChange/options`).


## Hotfix (2026-02-11) – Option A (Leaflet Tile-Crash) + Override-View

### Fix: „Attempted to load an infinite number of tiles“
Beim Editieren von Händlern konnten `lat/lng` temporär als String/leer/komma-getrennt vorliegen.
Leaflet bekommt dann ungültige Koordinaten (NaN) und bricht mit dem Tile-Fehler ab.

**Gefixt:**
- `app/dealer/[id]/DealerClient.tsx` – Mini-Map nutzt jetzt eine robuste `parseCoord()`-Logik (Komma → Punkt, Finite-Check).
- `app/map/page.tsx` – zentrale `toCoord()`-Helper + Marker/Bounds nur mit validen Koordinaten.

### Option A: Master-View respektiert Overrides (DB-Migration)
Damit Änderungen (Name/Adresse/Geo etc.) nach Reload sichtbar bleiben, werden Overrides über die View gezogen.

**Neu:** `supabase/migrations/006_v_dealers_master_overrides.sql`
- stellt `dealer_field_overrides` + Spalten sicher
- ergänzt fehlende Dealer-Spalten (für Neu-Setup)
- `create or replace view public.v_dealers_master` mit `coalesce(overrides, dealers)` + Quellen-Aggregation

> Wichtig: Migration einmal in Supabase ausführen (SQL Editor) oder per `supabase db push`.
