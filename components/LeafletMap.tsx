"use client";

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import UploadBox, { UploadedDealer } from "./UploadBox";

// 🔧 Leaflet Icon Fix (Next.js)
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
  const [dealers, setDealers] = useState<UploadedDealer[]>([]);

  // 🔁 temporäre Übergabe an Detailseiten
  useEffect(() => {
    (window as any).__DEALERS__ = dealers;
  }, [dealers]);

  return (
    <>
      <UploadBox onUpload={setDealers} />

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
              <br />
              {dealer.city}
              <br />
              <Link href={`/dealers/${dealer.id}`}>
                Details öffnen →
              </Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </>
  );
}
