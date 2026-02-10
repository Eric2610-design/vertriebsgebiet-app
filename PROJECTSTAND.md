# Projektstand – Vertriebsgebiet-App

**Datum:** 2026-02-10 (Europe/Berlin)

Dieses ZIP enthält **immer die zwei neuesten Versionen**:

1. **Aktuell (root):** Der aktuelle Projektstand (diese Version).
2. **Vorherige Version:** `./_previous_version/vertriebsgebiet-app-main_prev/`

## Änderungen in dieser Version

### 1000er-Limit / "nur bis F" / ~1037 Datensätze
Mehrere Listen wurden durch das typische PostgREST/Supabase-Response-Limit (häufig 1000 Zeilen) abgeschnitten.
Diese Version stellt alle betroffenen Endpunkte auf **Paging via `.range(from,to)`** um.

**Neu:** `lib/supabasePaging.ts`
- Helper `fetchAllPaged()` zum robusten Batch-Fetch über `.range()`.

**Gefixt:**
- `app/api/reps/list/route.ts` – AD/Profiles + Territories laden jetzt vollständig (Paging)
- `app/api/backorders/route.ts` – Backorders laden jetzt bis `limit` (default 5000, max 10000) via Paging
- `app/api/ordertool/bootstrap/route.ts` – Stock-Items für Ordertool via Paging (verhindert abgeschnittene Treffer)
- `app/api/ordertool/data/route.ts` – Attribute/Filter-Daten via Paging (nicht nur erste ~1000)
- `app/api/admin/dealers/no-geo/route.ts` – Admin-Geodaten-Übersicht (Händler ohne Geodaten) via Paging
- `app/api/admin/dealers/no-geo/export/route.ts` – Export ebenfalls via Paging

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

