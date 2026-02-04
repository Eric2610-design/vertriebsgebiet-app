"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix für fehlende Marker-Icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Dealer = {
  id: number;
  name: string;
  lat: number;
  lng: number;
};

export default function LeafletMap() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dealers")
      .then((res) => res.json())
      .then((data) => {
        setDealers(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load dealers", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div style={{ padding: 20 }}>Lade Händler…</div>;
  }

  return (
    <MapContainer
      center={[50.11, 8.68]} // Deutschland-Mitte
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
            <br />
            <Link href={`/dealers/${dealer.id}`}>
              Details öffnen →
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
