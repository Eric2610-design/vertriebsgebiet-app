"use client";

import dynamic from "next/dynamic";
import React from "react";
import type { Dealer } from "@/components/LeafletMap";

// LeafletMap nur im Browser rendern (SSr aus!)
const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "75vh",
        width: "100%",
        borderRadius: 12,
        border: "1px solid #ddd",
        display: "grid",
        placeItems: "center",
      }}
    >
      Karte lädt…
    </div>
  ),
});

export default function MapClient({ dealers }: { dealers: Dealer[] }) {
  // Defensive: falls irgendwas kaputt ankommt
  const safe = Array.isArray(dealers) ? dealers : [];

  return (
    <LeafletMap
      dealers={safe}
      center={[51.1657, 10.4515]}
      zoom={6}
      heightVh={75}
    />
  );
}
