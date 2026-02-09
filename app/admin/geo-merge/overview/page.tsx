"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Input } from "@/components/ui";

type MergeRow = {
  master_id: string;
  merged_id: string;
  reason: string | null;
  merged_at: string;
};

type DealerMini = {
  id: string;
  name: string;
  zip: string | null;
  city: string | null;
  country_iso: string | null;
};

type Payload = {
  total: number;
  normal: { count: number; items: MergeRow[] };
  force: { count: number; items: MergeRow[] };
  dealersById: Record<string, DealerMini>;
};

function fmtDealer(map: Record<string, DealerMini>, id: string) {
  const d = map[id];
  if (!d) return id;
  const loc = [d.zip, d.city].filter(Boolean).join(" ");
  const cc = d.country_iso ? ` ${d.country_iso}` : "";
  return `${d.name}${loc ? ` · ${loc}` : ""}${cc}`;
}

function fmtTs(ts: string) {
  try {
    return new Date(ts).toLocaleString("de-DE");
  } catch {
    return ts;
  }
}

export default function GeoMergeOverviewPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [q, setQ] = useState("");

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/geo-merge/overview?limit=2000", { cache: "no-store" });
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
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return { normal: [], force: [] };
    const needle = q.trim().toLowerCase();
    const match = (r: MergeRow) => {
      if (!needle) return true;
      const m = fmtDealer(data.dealersById, r.master_id).toLowerCase();
      const s = fmtDealer(data.dealersById, r.merged_id).toLowerCase();
      return m.includes(needle) || s.includes(needle);
    };
    return {
      normal: (data.normal.items || []).filter(match),
      force: (data.force.items || []).filter(match),
    };
  }, [data, q]);

  return (
    <main className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Geo-Merge Übersicht</h1>
          <p className="text-slate-600 text-sm">Wie viele Merges · normal vs. force · inkl. Liste.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/geo-merge" className="text-sm text-blue-600 hover:underline">Zur Geo-Merge-Liste</Link>
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">Admin</Link>
        </div>
      </div>

      {err ? <div className="text-sm text-red-700 mb-4">{err}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="font-medium">Gesamt</div>
            <Badge>{loading ? "…" : data?.total ?? 0}</Badge>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">Alle Geo-Merges (normal + force).</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="font-medium">Normal</div>
            <Badge>{loading ? "…" : data?.normal?.count ?? 0}</Badge>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">Standard-Merge (ohne force).</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="font-medium">Force</div>
            <Badge>{loading ? "…" : data?.force?.count ?? 0}</Badge>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">Force-Merge (override).</CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="flex items-end justify-between gap-3">
          <div>
            <div className="font-medium">Filtern</div>
            <div className="text-sm text-slate-600">Suche in Master/Quelle (Name/PLZ/Ort).</div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="w-72">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="z.B. Lucky Bike Leipzig" />
            </div>
            <Button variant="secondary" onClick={load} disabled={loading}>
              Aktualisieren
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Normal gemerged</div>
              <div className="text-sm text-slate-600">reason = geo-merge</div>
            </div>
            <Badge>{loading ? "…" : filtered.normal.length}</Badge>
          </CardHeader>
          <CardContent>
            <div className="border rounded-xl divide-y max-h-[560px] overflow-auto">
              {(filtered.normal || []).map((r, idx) => (
                <div key={`${r.merged_id}-${r.master_id}-${idx}`} className="p-3">
                  <div className="text-sm font-medium">{fmtDealer(data?.dealersById || {}, r.merged_id)}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    → Master: {fmtDealer(data?.dealersById || {}, r.master_id)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{fmtTs(r.merged_at)}</div>
                </div>
              ))}
              {!loading && !filtered.normal.length ? (
                <div className="p-4 text-sm text-slate-600">Keine Einträge.</div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Force gemerged</div>
              <div className="text-sm text-slate-600">reason = geo-merge-force</div>
            </div>
            <Badge>{loading ? "…" : filtered.force.length}</Badge>
          </CardHeader>
          <CardContent>
            <div className="border rounded-xl divide-y max-h-[560px] overflow-auto">
              {(filtered.force || []).map((r, idx) => (
                <div key={`${r.merged_id}-${r.master_id}-${idx}`} className="p-3">
                  <div className="text-sm font-medium">{fmtDealer(data?.dealersById || {}, r.merged_id)}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    → Master: {fmtDealer(data?.dealersById || {}, r.master_id)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{fmtTs(r.merged_at)}</div>
                </div>
              ))}
              {!loading && !filtered.force.length ? (
                <div className="p-4 text-sm text-slate-600">Keine Einträge.</div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
