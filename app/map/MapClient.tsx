"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Dealer = {
  id: string; name: string; street?: string|null; zip?: string|null; city?: string|null; country?: string|null;
  lat?: number|null; lng?: number|null;
};

export default function MapClient({ dealers, flyerIds }: { dealers: Dealer[]; flyerIds: Set<string> }) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [q, setQ] = useState("");
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    // fix default icon paths (avoid createIcon null)
    (L.Icon.Default as any).mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = !s ? dealers : dealers.filter(d =>
      d.name.toLowerCase().includes(s) ||
      (d.city ?? "").toLowerCase().includes(s) ||
      (d.zip ?? "").toLowerCase().includes(s)
    );
    return base;
  }, [dealers, q]);

  const inView = useMemo(() => {
    const b = bounds;
    const geo = filtered.filter(d => d.lat != null && d.lng != null);
    if (!b) return geo.slice(0, 2000);
    return geo.filter(d => b.contains([d.lat!, d.lng!])).slice(0, 2000);
  }, [filtered, bounds]);

  useEffect(() => {
    const el = document.getElementById("map");
    if (!el) return;

    if (!mapRef.current) {
      const map = L.map(el, { zoomControl: true }).setView([51.1657, 10.4515], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layer;

      const onMove = () => setBounds(map.getBounds());
      map.on("moveend", onMove);
      onMove();
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    for (const d of inView) {
      const isFlyer = flyerIds.has(d.id);
      const icon = isFlyer
        ? L.divIcon({
            className: "",
            html: `<div style="transform:translate(-50%,-50%);width:14px;height:14px;border-radius:999px;background:#0ea5e9;border:2px solid white;box-shadow:0 6px 14px rgba(15,23,42,.25)"></div>`,
          })
        : undefined;

      const marker = icon ? L.marker([d.lat!, d.lng!], { icon }) : L.marker([d.lat!, d.lng!]);
      const popup = `
        <div style="font-family:ui-sans-serif,system-ui;min-width:220px">
          <div style="font-weight:800;margin-bottom:4px">${escapeHtml(d.name)}</div>
          <div style="font-size:12px;color:#475569">${escapeHtml([d.street, [d.zip, d.city].filter(Boolean).join(" ")].filter(Boolean).join(", "))}</div>
          <div style="margin-top:8">
            ${isFlyer ? `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:12px;font-weight:700">Flyer</span>` : ``}
            <a href="/dealer/${d.id}" style="display:inline-block;margin-left:8px;padding:6px 10px;border-radius:10px;border:1px solid #cbd5e1;text-decoration:none;color:#0f172a;font-weight:700;font-size:12px">Öffnen</a>
          </div>
        </div>
      `;
      marker.bindPopup(popup);
      marker.on("click", () => setSelected(d.id));
      marker.addTo(layer);
    }
  }, [inView, flyerIds]);

  const visibleList = useMemo(() => {
    // list based on inView to match map area
    const ids = new Set(inView.map(d=>d.id));
    return filtered.filter(d => ids.has(d.id)).slice(0, 300);
  }, [filtered, inView]);

  return (
    <div className="row" style={{alignItems:"stretch"}}>
      <div className="col" style={{minWidth:320}}>
        <div className="card" style={{padding:12, height:"calc(100vh - 120px)", overflow:"auto"}}>
          <div className="h2">Händler im Kartenausschnitt</div>
          <div className="small" style={{marginTop:4}}>Suche nach Name/PLZ/Ort. Anzeige auf 300 gekürzt.</div>
          <input className="input" style={{marginTop:10}} value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Suche…" />
          <div style={{marginTop:10, display:"flex", gap:8, flexWrap:"wrap"}}>
            <span className="badge">Gesamt: {dealers.length}</span>
            <span className="badge">Mit Geodaten: {dealers.filter(d=>d.lat!=null&&d.lng!=null).length}</span>
            <span className="badge">Im View: {inView.length}{inView.length>=2000 ? " (gekürzt)" : ""}</span>
          </div>
          <div style={{marginTop:10, display:"grid", gap:8}}>
            {visibleList.map(d=>(
              <a key={d.id} href={`/dealer/${d.id}`} className="card" style={{padding:10, borderRadius:14, borderColor:selected===d.id?"#0ea5e9":"#e2e8f0"}}>
                <div style={{display:"flex", justifyContent:"space-between", gap:8, alignItems:"center"}}>
                  <div style={{fontWeight:800}}>{d.name}</div>
                  {flyerIds.has(d.id) ? <span className="badge">Flyer</span> : null}
                </div>
                <div className="small" style={{marginTop:2}}>{[d.street, [d.zip, d.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="col">
        <div className="card" style={{padding:12}}>
          <div className="h2">Karte (OpenStreetMap)</div>
          <div className="small">Flyer-Händler werden als blaue Punkte angezeigt. (Standard-Marker sonst.)</div>
        </div>
        <div id="map" className="card" style={{height:"calc(100vh - 180px)", marginTop:12, borderRadius:16}} />
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
