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

