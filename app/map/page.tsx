"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

import { Badge, Button, Card, CardContent, CardHeader, Input } from "@/components/ui";
import type { Dealer, Manufacturer, Profile, Territory } from "@/lib/types";

type DealerListItem = Dealer & {
  manufacturer_keys?: string[];
};

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Map<string, Leaflet.Marker>>(new Map());
  const suppressMoveEndRef = useRef(false);

  const leafletRef = useRef<any>(null);
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod: any = await import("leaflet");
        const L = mod?.default ?? mod;
        if (!cancelled) {
          leafletRef.current = L;
          setLeafletReady(true);
        }
      } catch (e: any) {
        if (!cancelled) setMapError(e?.message ?? "Leaflet konnte nicht geladen werden");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dealers, setDealers] = useState<DealerListItem[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);

  const [q, setQ] = useState("");
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
        setMapError(null);
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
        setMapError(null);
      } catch (e: any) {
        if (!cancelled) setMapError(e?.message ?? "Fehler beim Laden");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of manufacturers) m.set(x.key, x.label);
    // fallbacks
    for (const k of Object.keys(FALLBACK_LABELS)) if (!m.has(k)) m.set(k, FALLBACK_LABELS[k]);
    return m;
  }, [manufacturers]);

  const repByEmail = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profiles) m.set(p.email, p);
    return m;
  }, [profiles]);

  const repsList = useMemo(() => {
    return profiles
      .slice()
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .map((p) => ({ email: p.email, name: p.display_name }));
  }, [profiles]);

  const dealerRepNames = useMemo(() => {
    // dealerId -> "Name1, Name2"
    const territoryByRep = new Map<string, Territory[]>();
    for (const t of territories) {
      const arr = territoryByRep.get(t.profile_email) ?? [];
      arr.push(t);
      territoryByRep.set(t.profile_email, arr);
    }

    const map = new Map<string, string>();
    for (const d of dealers) {
      const p2 = plz2(d.zip);
      if (p2 == null) continue;
      const hits: string[] = [];
      for (const [email, ts] of territoryByRep.entries()) {
        if (ts.some((t) => p2 >= t.plz2_from && p2 <= t.plz2_to)) {
          const prof = repByEmail.get(email);
          hits.push(prof?.display_name ?? email);
        }
      }
      if (hits.length) map.set(d.id, hits.sort().join(", "));
    }
    return map;
  }, [dealers, territories, repByEmail]);

  const filteredDealers = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const manuActive = Object.entries(selectedManu).filter(([, v]) => v).map(([k]) => k);
    const repActive = Object.entries(selectedReps).filter(([, v]) => v).map(([k]) => k);

    return dealers.filter((d) => {
      // search
      if (qq) {
        const hay = `${d.name ?? ""} ${d.street ?? ""} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }

      // manufacturer filter
      if (manuActive.length) {
        const keys = d.manufacturer_keys ?? [];
        if (!manuActive.some((k) => keys.includes(k))) return false;
      }

      // rep filter (via territories)
      if (repActive.length) {
        const repNames = dealerRepNames.get(d.id) ?? "";
        const ok = repActive.some((email) => {
          const prof = repByEmail.get(email);
          const name = prof?.display_name ?? email;
          return repNames.split(", ").includes(name);
        });
        if (!ok) return false;
      }

      return true;
    });
  }, [dealers, q, selectedManu, selectedReps, dealerRepNames, repByEmail]);

  const visibleWithGeo = useMemo(() => {
    return filteredDealers
      .filter((d) => inBounds(d, bounds))
      .filter((d) => d.lat != null && d.lng != null)
      .slice(0, 700);
  }, [filteredDealers, bounds]);

  const initMap = () => {
    if (!leafletReady) return;
    const L = leafletRef.current as any;
    if (!L) return;
    if (mapRef.current || !containerRef.current) return;
    try {
      const map = L.map(containerRef.current, { zoomControl: true, preferCanvas: true }).setView([51.16, 10.45], 6);
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      map.on("moveend", () => {
        if (suppressMoveEndRef.current) return;
        const b = map.getBounds();
        setBounds({
          south: b.getSouth(),
          west: b.getWest(),
          north: b.getNorth(),
          east: b.getEast(),
        });
      });

      // initial bounds
      const b = map.getBounds();
      setBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    } catch (e: any) {
      setMapError(e?.message ?? "Karte konnte nicht initialisiert werden");
    }
  };

  // init once
  useEffect(() => {
    if (!leafletReady) return;
    initMap();
    return () => {
      try {
        mapRef.current?.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady]);

  const flyerIcon = useMemo(() => {
    if (!leafletReady) return null;
    const L = leafletRef.current as any;
    return L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:999px;background:#2563eb;border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,.3)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }, [leafletReady]);

  const defaultIcon = useMemo(() => {
    if (!leafletReady) return null;
    const L = leafletRef.current as any;
    return L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:999px;background:#64748b;border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,.25)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }, []);

  // render markers when visible dealers change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Leaflet is loaded dynamically; always access it via the ref (never via a global `L`).
    const L = leafletRef.current as any;
    if (!L) return;

    const desired = new Set(visibleWithGeo.map((d) => d.id));

    // remove stale
    for (const [id, marker] of markersRef.current.entries()) {
      if (!desired.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // add / update
    for (const d of visibleWithGeo) {
      if (d.lat == null || d.lng == null) continue;
      const hasFlyer = (d.manufacturer_keys ?? []).includes("flyer");
      const icon = hasFlyer ? flyerIcon : defaultIcon;
      const keys = d.manufacturer_keys ?? [];
      const labels = keys.map((k) => labelByKey.get(k) ?? k).slice(0, 4);
      const repNames = dealerRepNames.get(d.id) ?? "";
      const popup = `
        <div style="min-width:220px">
          <div style="font-weight:700;margin-bottom:2px">${escapeHtml(d.name ?? "")}</div>
          <div style="font-size:12px;color:#475569">${escapeHtml(`${d.street ?? ""}`.trim())}</div>
          <div style="font-size:12px;color:#475569">${escapeHtml(`${d.zip ?? ""} ${d.city ?? ""}`.trim())}</div>
          <div style="margin-top:6px;font-size:12px">${labels.length ? `<b>Marken:</b> ${escapeHtml(labels.join(", "))}` : ""}</div>
          ${repNames ? `<div style="margin-top:4px;font-size:12px"><b>AD:</b> ${escapeHtml(repNames)}</div>` : ""}
          <div style="margin-top:8px"><a href="/dealer/${encodeURIComponent(d.id)}" style="color:#2563eb;text-decoration:underline">Details öffnen</a></div>
        </div>
      `;

      const existing = markersRef.current.get(d.id);
      if (existing) {
        existing.setLatLng([d.lat, d.lng]);
        existing.setIcon(icon);
        existing.bindPopup(popup);
      } else {
        const m = L.marker([d.lat, d.lng], { icon }).addTo(map);
        m.bindPopup(popup);
        markersRef.current.set(d.id, m);
      }
    }
  }, [leafletReady, visibleWithGeo, labelByKey, dealerRepNames, flyerIcon, defaultIcon]);

  const runGeocode = async () => {
    try {
      setGeocodeBusy(true);
      await fetch("/api/geocode/run", { method: "POST" });
      // reload dealers
      const dRes = await fetch("/api/dealers/list", { cache: "no-store" });
      const dJs = await dRes.json();
      setDealers(dJs.items ?? []);
    } finally {
      setGeocodeBusy(false);
    }
  };

  const centerGermany = () => {
    const map = mapRef.current;
    if (!map) return;
    suppressMoveEndRef.current = true;
    map.setView([51.16, 10.45], 6);
    setTimeout(() => {
      suppressMoveEndRef.current = false;
      const b = map.getBounds();
      setBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    }, 0);
  };

  const openDealerOnMap = (id: string) => {
    const map = mapRef.current;
    const marker = markersRef.current.get(id);
    if (!map || !marker) return;
    suppressMoveEndRef.current = true;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 12));
    marker.openPopup();
    setTimeout(() => {
      suppressMoveEndRef.current = false;
      const b = map.getBounds();
      setBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    }, 0);
  };

  // initialise selectedManu lazily from manufacturers
  useEffect(() => {
    if (!manufacturers.length) return;
    setSelectedManu((prev) => {
      if (Object.keys(prev).length) return prev;
      const next: Record<string, boolean> = {};
      for (const m of manufacturers) next[m.key] = true;
      return next;
    });
  }, [manufacturers]);

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
            <Button variant="secondary" onClick={centerGermany}>
              Deutschland
            </Button>
          </div>

          <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <summary className="cursor-pointer select-none text-sm font-semibold">Filter</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Hersteller</div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs text-slate-600 underline"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        for (const m of manufacturers) next[m.key] = true;
                        setSelectedManu(next);
                      }}
                      type="button"
                    >
                      alle
                    </button>
                    <button
                      className="text-xs text-slate-600 underline"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        for (const m of manufacturers) next[m.key] = false;
                        setSelectedManu(next);
                      }}
                      type="button"
                    >
                      keine
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {manufacturers.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedManu[m.key] ?? true}
                        onChange={(e) => setSelectedManu((p) => ({ ...p, [m.key]: e.target.checked }))}
                      />
                      <span>{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold">Außendienst</div>
                <div className="mt-2 flex flex-col gap-1">
                  {repsList.length ? (
                    repsList.map((r) => (
                      <label key={r.email} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedReps[r.email] ?? false}
                          onChange={(e) => setSelectedReps((p) => ({ ...p, [r.email]: e.target.checked }))}
                        />
                        <span>{r.name}</span>
                      </label>
                    ))
                  ) : (
                    <div className="text-sm text-slate-600">Noch keine AD-Profile/Gebiete importiert.</div>
                  )}
                </div>
              </div>
            </div>
          </details>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Badge tone="slate">Händler gesamt: {dealers.length}</Badge>
          <Badge tone="slate">Nach Filter: {filteredDealers.length}</Badge>
          <Badge tone="slate">Im Ausschnitt: {visibleWithGeo.length}</Badge>
          {loading ? <Badge tone="amber">Lade…</Badge> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-12">
        <Card className="md:col-span-5">
          <CardHeader className="text-sm font-semibold">Händler im Kartenausschnitt</CardHeader>
          <CardContent className="max-h-[72vh] overflow-auto">
            {mapError ? (
              <div className="text-sm text-rose-700">{mapError}</div>
            ) : visibleWithGeo.length === 0 ? (
              <div className="text-sm text-slate-600">Keine Händler im aktuellen Kartenausschnitt (oder noch ohne Geodaten).</div>
            ) : (
              <ul className="space-y-2">
                {visibleWithGeo.map((d) => {
                  const keys2 = d.manufacturer_keys ?? [];
                  const repNames = dealerRepNames.get(d.id) ?? "";
                  return (
                    <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <button className="text-left" onClick={() => openDealerOnMap(d.id)} type="button">
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
            {visibleWithGeo.length >= 700 ? <div className="mt-2 text-xs text-slate-500">Liste gekürzt auf 700.</div> : null}
          </CardContent>
        </Card>

        <Card className="md:col-span-7 h-[72vh] overflow-hidden">
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