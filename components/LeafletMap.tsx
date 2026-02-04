"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// 🔧 Fix für Marker-Icons (Next.js + Leaflet Klassiker)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// 🧪 Testdaten – später ersetzen wir das durch echte Daten
const dealers = [
  {
    id: 1,
    name: "Test-Händler Frankfurt",
    lat: 50.11,
    lng: 8.68,
  },
  {
    id: 2,
    name: "Test-Händler Berlin",
    lat: 52.52,
    lng: 13.405,
  },
];

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

      {dealers.map((dealer) => (
        <Marker
          key={dealer.id}
          position={[dealer.lat, dealer.lng]}
        >
          <Popup>
            <strong>{dealer.name}</strong>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
