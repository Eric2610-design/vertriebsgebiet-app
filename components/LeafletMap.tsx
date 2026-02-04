"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type Dealer = {
  id: number;
  name: string;
  lat: number;
  lng: number;
};

export default function LeafletMap() {
  const [dealers, setDealers] = useState<Dealer[]>([]);

  useEffect(() => {
    fetch("/api/dealers")
      .then((r) => r.json())
      .then(setDealers)
      .catch(console.error);
  }, []);

  return (
    <MapContainer center={[50.11, 8.68]} zoom={6} style={{ height: "100%", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {dealers.map((d) => (
        <Marker key={d.id} position={[d.lat, d.lng]}>
          <Popup>{d.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
