"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix für Marker-Icons (wichtig für Next.js)
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

      {/* Test-Marker */}
      <Marker position={[50.11, 8.68]}>
        <Popup>
          <strong>Test-Händler</strong>
          <br />
          Frankfurt am Main
        </Popup>
      </Marker>

      <Marker position={[52.52, 13.405]}>
        <Popup>
          <strong>Zweiter Händler</strong>
          <br />
          Berlin
        </Popup>
      </Marker>
    </MapContainer>
  );
}
