# Händlerkarte / Dealer Tool

## 1) Supabase vorbereiten (einmalig)
1. In Supabase → **SQL Editor** → `supabase/migrations/001_init.sql` ausführen.
2. In **Project Settings → API** die Keys holen:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Server)

> Hinweis: Für den Start ist keine Auth aktiv. Später nutzen wir `profiles` + `territories` zusammen mit Supabase Auth + RLS.

## 2) Lokal starten
```bash
npm i
cp .env.example .env.local
npm run dev
```

## 3) Deploy (Vercel)
- Env Vars in Vercel setzen (wie `.env.example`)
- Deploy

## Features
- Import: mehrere Excel-Dateien lokal einlesen (Browser, kein Rohdatei-Upload).
- Dubletten: Auto-Merge für identische Schlüssel (Name+Adresse); Basis für manuelle Merge-UI.
- Geocoding: Nominatim (rate-limited), Status `missing/ok/failed/manual`.
- Karte: Marker, Flyer in anderer Farbe.
- Händlerseite: Daten bearbeiten, Hersteller entfernen, Besuche dokumentieren, Händler löschen.

## Typische Fehlerquellen
- `Bad request` bei Import: meist fehlende Env Vars oder Supabase Tabellen fehlen.
- Build-Fehler: Node 18+/Vercel Standard ok; check `.env`.
