"use client";

import "leaflet/dist/leaflet.css";

import React, { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";

export type Dealer = {
  id: number | string;
  name: string;
  street?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
};

type Props = {
  dealers: Dealer[];
  center?: [number, number];
  zoom?: number;
  heightVh?: number; // z.B. 75
};

export default function LeafletMap({
  dealers,
  center = [51.1657, 10.4515], // Deutschland
  zoom = 6,
  heightVh = 75,
}: Props) {
  // Fix für Default Marker Icons (sonst "marker" oft unsichtbar in Next/Vercel)
  useEffect(() => {
    const iconRetinaUrl =
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
    const iconUrl =
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
    const shadowUrl =
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

    // @ts-expect-error - Leaflet private API Patch
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl,
      iconUrl,
      shadowUrl,
    });
  }, []);

  // Nur Händler mit Geo
  const geoDealers = useMemo(() => {
    return dealers.filter(
      (d) =>
        typeof d.lat === "number" &&
        typeof d.lng === "number" &&
        !Number.isNaN(d.lat) &&
        !Number.isNaN(d.lng)
    );
  }, [dealers]);

  return (
    <div
      style={{
        height: `${heightVh}vh`,
        width: "100%",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #ddd",
      }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {geoDealers.map((d) => (
          <Marker key={String(d.id)} position={[d.lat as number, d.lng as number]}>
            <Popup>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{d.name}</div>
                <div style={{ fontSize: 13, lineHeight: 1.35 }}>
                  {[d.street, [d.zipcode, d.city].filter(Boolean).join(" "), d.country]
                    .filter(Boolean)
                    .join(", ")}
                </div>
                {d.source ? (
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
                    Quelle: {d.source}
                  </div>
                ) : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
