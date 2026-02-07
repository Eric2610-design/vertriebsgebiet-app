"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, Input } from "@/components/ui";
import RequireRole from "@/components/RequireRole";
import { coordsMatchCountry } from "@/lib/geo/countryBounds";

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

  type Preview = {
    id: string;
    lat: number;
    lng: number;
    dealer?: Dealer;
    apply: boolean;
    country_ok: boolean;
    country_code: string | null;
  };
  const [preview, setPreview] = useState<Preview[]>([]);
  const [previewMsg, setPreviewMsg] = useState<string | null>(null);

  function parseCsv(text: string) {
    const lines = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (!lines.length) return { header: [] as string[], rows: [] as string[][] };
    if (/^sep=/.test(lines[0].toLowerCase())) lines.shift();
    const headerLine = lines.shift() as string;
    const delimiter = headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";
    const splitLine = (line: string) => {
      const out: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQ = !inQ;
          }
        } else if (ch === delimiter && !inQ) {
          out.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out.map((v) => v.trim().replace(/^"|"$/g, ""));
    };
    const header = splitLine(headerLine).map((h) => h.trim());
    const rows = lines.map(splitLine);
    return { header, rows };
  }

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
    // IMPORTANT: avoid referencing `window` during SSR/prerender.
    // Use a relative URL so Next.js can safely prerender this client page.
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return `/api/admin/dealers/no-geo/export${qs}`;
  }, [q]);

  const readPreview = async () => {
    if (!importFile) return;
    try {
      setImportBusy(true);
      setPreviewMsg(null);
      const raw = await importFile.text();
      const { header, rows } = parseCsv(raw);
      if (!header.length) throw new Error("CSV ist leer.");
      const lc = header.map((h) => h.toLowerCase());
      const idxId = lc.findIndex((h) => ["id", "uuid"].includes(h));
      const idxLat = lc.findIndex((h) => h === "lat" || h === "latitude");
      const idxLng = lc.findIndex((h) => ["lng", "lon", "longitude"].includes(h));
      if (idxId < 0 || idxLat < 0 || idxLng < 0) throw new Error("Header fehlt: id/uuid, lat, lng");

      const parsed = rows
        .map((r) => {
          const id = String(r[idxId] ?? "").trim();
          const lat = Number(String(r[idxLat] ?? "").trim());
          const lng = Number(String(r[idxLng] ?? "").trim());
          return { id, lat, lng };
        })
        .filter((r) => r.id && Number.isFinite(r.lat) && Number.isFinite(r.lng));

      if (!parsed.length) throw new Error("Keine verwertbaren Zeilen gefunden.");

      const res = await fetch("/api/admin/dealers/by-ids", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: parsed.map((p) => p.id) }),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || "Dealer lookup fehlgeschlagen");
      const map = new Map<string, Dealer>();
      for (const d of js.items ?? []) map.set(d.id, d);

      const pv: Preview[] = parsed.map((p) => {
        const d = map.get(p.id);
        const check = coordsMatchCountry(d?.country ?? null, p.lat, p.lng);
        const ok = !!d && check.ok;
        return {
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          dealer: d,
          apply: ok, // default: only valid & known dealers selected
          country_ok: check.ok,
          country_code: (check.code as any) ?? null,
        };
      });

      setPreview(pv);
      setPreviewMsg(`Vorschau geladen: ${pv.length} Zeilen (standardmäßig nur gültige Treffer ausgewählt).`);
    } catch (e: any) {
      setPreview([]);
      setPreviewMsg(e?.message ?? "CSV konnte nicht gelesen werden.");
    } finally {
      setImportBusy(false);
    }
  };

  const applyPreview = async () => {
    const chosen = preview.filter((p) => p.apply && p.dealer);
    if (!chosen.length) return alert("Bitte mindestens einen Eintrag auswählen.");
    if (!confirm(`Geodaten anwenden?\n\nAusgewählt: ${chosen.length}`)) return;
    try {
      setImportBusy(true);
      const res = await fetch("/api/admin/dealers/no-geo/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates: chosen.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng })) }),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || "Anwenden fehlgeschlagen");
      const invalid = (js.invalid_country ?? []).length;
      alert(`OK: ${js.updated ?? 0} aktualisiert, ${js.skipped ?? 0} übersprungen${invalid ? ` (davon ${invalid} falsches Land)` : ""}`);
      setImportFile(null);
      setPreview([]);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Anwenden fehlgeschlagen");
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
              <Button variant="secondary" className="h-9" onClick={readPreview} disabled={!importFile || importBusy}>
                {importBusy ? "Lese…" : "CSV einlesen"}
              </Button>
              <Button
                variant="primary"
                className="h-9"
                onClick={applyPreview}
                disabled={!preview.length || importBusy}
              >
                {importBusy ? "Wende an…" : "Anwenden"}
              </Button>
              <Badge tone="slate">{loading ? "…" : `${rows.length} Treffer`}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {previewMsg ? <div className="mb-2 text-sm text-slate-700">{previewMsg}</div> : null}
            {preview.length ? (
              <div className="mb-4 overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-[900px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="py-2 px-2">OK</th>
                      <th className="py-2 pr-2">Händler</th>
                      <th className="py-2 pr-2">Land-Check</th>
                      <th className="py-2 pr-2">Lat</th>
                      <th className="py-2 pr-2">Lng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p) => {
                      const name = p.dealer?.name ?? "(ID nicht gefunden)";
                      const addr = p.dealer ? `${p.dealer.zip ?? ""} ${p.dealer.city ?? ""} ${p.dealer.country ?? ""}`.trim() : "";
                      const landOk = p.dealer ? p.country_ok : false;
                      return (
                        <tr key={p.id} className="border-b border-slate-100 align-top">
                          <td className="py-2 px-2">
                            <input
                              type="checkbox"
                              checked={p.apply}
                              disabled={!p.dealer}
                              onChange={(e) =>
                                setPreview((old) => old.map((x) => (x.id === p.id ? { ...x, apply: e.target.checked } : x)))
                              }
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <div className="font-semibold">{name}</div>
                            <div className="text-xs text-slate-600">{addr}</div>
                            <div className="text-xs text-slate-500">{p.id}</div>
                          </td>
                          <td className="py-2 pr-2">
                            {!p.dealer ? (
                              <Badge tone="rose">nicht gefunden</Badge>
                            ) : landOk ? (
                              <Badge tone="green">passt</Badge>
                            ) : (
                              <Badge tone="rose">falsches Land</Badge>
                            )}
                          </td>
                          <td className="py-2 pr-2">{p.lat}</td>
                          <td className="py-2 pr-2">{p.lng}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
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
        <div className="font-semibold">
          <Link href={`/dealer/${encodeURIComponent(d.id)}`} className="hover:underline">
            {d.name}
          </Link>
        </div>
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
          <Link href={`/dealer/${encodeURIComponent(d.id)}`} className="inline-block">
            <Button variant="secondary" className="h-8" disabled={busy}>
              Öffnen
            </Button>
          </Link>
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
