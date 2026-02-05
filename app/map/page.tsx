"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Badge, Input } from "@/components/ui";
import type { Dealer, Manufacturer, Profile, Territory } from "@/lib/types";

type DealerListItem = Dealer & { has_flyer?: boolean; manufacturer_keys?: string[] };

type Bounds = { south: number; west: number; north: number; east: number };

const FALLBACK_LABELS: Record<string, string> = {
  flyer: "FLYER",
  riese_mueller: "Riese & Müller",
  bergamont: "Bergamont",
  zeg: "ZEG",
  bico: "BICO",
  kalkhoff: "Kalkhoff",
};

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plz2(zip?: string | null): number | null {
  if (!zip) return null;
  const m = String(zip).match(/(\d{2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function inBounds(d: DealerListItem, b: Bounds | null) {
  if (!b) return true;
  if (d.lat == null || d.lng == null) return false;
  return d.lat >= b.south && d.lat <= b.north && d.lng >= b.west && d.lng <= b.east;
}

export default function MapPage() {
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const markerByIdRef = useRef<Map<string, any>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [dealers, setDealers] = useState<DealerListItem[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);

  const [q, setQ] = useState<string>("");
  const [selectedManu, setSelectedManu] = useState<Record<string, boolean>>({});
  const [selectedReps, setSelectedReps] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);

  // load initial data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [dRes, mRes, rRes] = await Promise.all([
          fetch("/api/dealers/list", { cache: "no-store" }),
          fetch("/api/manufacturers/list", { cache: "no-store" }),
          fetch("/api/reps/list", { cache: "no-store" }),
        ]);
        const dJs = await dRes.json();
        const mJs = await mRes.json();
        const rJs = await rRes.json();

        if (cancelled) return;
        setDealers(dJs.items ?? []);
        setManufacturers(mJs.items ?? []);
        setProfiles(rJs.profiles ?? []);
        setTerritories(rJs.territories ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Karte</h1>
          <p className="text-sm text-slate-600">Marker anklicken für Kurzinfos – Details öffnen für Datenpflege, Kontakte & Besuche.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/import"><Button variant="secondary">Import</Button></Link>
          <Link href="/ad"><Button variant="secondary">Außendienst</Button></Link>
          <Link href="/"><Button variant="secondary">Home</Button></Link>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <Input placeholder="Suche (Name/Ort/PLZ)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={runGeocode} disabled={geocodeBusy}>
              {geocodeBusy ? "Geocoding..." : "Geocoding starten"}
            </Button>
            <Button variant="secondary" onClick={() => mapRef.current?.setView([51.16, 10.45], 6)}>
              Deutschland
            </Button>
          </div>

          <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <summary className="cursor-pointer select-none text-sm font-semibold">Filter</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700">Hersteller</div>
                  <div className="flex gap-2">
                    <button className="text-xs text-slate-600 hover:underline" onClick={() => toggleAllManufacturers(true)}>alle</button>
                    <button className="text-xs text-slate-600 hover:underline" onClick={() => toggleAllManufacturers(false)}>keine</button>
                  </div>
                </div>
                <div className="mt-2 max-h-40 overflow-auto pr-1">
                  {[...manufacturers.map((m) => m.key), "__none__"].map((key) => (
                    <label key={key} className="flex items-center justify-between gap-2 py-1 text-sm">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedManu[key] ?? false}
                          onChange={(e) => setSelectedManu((s) => ({ ...s, [key]: e.target.checked }))}
                        />
                        <span className="truncate">{labelByKey.get(key) ?? key}</span>
                      </span>
                      <span className="text-xs text-slate-500">{manufacturerCounts.get(key) ?? 0}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700">Außendienst</div>
                  <div className="flex gap-2">
                    <button className="text-xs text-slate-600 hover:underline" onClick={() => toggleAllReps(true)}>alle</button>
                    <button className="text-xs text-slate-600 hover:underline" onClick={() => toggleAllReps(false)}>keine</button>
                  </div>
                </div>
                <div className="mt-2 max-h-40 overflow-auto pr-1">
                  {profiles.map((p) => (
                    <label key={p.email} className="flex items-center gap-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedReps[p.email] ?? false}
                        onChange={(e) => setSelectedReps((s) => ({ ...s, [p.email]: e.target.checked }))}
                      />
                      <span className="truncate">{p.display_name}</span>
                      {p.role === "admin" ? <span className="ml-auto text-xs text-slate-500">Admin</span> : null}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">Zuordnung über 2-stellige PLZ-Bereiche.</p>
              </div>
            </div>
          </details>
        </div>

        <div className="mt-2 text-sm text-slate-600">
          {loading ? "Lade..." : `${filtered.length} Treffer (mit Geo: ${withGeoTotal})`}
          {bounds ? ` · im Ausschnitt: ${visibleInView.length}` : ""}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[420px_1fr]">
        <Card className="h-[72vh] overflow-hidden">
          <CardHeader className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Händler im Kartenausschnitt</div>
            <div className="text-xs text-slate-500">{visibleWithGeo.length}</div>
          </CardHeader>
          <CardContent className="h-full pb-3">
            <div className="h-full overflow-auto rounded-xl border border-slate-200 bg-white">
              {visibleWithGeo.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">
                  Keine Händler im Ausschnitt (oder ohne Geodaten). Zoome/verschiebe die Karte.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visibleWithGeo.slice(0, 700).map((d) => {
                    const keys: string[] = (d as any).manufacturer_keys ?? [];
                    const keys2 = keys.length ? keys : ["__none__"];
                    const reps = dealerRepEmails.get(d.id) ?? [];
                    const repNames =
                      reps
                        .map((e) => profileByEmail.get(e)?.display_name ?? e)
                        .slice(0, 2)
                        .join(", ") + (reps.length > 2 ? "…" : "");
                    return (
                      <li key={d.id} className="p-3 hover:bg-slate-50">
                        <div className="flex items-start justify-between gap-2">
                          <button className="text-left" onClick={() => openDealerOnMap(d.id)}>
                            <div className="text-sm font-semibold">{d.name}</div>
                            <div className="text-xs text-slate-600">{`${d.zip ?? ""} ${d.city ?? ""}`.trim()}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {keys2.slice(0, 3).map((k) => (
                                <Badge key={k} tone={k === "flyer" ? "blue" : "slate"}>{labelByKey.get(k) ?? k}</Badge>
                              ))}
                              {keys2.length > 3 ? <Badge tone="slate">…</Badge> : null}
                              {repNames ? <Badge tone="amber">{repNames}</Badge> : null}
                            </div>
                          </button>
                          <div className="flex flex-col items-end gap-1">
                            <Link href={`/dealer/${d.id}`} className="text-xs text-blue-700 underline">Details</Link>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {visibleWithGeo.length > 700 ? <div className="mt-2 text-xs text-slate-500">Liste gekürzt auf 700.</div> : null}
          </CardContent>
        </Card>

        <Card className="h-[72vh] overflow-hidden">
          <CardHeader className="text-sm font-semibold">Karte</CardHeader>
          <CardContent className="h-full p-0">
            {mapError ? (
              <div className="p-4 text-sm text-rose-700">{mapError}</div>
            ) : (
              <div ref={containerRef} className="h-full w-full" />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
