"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Badge, Input } from "@/components/ui";
import type { Dealer } from "@/lib/types";

type Filter = { flyer: boolean; others: boolean; q: string };

export default function MapPage() {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [filter, setFilter] = useState<Filter>({ flyer: true, others: true, q: "" });
  const [loading, setLoading] = useState(true);
  const [geocodeBusy, setGeocodeBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/dealers/list");
      const js = await res.json();
      if (!cancelled) setDealers(js.items ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return dealers.filter((d) => {
      const text = `${d.name} ${d.street ?? ""} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase();
      const matches = q ? text.includes(q) : true;
      // flyer tag is computed server-side into notes? we get manufacturer list separately; server returns has_flyer
      const hasFlyer = (d as any).has_flyer === true;
      const passes = (hasFlyer && filter.flyer) || (!hasFlyer && filter.others);
      return matches && passes;
    });
  }, [dealers, filter]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://demotiles.maplibre.org/style.json",
        center: [10.45, 51.16],
        zoom: 5.3,
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
      mapRef.current = map;
    }

    const map = mapRef.current!;
    // remove old markers
    (map as any).__markers?.forEach((m: any) => m.remove());
    (map as any).__markers = [];

    for (const d of filtered) {
      if (d.lat == null || d.lng == null) continue;
      const el = document.createElement("div");
      el.className = "rounded-full border border-white shadow-soft";
      el.style.width = "12px";
      el.style.height = "12px";
      const hasFlyer = (d as any).has_flyer === true;
      el.style.background = hasFlyer ? "#2563eb" : "#475569"; // blue vs slate
      el.style.cursor = "pointer";
      el.title = d.name;

      el.addEventListener("click", () => {
        window.location.href = `/dealer/${d.id}`;
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([d.lng, d.lat])
        .addTo(map);
      (map as any).__markers.push(marker);
    }
  }, [filtered]);

  async function runGeocode() {
    setGeocodeBusy(true);
    try {
      const res = await fetch("/api/geocode/run", { method: "POST" });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Geocoding fehlgeschlagen");
      // refresh
      const r2 = await fetch("/api/dealers/list");
      const j2 = await r2.json();
      setDealers(j2.items ?? []);
      alert(`Geocoding erledigt: ${js.ok} ok, ${js.failed} failed`);
    } finally {
      setGeocodeBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Karte</h1>
          <p className="text-sm text-slate-600">Klicke auf einen Marker für die Händlerseite.</p>
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
              <Button variant={filter.flyer ? "primary" : "secondary"} onClick={() => setFilter(f => ({...f, flyer: !f.flyer}))}>
                Flyer
              </Button>
              <Button variant={filter.others ? "primary" : "secondary"} onClick={() => setFilter(f => ({...f, others: !f.others}))}>
                Andere
              </Button>
            </div>
            <Input placeholder="Suche (Name/Ort/PLZ)" value={filter.q} onChange={(e)=>setFilter(f=>({...f,q:e.target.value}))} />
            <div className="text-sm text-slate-600">
              {loading ? "Lade..." : `${filtered.length} Treffer (mit Geo: ${filtered.filter(d=>d.lat!=null&&d.lng!=null).length})`}
            </div>
            <Button onClick={runGeocode} disabled={geocodeBusy}>
              {geocodeBusy ? "Geocoding..." : "Geocoding für fehlende starten"}
            </Button>
            <p className="text-xs text-slate-500">
              Hinweis: Nominatim ist rate-limited. Bei vielen Händlern ggf. mehrfach starten.
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div ref={containerRef} className="h-[70vh] w-full" />
        </Card>
      </div>
    </main>
  );
}
