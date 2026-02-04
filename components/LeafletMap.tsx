"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { supabase } from "@/lib/supabaseClient";

// Fix für Default Marker Icons in Next
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
(L.Marker.prototype as any).options.icon = DefaultIcon;

type Dealer = {
  id: number;
  name: string;
  city: string | null;
  postal_code: string | null;
  street: string | null;
  lat: number | null;
  lng: number | null;
  source: string | null;
};

export default function LeafletMap() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("dealers")
      .select("id,name,city,postal_code,street,lat,lng,source")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .limit(5000);

    if (error) {
      setError(error.message);
      setDealers([]);
    } else {
      setDealers((data as Dealer[]) || []);
    }

    setLoading(false);
  }

  const center = useMemo<[number, number]>(() => {
    // Default: Mitte Deutschlands
    if (!dealers.length) return [51.1657, 10.4515];
    const d = dealers[0];
    return [d.lat ?? 51.1657, d.lng ?? 10.4515];
  }, [dealers]);

  return (
    <div style={{ height: "80vh", width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid #ddd" }}>
      {loading && <div style={{ padding: 12 }}>Lade Karte…</div>}
      {error && <div style={{ padding: 12, color: "red" }}>{error}</div>}

      {!loading && !error && (
        <MapContainer center={center} zoom={6} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {dealers.map((d) => (
            <Marker key={d.id} position={[d.lat!, d.lng!]}>
              <Popup>
                <div style={{ minWidth: 220 }}>
                  <strong>{d.name}</strong>
                  <div>{d.street ?? "-"}</div>
                  <div>
                    {(d.postal_code ?? "") + " " + (d.city ?? "")}
                  </div>
                  <div style={{ opacity: 0.7, marginTop: 6 }}>
                    Quelle: {d.source ?? "-"}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}

