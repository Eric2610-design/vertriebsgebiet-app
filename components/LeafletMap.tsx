"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function LeafletMap() {
  return (
    <MapContainer center={[50.1109, 8.6821]} zoom={6} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[50.1109, 8.6821]}>
        <Popup>Test-Händler</Popup>
      </Marker>
    </MapContainer>
  );
}