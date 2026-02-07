"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Input } from "@/components/ui";
import RequireRole from "@/components/RequireRole";

type Dealer = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  geocode_status: string | null;
  updated_at: string | null;
};

export default function AdminNoGeoPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/dealers/no-geo?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || "Fehler beim Laden");
      setItems(js.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Fehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => items, [items]);

  const exportUrl = useMemo(() => {
    const u = new URL("/api/admin/dealers/no-geo/export", window.location.origin);
    if (q.trim()) u.searchParams.set("q", q.trim());
    return u.toString();
  }, [q]);

  const doImport = async () => {
    if (!importFile) return;
    try {
      setImportBusy(true);
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await fetch("/api/admin/dealers/no-geo/import", { method: "POST", body: fd });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || "Import fehlgeschlagen");
      alert(`Import OK: ${js.updated ?? 0} aktualisiert, ${js.skipped ?? 0} übersprungen`);
      setImportFile(null);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Import fehlgeschlagen");
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Händler ohne Geodaten</h1>
          <p className="mt-1 text-sm text-slate-600">
            Hier findest du Händler, denen Koordinaten fehlen. Du kannst Latitude/Longitude manuell setzen.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Suche (Name/Ort/PLZ)"
                className="w-full md:w-80"
              />
              <Button variant="secondary" onClick={load} disabled={loading}>
                Suchen
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={exportUrl} className="inline-block">
                <Button variant="secondary" className="h-9" disabled={loading}>
                  Export CSV
                </Button>
              </a>
              <label className="inline-flex items-center gap-2">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="text-sm"
                />
              </label>
              <Button variant="primary" className="h-9" onClick={doImport} disabled={!importFile || importBusy}>
                {importBusy ? "Import…" : "CSV importieren"}
              </Button>
              <Badge tone="slate">{loading ? "…" : `${rows.length} Treffer`}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {error ? <div className="text-sm text-rose-700">{error}</div> : null}
            {loading ? (
              <div className="text-sm text-slate-600">Lade…</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-slate-600">Keine Einträge.</div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-[900px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="py-2 pr-2">Händler</th>
                      <th className="py-2 pr-2">Adresse</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Lat</th>
                      <th className="py-2 pr-2">Lng</th>
                      <th className="py-2 pr-2">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <NoGeoRow key={d.id} d={d} busy={busyId === d.id} onBusy={setBusyId} onUpdated={load} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}

function NoGeoRow({
  d,
  busy,
  onBusy,
  onUpdated,
}: {
  d: Dealer;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onUpdated: () => void;
}) {
  const [lat, setLat] = useState(d.lat?.toString() ?? "");
  const [lng, setLng] = useState(d.lng?.toString() ?? "");

  const save = async () => {
    try {
      onBusy(d.id);
      const res = await fetch("/api/admin/dealers/set-coords", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: d.id, lat: Number(lat), lng: Number(lng) }),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || "Speichern fehlgeschlagen");
      onUpdated();
    } catch (e: any) {
      alert(e?.message ?? "Speichern fehlgeschlagen");
    } finally {
      onBusy(null);
    }
  };

  const force = async () => {
    try {
      onBusy(d.id);
      const res = await fetch("/api/admin/dealers/force-geocode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: d.id }),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || "Force fehlgeschlagen");
      onUpdated();
    } catch (e: any) {
      alert(e?.message ?? "Force fehlgeschlagen");
    } finally {
      onBusy(null);
    }
  };

  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2 pr-2">
        <div className="font-semibold">{d.name}</div>
        <div className="text-xs text-slate-500">{d.id}</div>
      </td>
      <td className="py-2 pr-2">
        <div>{d.street}</div>
        <div className="text-xs text-slate-600">{`${d.zip ?? ""} ${d.city ?? ""} ${d.country ?? ""}`.trim()}</div>
      </td>
      <td className="py-2 pr-2">
        <Badge tone={d.geocode_status === "manual" ? "blue" : "slate"}>{d.geocode_status ?? "-"}</Badge>
      </td>
      <td className="py-2 pr-2">
        <input
          className="w-32 rounded-lg border border-slate-200 px-2 py-1"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="z.B. 49.87"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          className="w-32 rounded-lg border border-slate-200 px-2 py-1"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="z.B. 8.65"
        />
      </td>
      <td className="py-2 pr-2">
        <div className="flex items-center gap-2">
          <Button variant="primary" className="h-8" onClick={save} disabled={busy}>
            Speichern
          </Button>
          <Button variant="secondary" className="h-8" onClick={force} disabled={busy}>
            Force
          </Button>
        </div>
      </td>
    </tr>
  );
}
