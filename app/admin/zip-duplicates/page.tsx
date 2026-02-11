"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Select } from "@/components/ui";

type ZipRow = { zip: string; count: number };

type Payload = {
  country: string;
  total_scanned: number;
  duplicate_zips: number;
  zips: ZipRow[];
};

export default function ZipDuplicatesPage() {
  const [country, setCountry] = useState("DE");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  async function load(cc: string) {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/dealers/zip-duplicates?country=${encodeURIComponent(cc)}&limit=300`, {
        cache: "no-store",
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || "Fehler beim Laden");
      setData(js as Payload);
    } catch (e: any) {
      setErr(e?.message || "Fehler beim Laden");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(country);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  function download() {
    window.location.href = `/api/admin/dealers/zip-duplicates/export?country=${encodeURIComponent(country)}`;
  }

  return (
    <main className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold">PLZ-Dubletten Export</h1>
          <p className="text-slate-600 text-sm">Excel-Liste aller Händler, deren PLZ mehrfach vorkommt (nur Master · Land-Filter).</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">
            Admin
          </Link>
        </div>
      </div>

      {err ? <div className="text-sm text-red-700 mb-4">{err}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="font-medium">Land</div>
            <Badge>{country}</Badge>
          </CardHeader>
          <CardContent>
            <Select
              value={country}
              onValueChange={(v) => setCountry(String(v || "DE").toUpperCase())}
              options={[
                { value: "DE", label: "Deutschland (DE)" },
                { value: "AT", label: "Österreich (AT)" },
                { value: "CH", label: "Schweiz (CH)" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="font-medium">Zips mit Dubletten</div>
            <Badge>{loading ? "…" : data?.duplicate_zips ?? 0}</Badge>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">Anzahl unterschiedlicher PLZ, die mindestens 2 Händler haben.</CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="font-medium">Export</div>
            <Badge>Excel</Badge>
          </CardHeader>
          <CardContent>
            <Button onClick={download} disabled={loading}>
              Excel herunterladen
            </Button>
            <div className="text-xs text-slate-500 mt-2">Enthält zusätzlich name_clean (ohne „… Z“ am Ende).</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="font-medium">Vorschau (Top PLZ)</div>
            <div className="text-sm text-slate-600">Sortiert nach Anzahl absteigend.</div>
          </div>
          <Badge>{loading ? "…" : data?.zips?.length ?? 0}</Badge>
        </CardHeader>
        <CardContent>
          <div className="border rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 bg-slate-50 text-xs text-slate-600 px-3 py-2">
              <div>PLZ</div>
              <div className="text-right">Anzahl</div>
              <div className="text-right">Hinweis</div>
            </div>
            <div className="divide-y max-h-[540px] overflow-auto">
              {(data?.zips ?? []).map((r) => (
                <div key={r.zip} className="grid grid-cols-3 px-3 py-2 text-sm">
                  <div className="font-medium">{r.zip}</div>
                  <div className="text-right">{r.count}</div>
                  <div className="text-right text-xs text-slate-500">Excel enthält alle</div>
                </div>
              ))}
              {!loading && !(data?.zips?.length ?? 0) ? <div className="p-4 text-sm text-slate-600">Keine Dubletten gefunden.</div> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
