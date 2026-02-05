"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Badge, Input } from "@/components/ui";
import type { Dealer, ManufacturerKey } from "@/lib/types";

type DealerListItem = Dealer & { has_flyer?: boolean; manufacturer_keys?: ManufacturerKey[] };
type Filter = { flyer: boolean; others: boolean; q: string };

const LABELS: Record<string, string> = {
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

export default function MapPage() {
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [dealers, setDealers] = useState<DealerListItem[]>([]);
  const [filter, setFilter] = useState<Filter>({ flyer: true, others: true, q: "" });
  const [loading, setLoading] = useState(true);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/dealers/list", { cache: "no-store" });
        const js = await res.json();
        if (!cancelled) setDealers(js.items ?? []);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return dealers.filter((d) => {
      const text = `${d.name} ${d.street ?? ""} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase();
      const matches = q ? text.includes(q) : true;
      const hasFlyer = (d as any).has_flyer === true || (d.manufacturer_keys ?? []).includes("flyer");
      const passes = (hasFlyer && filter.flyer) || (!hasFlyer && filter.others);
      return matches && passes;
    });
  }, [dealers, filter]);

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

        // OSM Tiles (fallback-friendly)
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        const layer = L.layerGroup().addTo(map);

        mapRef.current = map;
        layerRef.current = layer;

        // Sometimes the container is initially hidden / not measured -> avoid white map
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
    };
  }, []);

  // render markers when filtered changes
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    (async () => {
      const L = await import("leaflet");
      const layer = layerRef.current;

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

        const manufacturer_keys = (d as any).manufacturer_keys ?? [];
        const hasFlyer = (d as any).has_flyer === true || manufacturer_keys.includes("flyer");

        const brands =
          manufacturer_keys.length > 0
            ? manufacturer_keys.map((k: string) => LABELS[k] ?? k).join(", ")
            : hasFlyer
              ? "FLYER"
              : "—";

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

        L.marker([d.lat, d.lng], { icon: hasFlyer ? iconFlyer : iconOther })
          .addTo(layer)
          .bindPopup(popupHtml);
      }
    })();
  }, [filtered]);

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

  const withGeo = filtered.filter((d) => d.lat != null && d.lng != null).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Karte</h1>
          <p className="text-sm text-slate-600">Klicke auf einen Marker für Kurzinfos oder Details.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/import"><Button variant="secondary">Import</Button></Link>
          <Link href="/"><Button variant="secondary">Home</Button></Link>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader className="text-sm font-semibold">Filter & Aktionen</CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="blue">Flyer</Badge>
              <Badge tone="slate">Andere</Badge>
            </div>

            <div className="flex gap-2">
              <Button
                variant={filter.flyer ? "primary" : "secondary"}
                onClick={() => setFilter((f) => ({ ...f, flyer: !f.flyer }))}
              >
                Flyer
              </Button>
              <Button
                variant={filter.others ? "primary" : "secondary"}
                onClick={() => setFilter((f) => ({ ...f, others: !f.others }))}
              >
                Andere
              </Button>
            </div>

            <Input
              placeholder="Suche (Name/Ort/PLZ)"
              value={filter.q}
              onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
            />

            <div className="text-sm text-slate-600">
              {loading ? "Lade..." : `${filtered.length} Treffer (mit Geo: ${withGeo})`}
            </div>

            <Button onClick={runGeocode} disabled={geocodeBusy}>
              {geocodeBusy ? "Geocoding..." : "Geocoding für fehlende starten"}
            </Button>

            <p className="text-xs text-slate-500">
              Hinweis: OpenStreetMap (Nominatim) ist rate-limited. Bei vielen Händlern ggf. mehrfach starten.
            </p>
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
