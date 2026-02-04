"use client";

import { dealers } from "../lib/dealers";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix für Marker-Icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});



export default function LeafletMap() {
  return (
    <MapContainer
      center={[50.11, 8.68]}
      zoom={6}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution="© OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {dealers.map((d) => (
        <Marker key={d.id} position={[d.lat, d.lng]}>
          <Popup>
            <strong>{d.name}</strong>
            <br />
            {d.city}
            <br />
            <Link href={`/dealers/${d.id}`}>
              Details öffnen →
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

