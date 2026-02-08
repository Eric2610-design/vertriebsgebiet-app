"use client";

import RequireRole from "@/components/RequireRole";
import { Card, CardContent, CardHeader, Badge } from "@/components/ui";
import Link from "next/link";

export default function TerritoriesPage() {
  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <main className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-semibold">Vertriebsgebiete</h1>
            <p className="text-slate-600 text-sm">Zuweisung der PLZ-Gebiete an Außendienstler (Admin/Superadmin).</p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/admin" className="text-blue-600 hover:underline">Admin</Link>
            <Link href="/map" className="text-blue-600 hover:underline">Zur Karte</Link>
          </div>
        </div>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Noch nicht umgesetzt</div>
              <div className="text-sm text-slate-600">Diese Seite ist als Platzhalter bereits im Menü verdrahtet.</div>
            </div>
            <Badge>TODO</Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <div>
              Nächste Schritte:
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li>AD-Liste laden (z.B. aus eurer bestehenden AD/PLZ-Datei) und als Tabelle anzeigen.</li>
                <li>PLZ-Bereiche pro AD bearbeiten (Add/Remove, Bereichs-Validierung).</li>
                <li>Speichern in DB + Historie (wer hat wann was geändert).</li>
                <li>AD-Navigation: „Mein Gebiet“ verlinkt dann direkt auf /ad/&lt;email&gt; (bereits umgesetzt).</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </main>
    </RequireRole>
  );
}
