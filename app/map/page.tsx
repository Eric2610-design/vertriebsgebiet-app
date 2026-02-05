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
    return () => {
      cancelled = true;
    };
  }, []);

  // init selection defaults once lists are loaded
  useEffect(() => {
    if (manufacturers.length && Object.keys(selectedManu).length === 0) {
      const next: Record<string, boolean> = {};
      for (const m of manufacturers) next[m.key] = true;
      next["__none__"] = true;
      setSelectedManu(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manufacturers]);

  useEffect(() => {
    if (profiles.length && Object.keys(selectedReps).length === 0) {
      const next: Record<string, boolean> = {};
      for (const p of profiles) next[p.email] = true;
      setSelectedReps(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of manufacturers) map.set(m.key, m.label);
    for (const [k, v] of Object.entries(FALLBACK_LABELS)) if (!map.has(k)) map.set(k, v);
    map.set("__none__", "Ohne Hersteller");
    return map;
  }, [manufacturers]);

  const territoriesByEmail = useMemo(() => {
    const map = new Map<string, Territory[]>();
    for (const t of territories) {
      const arr = map.get(t.profile_email) ?? [];
      arr.push(t);
      map.set(t.profile_email, arr);
    }
    return map;
  }, [territories]);

  const profileByEmail = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const p of profiles) map.set(p.email, p);
    return map;
  }, [profiles]);

  const dealerRepEmails = useMemo(() => {
    // dealer_id -> emails
    const out = new Map<string, string[]>();
    for (const d of dealers) {
      const p = plz2(d.zip);
      if (p == null) {
        out.set(d.id, []);
        continue;
      }
      const c = String(d.country ?? "DE").toUpperCase();
      const emails: string[] = [];
      for (const [email, ts] of territoriesByEmail.entries()) {
        if (ts.some((t) => String(t.country ?? "DE").toUpperCase() === c && p >= t.plz2_from && p <= t.plz2_to)) {
          emails.push(email);
        }
      }
      out.set(d.id, emails);
    }
    return out;
  }, [dealers, territoriesByEmail]);

  const selectedManuKeys = useMemo(() => {
    return new Set(Object.entries(selectedManu).filter(([, v]) => v).map(([k]) => k));
  }, [selectedManu]);

  const selectedRepEmails = useMemo(() => {
    return new Set(Object.entries(selectedReps).filter(([, v]) => v).map(([k]) => k));
  }, [selectedReps]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return dealers.filter((d) => {
      const text = `${d.name} ${d.street ?? ""} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase();
      const matchesQ = query ? text.includes(query) : true;

      const keys = (d as any).manufacturer_keys ?? [];
      const keys2 = keys.length ? keys : ["__none__"];
      const matchesManu = keys2.some((k: string) => selectedManuKeys.has(k));

      const reps = dealerRepEmails.get(d.id) ?? [];
      const matchesRep = selectedRepEmails.size ? reps.some((e) => selectedRepEmails.has(e)) : true;

      return matchesQ && matchesManu && matchesRep;
    });
  }, [dealers, q, selectedManuKeys, selectedRepEmails, dealerRepEmails]);

  const visibleInView = useMemo(() => {
    return filtered.filter((d) => inBounds(d, bounds));
  }, [filtered, bounds]);

  const visibleWithGeo = useMemo(() => visibleInView.filter((d) => d.lat != null && d.lng != null), [visibleInView]);
  const withGeoTotal = filtered.filter((d) => d.lat != null && d.lng != null).length;

  const manufacturerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dealers) {
      const keys = (d as any).manufacturer_keys ?? [];
      const keys2 = keys.length ? keys : ["__none__"];
      for (const k of keys2) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [dealers]);

  // init map once
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    let alive = true;
    (async () => {
      try {
        const L = await import("leaflet");
        if (!alive || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          zoomControl: true,
          preferCanvas: true,
        }).setView([51.16, 10.45], 6);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        const layer = L.layerGroup().addTo(map);

        map.on("moveend", () => {
          try {
            const b = map.getBounds();
            setBounds({
              south: b.getSouth(),
              west: b.getWest(),
              north: b.getNorth(),
              east: b.getEast(),
            });
          } catch {}
        });
        // initial bounds
        try {
          const b = map.getBounds();
          setBounds({
            south: b.getSouth(),
            west: b.getWest(),
            north: b.getNorth(),
            east: b.getEast(),
          });
        } catch {}

        mapRef.current = map;
        layerRef.current = layer;

        setTimeout(() => {
          try {
            map.invalidateSize();
          } catch {}
        }, 250);
      } catch (e: any) {
        setMapError(e?.message ?? "Karte konnte nicht initialisiert werden.");
      }
    })();

    return () => {
      alive = false;
      try {
        mapRef.current?.remove();
      } catch {}
      mapRef.current = null;
      layerRef.current = null;
      markerByIdRef.current = new Map();
    };
  }, []);

  // render markers when filtered changes
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    (async () => {
      const L = await import("leaflet");
      const layer = layerRef.current;
      const markerById = new Map<string, any>();

      layer.clearLayers();

      const iconFlyer = L.icon({
        iconUrl: "/marker-flyer.svg",
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });
      const iconOther = L.icon({
        iconUrl: "/marker-other.svg",
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });

      for (const d of filtered) {
        if (d.lat == null || d.lng == null) continue;

        const manufacturer_keys: string[] = (d as any).manufacturer_keys ?? [];
        const hasFlyer = (d as any).has_flyer === true || manufacturer_keys.includes("flyer");
        const keys2 = manufacturer_keys.length ? manufacturer_keys : ["__none__"];

        const brands = keys2.map((k) => labelByKey.get(k) ?? k).join(", ");
        const brandShort = keys2.slice(0, 2).map((k) => labelByKey.get(k) ?? k).join(", ") + (keys2.length > 2 ? "…" : "");

        const addrLine = `${d.street ?? ""}`.trim();
        const cityLine = `${d.zip ?? ""} ${d.city ?? ""}`.trim();

        const popupHtml = `
          <div style="min-width:220px">
            <div style="font-weight:600">${escapeHtml(d.name)}</div>
            <div style="font-size:12px;color:#475569;margin-top:2px">${escapeHtml([addrLine, cityLine].filter(Boolean).join(", "))}</div>
            <div style="font-size:12px;margin-top:6px"><b>Marken:</b> ${escapeHtml(brands)}</div>
            <div style="margin-top:8px">
              <a href="/dealer/${escapeHtml(d.id)}" style="color:#2563eb;text-decoration:underline">Details öffnen</a>
            </div>
          </div>
        `;

        const marker = L.marker([d.lat, d.lng], { icon: hasFlyer ? iconFlyer : iconOther })
          .addTo(layer)
          .bindPopup(popupHtml)
          .bindTooltip(`${d.name} (${brandShort})`, { direction: "top", offset: [0, -10] });

        markerById.set(d.id, marker);
      }

      markerByIdRef.current = markerById;
    })();
  }, [filtered, labelByKey]);

  async function runGeocode() {
    setGeocodeBusy(true);
    try {
      const res = await fetch("/api/geocode/run", { method: "POST" });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Geocoding fehlgeschlagen");
      const r2 = await fetch("/api/dealers/list", { cache: "no-store" });
      const j2 = await r2.json();
      setDealers(j2.items ?? []);
      alert(`Geocoding erledigt: ${js.ok} ok, ${js.failed} failed`);
    } finally {
      setGeocodeBusy(false);
    }
  }

  function toggleAllManufacturers(value: boolean) {
    const next: Record<string, boolean> = {};
    for (const m of manufacturers) next[m.key] = value;
    next["__none__"] = value;
    setSelectedManu(next);
  }

  function toggleAllReps(value: boolean) {
    const next: Record<string, boolean> = {};
    for (const p of profiles) next[p.email] = value;
    setSelectedReps(next);
  }

  function openDealerOnMap(dealerId: string) {
    const marker = markerByIdRef.current.get(dealerId);
    if (!marker || !mapRef.current) return;
    try {
      mapRef.current.setView(marker.getLatLng(), Math.max(mapRef.current.getZoom(), 12), { animate: true });
      marker.openPopup();
    } catch {}
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Karte</h1>
          <p className="text-sm text-slate-600">Marker anklicken für Kurzinfos – Details öffnen für Datenpflege & Besuche.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/import"><Button variant="secondary">Import</Button></Link>
          <Link href="/ad"><Button variant="secondary">Außendienst</Button></Link>
          <Link href="/"><Button variant="secondary">Home</Button></Link>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[420px_1fr]">
        <Card className="h-[70vh] overflow-hidden">
          <CardHeader className="text-sm font-semibold">Filter & Liste</CardHeader>
          <CardContent className="h-full pb-0">
            <div className="space-y-3">
              <Input
                placeholder="Suche (Name/Ort/PLZ)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <Badge tone="blue">Flyer</Badge>
                <Badge tone="slate">Andere</Badge>
                <Badge tone="amber">Gebiete</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button onClick={runGeocode} disabled={geocodeBusy}>
                  {geocodeBusy ? "Geocoding..." : "Geocoding starten"}
                </Button>
                <Button variant="secondary" onClick={() => mapRef.current?.setView([51.16, 10.45], 6)}>
                  Deutschland
                </Button>
              </div>

              <div className="text-sm text-slate-600">
                {loading ? "Lade..." : `${filtered.length} Treffer (mit Geo: ${withGeoTotal})`}
                {bounds ? ` · im Ausschnitt: ${visibleInView.length}` : ""}
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700">Hersteller</div>
                  <div className="flex gap-2">
                    <button className="text-xs text-slate-600 hover:underline" onClick={() => toggleAllManufacturers(true)}>alle</button>
                    <button className="text-xs text-slate-600 hover:underline" onClick={() => toggleAllManufacturers(false)}>keine</button>
                  </div>
                </div>
                <div className="mt-2 max-h-32 overflow-auto pr-1">
                  {[...manufacturers.map((m) => m.key), "__none__"].map((key) => (
                    <label key={key} className="flex items-center justify-between gap-2 py-1 text-sm">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedManu[key] ?? false}
                          onChange={(e) => setSelectedManu((s) => ({ ...s, [key]: e.target.checked }))}
                        />
                        <span>{labelByKey.get(key) ?? key}</span>
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
                <div className="mt-2 max-h-32 overflow-auto pr-1">
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
                <p className="mt-2 text-xs text-slate-500">Zuordnung erfolgt über 2-stellige PLZ-Bereiche (vorbereitet für Login später).</p>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Händler im Kartenausschnitt</div>
                <div className="text-xs text-slate-500">{visibleWithGeo.length}</div>
              </div>
              <div className="mt-2 h-[24vh] overflow-auto rounded-xl border border-slate-200 bg-white">
                {visibleWithGeo.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">
                    Keine Händler im Ausschnitt (oder ohne Geodaten). Zoome/verschiebe die Karte.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {visibleWithGeo.slice(0, 400).map((d) => {
                      const keys: string[] = (d as any).manufacturer_keys ?? [];
                      const keys2 = keys.length ? keys : ["__none__"];
                      const reps = dealerRepEmails.get(d.id) ?? [];
                      const repNames = reps
                        .map((e) => profileByEmail.get(e)?.display_name ?? e)
                        .slice(0, 2)
                        .join(", ") + (reps.length > 2 ? "…" : "");
                      return (
                        <li key={d.id} className="p-3 hover:bg-slate-50">
                          <button className="w-full text-left" onClick={() => openDealerOnMap(d.id)}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold">{d.name}</div>
                                <div className="text-xs text-slate-600">{`${d.zip ?? ""} ${d.city ?? ""}`.trim()}</div>
                                {repNames ? <div className="mt-1 text-xs text-slate-500">{repNames}</div> : null}
                              </div>
                              <div className="flex flex-wrap justify-end gap-1">
                                {keys2.slice(0, 2).map((k) => (
                                  <Badge key={k} tone={k === "flyer" ? "blue" : "slate"}>
                                    {labelByKey.get(k) ?? k}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </button>
                          <div className="mt-2">
                            <Link href={`/dealer/${d.id}`} className="text-xs text-blue-700 underline">
                              Händlerseite öffnen
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {visibleWithGeo.length > 400 ? (
                <div className="mt-2 text-xs text-slate-500">Liste gekürzt auf 400 Einträge (Performance).</div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="relative h-[70vh] w-full">
            <div ref={containerRef} className="h-full w-full" />
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-6 text-center">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Karte konnte nicht geladen werden</div>
                  <div className="mt-2 text-sm text-slate-600">{mapError}</div>
                  <div className="mt-3 text-xs text-slate-500">
                    Tipp: Adblock/Tracking-Schutz kann Tile-Requests blockieren. Teste sonst Inkognito.
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
