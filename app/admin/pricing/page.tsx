"use client";

import Link from "next/link";
import RequireRole from "@/components/RequireRole";
import { Card, CardContent, CardHeader, Button } from "@/components/ui";

export default function PricingHubPage() {
  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <main className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-semibold">Preise · Schwellen · Fixpreise</h1>
            <p className="text-slate-600 text-sm">Zentrale Stelle für Preisregeln im Ordertool.</p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/admin" className="text-blue-600 hover:underline">Admin</Link>
            <Link href="/map" className="text-blue-600 hover:underline">Zur Karte</Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <div className="font-medium">Schwellen &amp; Preisregeln</div>
              <div className="text-sm text-slate-600">Margen/Schwellen, Standardpreise, Sonderregeln.</div>
            </CardHeader>
            <CardContent>
              <Link href="/admin/pricing-thresholds"><Button>Öffnen</Button></Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="font-medium">Fixpreis-Artikel</div>
              <div className="text-sm text-slate-600">Artikel, die immer mit Fixpreis behandelt werden.</div>
            </CardHeader>
            <CardContent>
              <Link href="/admin/fixprice-articles"><Button>Öffnen</Button></Link>
            </CardContent>
          </Card>
        </div>
      </main>
    </RequireRole>
  );
}
