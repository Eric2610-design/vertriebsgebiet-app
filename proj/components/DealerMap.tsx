"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import Supercluster from "supercluster";
import Link from "next/link";

// Leaflet Icon Fix (Next.js)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export type MapDealer = {
  id: number;
  name: string;
  city?: string | null;
  zipcode?: string | null;
  source?: string | null;
  lat: number;
  lng: number;
  is_master?: boolean | null;
};

type Props = {
  dealers: MapDealer[];
  center?: [number, number];
  zoom?: number;
};

function ClusterLayer({ dealers }: { dealers: MapDealer[] }) {
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [zoom, setZoom] = useState(6);

  const points = useMemo(() => {
    return dealers
      .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
      .map((d) => ({
        type: "Feature" as const,
        properties: {
          cluster: false,
          dealerId: d.id,
          name: d.name,
          city: d.city,
          zipcode: d.zipcode,
          source: d.source,
          is_master: d.is_master,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [d.lng, d.lat],
        },
      }));
  }, [dealers]);

  const clusterIndex = useMemo(() => {
    const sc = new Supercluster({
      radius: 60,
      maxZoom: 18,
    });
    sc.load(points as any);
    return sc;
  }, [points]);

  const clusters = useMemo(() => {
    if (!bounds) return [];
    const [west, south, east, north] = bounds;
    return clusterIndex.getClusters([west, south, east, north], zoom);
  }, [bounds, zoom, clusterIndex]);

  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      setZoom(map.getZoom());
    },
    zoomend: () => {
      const b = map.getBounds();
      setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      setZoom(map.getZoom());
    },
  });

  useEffect(() => {
    const b = map.getBounds();
    setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    setZoom(map.getZoom());
  }, [map]);

  return (
    <>
      {clusters.map((c: any) => {
        const [lng, lat] = c.geometry.coordinates;
        const isCluster = c.properties.cluster;

        if (isCluster) {
          const count = c.properties.point_count as number;
          const id = c.id;

          const icon = L.divIcon({
            html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;background:rgba(59,130,246,0.85);border:1px solid rgba(255,255,255,0.35);color:white;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,0.35);">${count}</div>`,
            className: "",
            iconSize: [36, 36],
          });

          return (
            <Marker
              key={`cluster-${id}`}
              position={[lat, lng]}
              icon={icon}
              eventHandlers={{
                click: () => {
                  const expansion = Math.min(clusterIndex.getClusterExpansionZoom(id), 18);
                  map.setView([lat, lng], expansion, { animate: true });
                },
              }}
            />
          );
        }

        const dealerId = c.properties.dealerId as number;
        const name = c.properties.name as string;
        const city = c.properties.city as string | null;
        const zipcode = c.properties.zipcode as string | null;
        const source = c.properties.source as string | null;
        const isMaster = c.properties.is_master as boolean | null;

        return (
          <Marker key={`dealer-${dealerId}`} position={[lat, lng]}>
            <Popup>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>{name}</div>
                <div style={{ opacity: 0.85, fontSize: 13 }}>
                  {[zipcode, city].filter(Boolean).join(" ") || "—"}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {source ? <span className="badge">{source}</span> : null}
                  {isMaster === true ? <span className="badge ok">Master</span> : null}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Link href={`/dealers/${dealerId}`} style={{ color: "#93c5fd", fontWeight: 700 }}>
                    Details öffnen →
                  </Link>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export default function DealerMap({ dealers, center = [51.0, 10.0], zoom = 6 }: Props) {
  return (
    <div className="mapFrame">
      <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution="© OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClusterLayer dealers={dealers} />
      </MapContainer>
    </div>
  );
}
