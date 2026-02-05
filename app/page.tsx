import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Badge } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Händlerkarte</h1>
          <p className="mt-1 text-sm text-slate-600">
            Import → Dubletten zusammenführen → Geocoding → Karte → Händlerseite
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="blue">Flyer = eigener Marker</Badge>
            <Badge tone="slate">Andere Hersteller</Badge>
            <Badge tone="amber">Dubletten-Prüfung</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/import"><Button variant="primary">Import starten</Button></Link>
          <Link href="/map"><Button variant="secondary">Karte</Button></Link>
          <Link href="/ad"><Button variant="secondary">Außendienst</Button></Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="text-sm font-semibold">1) Dateien importieren</CardHeader>
          <CardContent className="text-sm text-slate-600">
            Excel-Dateien lokal auswählen. Parsing passiert im Browser (schnell, kein Upload der Rohdatei).
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="text-sm font-semibold">2) Dubletten mergen</CardHeader>
          <CardContent className="text-sm text-slate-600">
            Vorschläge nach Name+Adresse. Du entscheidest, was zusammengeführt wird.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="text-sm font-semibold">3) Geocoding + Karte</CardHeader>
          <CardContent className="text-sm text-slate-600">
            Geocoding über Nominatim (rate limited). Händlerseite ohne Zwang zu Geodaten.
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader className="text-sm font-semibold">Admin / Datenpflege</CardHeader>
          <CardContent className="text-sm text-slate-600">
            Händler bearbeiten, fehlende Daten ergänzen, Besuche dokumentieren, Hersteller-Zuordnung löschen.
            Login/Profil-Sicht (Gebiete) ist vorbereitet, Auth kommt später.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
