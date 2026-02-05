"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { useRouter } from "next/navigation";
import type { Dealer } from "@/lib/types";
import { Card, CardContent, Button, Badge } from "@/components/ui";

const MANUFACTURER_LABELS: Record<string, string> = {
  flyer: "FLYER",
  riese_mueller: "Riese & Müller",
  bergamont: "Bergamont",
  zeg: "ZEG",
  bico: "BICO",
  kalkhoff: "Kalkhoff",
};

function esc(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function svgPin(color: string) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
    <path fill="${color}" d="M12 2c-3.86 0-7 3.14-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7z"/>
    <circle cx="12" cy="9" r="2.6" fill="white" opacity="0.95"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

export default function GoogleMapClient({ dealers }: { dealers: Dealer[] }) {
  const router = useRouter();
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);

  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const bounds = useMemo(() => {
    // precompute bounds for visible dealers (optional)
    const pts = dealers.filter((d) => d.lat != null && d.lng != null);
    return pts.length ? pts : null;
  }, [dealers]);

  useEffect(() => {
    if (!key) return;
    if (!mapDivRef.current) return;
    if (mapRef.current) return; // already initialized

    let cancelled = false;
    setLoading(true);
    const loader = new Loader({ apiKey: key, version: "weekly" });

    loader
      .load()
      .then(() => {
        if (cancelled) return;

        // Basic map
        const map = new google.maps.Map(mapDivRef.current!, {
          center: { lat: 51.16, lng: 10.45 },
          zoom: 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });

        mapRef.current = map;
        infoRef.current = new google.maps.InfoWindow();
        setMapError(null);
      })
      .catch((e) => {
        setMapError(e?.message ? String(e.message) : "Google Maps konnte nicht geladen werden");
      })
      .finally(() => setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // clear old
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];

    const info = infoRef.current ?? new google.maps.InfoWindow();
    infoRef.current = info;

    const valid = dealers.filter((d: any) => d.lat != null && d.lng != null);

    for (const d of valid as any[]) {
      const hasFlyer = d.has_flyer === true;
      const manufacturers: string[] = Array.isArray(d.manufacturers) ? d.manufacturers : (hasFlyer ? ["flyer"] : []);
      const labels = manufacturers.map((k) => MANUFACTURER_LABELS[k] ?? k).filter(Boolean);
      const labelLine = labels.length ? labels.join(", ") : "—";

      const iconUrl = svgPin(hasFlyer ? "#10b981" : "#64748b"); // emerald vs slate

      const marker = new google.maps.Marker({
        map,
        position: { lat: Number(d.lat), lng: Number(d.lng) },
        title: d.name,
        icon: {
          url: iconUrl,
          scaledSize: new google.maps.Size(32, 32),
          anchor: new google.maps.Point(16, 32),
        },
      });

      marker.addListener("click", () => {
        const btnId = `open-${d.id}`;
        const html = `
          <div style="font-family: ui-sans-serif, system-ui; min-width: 220px;">
            <div style="font-weight: 650; font-size: 14px; margin-bottom: 2px;">${esc(String(d.name ?? ""))}</div>
            <div style="font-size: 12px; color: #475569; margin-bottom: 8px;">
              ${esc(String(d.street ?? ""))}<br/>
              ${esc(String(d.zip ?? ""))} ${esc(String(d.city ?? ""))}
            </div>
            <div style="font-size: 12px; margin-bottom: 10px;">
              <span style="color:#0f172a; font-weight:600;">Marke:</span>
              <span style="color:#334155;"> ${esc(labelLine)}</span>
            </div>
            <button id="${btnId}" style="
              background:#0f172a;color:#fff;border:0;border-radius:10px;
              padding:8px 10px;font-size:12px;cursor:pointer;
            ">Details öffnen</button>
          </div>
        `;
        info.setContent(html);
        info.open({ anchor: marker, map });

        google.maps.event.addListenerOnce(info, "domready", () => {
          const el = document.getElementById(btnId);
          if (el) el.addEventListener("click", () => router.push(`/dealer/${d.id}`));
        });
      });

      markersRef.current.push(marker);
    }

    // Fit bounds when there are results (but don't jump too aggressively)
    if (bounds && bounds.length) {
      const b = new google.maps.LatLngBounds();
      for (const d of bounds as any[]) b.extend({ lat: Number(d.lat), lng: Number(d.lng) });
      map.fitBounds(b, 48);
    }
  }, [dealers, bounds, router]);

  if (!key) {
    return (
      <Card className="p-4">
        <CardContent className="space-y-3">
          <div className="text-slate-900 font-semibold">Google Maps ist noch nicht aktiviert.</div>
          <div className="text-slate-600 text-sm">
            Setze in Vercel die Env-Var <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> (Maps JavaScript API).
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge>Vercel → Settings → Environment Variables</Badge>
            <Badge>Redeploy danach</Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapDivRef} className="absolute inset-0 rounded-2xl overflow-hidden border border-slate-100" />
      {(loading || mapError) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/95 border border-slate-200 shadow-soft rounded-2xl p-4 max-w-md pointer-events-auto">
            {loading ? (
              <div className="text-slate-700">Google Maps lädt…</div>
            ) : (
              <div className="text-slate-800">
                <div className="font-semibold mb-1">Karte konnte nicht geladen werden</div>
                <div className="text-sm text-slate-600">{mapError}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
