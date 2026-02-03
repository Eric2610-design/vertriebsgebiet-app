"use client";

import React, { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

function icon() {
  return L.divIcon({
    className: "",
    html: `<div class="marker-dot"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function fmtAddr(l: any) {
  const street = l?.street ?? l?.address ?? null;
  const zip = l?.zipcode ?? l?.zip ?? null;
  const city = l?.city ?? null;
  return [street, [zip, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export default function DealerMiniMap({ locations }: { locations: any[] }) {
  const pts = useMemo(() => {
    return (locations ?? [])
      .map((l: any) => ({
        id: l?.id ?? fmtAddr(l),
        lat: l?.lat ?? l?.latitude ?? null,
        lng: l?.lng ?? l?.longitude ?? l?.lon ?? null,
        label: fmtAddr(l),
      }))
      .filter((p: any) => typeof p.lat === "number" && typeof p.lng === "number");
  }, [locations]);

  const center: [number, number] = pts.length ? [pts[0].lat, pts[0].lng] : [51.1657, 10.4515];

  return (
    <MapContainer center={center} zoom={pts.length ? 12 : 6} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pts.map((p: any) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={icon()}>
          <Popup>
            <div style={{ minWidth: 220 }}>
              <b>Standort</b>
              <div style={{ marginTop: 6 }}>{p.label || "—"}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
