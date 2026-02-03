"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

export default function DealerMiniMap({ lat, lng }: { lat: number; lng: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    if (!mapRef.current) {
      const map = L.map(ref.current, {
        zoomControl: true,
        scrollWheelZoom: false,
      }).setView([lat, lng], 14);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      const marker = L.marker([lat, lng]).addTo(map);

      mapRef.current = map;
      markerRef.current = marker;
    } else {
      mapRef.current.setView([lat, lng], 14);
      markerRef.current?.setLatLng([lat, lng]);
    }

    return () => {
      // nichts – Map bleibt für Performance bestehen
    };
  }, [lat, lng]);

  return (
    <div
      ref={ref}
      style={{
        height: 240,
        width: "100%",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid #eee",
      }}
    />
  );
}
