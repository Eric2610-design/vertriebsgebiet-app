"use client";

import "leaflet/dist/leaflet.css";

import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import Supercluster from "supercluster";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
} from "react-leaflet";

export type Dealer = {
  id: number | string;
  name: string;
  street?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
};

type Props = {
  dealers: Dealer[];
  center?: [number, number];
  zoom?: number;
  heightVh?: number;
};

type GeoPointFeature = GeoJSON.Feature<GeoJSON.Point, { dealerId: string; dealer: Dealer }>;
type ClusterFeature = GeoJSON.Feature<GeoJSON.Point, any>;

function createClusterIcon(count: number) {
  const size =
    count < 10 ? 34 :
    count < 50 ? 40 :
    count < 200 ? 48 : 56;

  return L.divIcon({
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:${size}px;
        display:flex;
        align-items:center;
        justify-content:center;
        background:rgba(33, 150, 243, 0.85);
        border:2px solid rgba(255,255,255,0.9);
        box-shadow:0 4px 14px rgba(0,0,0,0.18);
        font-weight:700;
        color:white;
        font-size:${count < 100 ? 14 : 13}px;
      ">${count}</div>
    `,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function ensureLeafletDefaultIcon() {
  const iconRetinaUrl =
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
  const iconUrl =
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
  const shadowUrl =
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

  // @ts-expect-error Leaflet private API patch
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl,
    iconUrl,
    shadowUrl,
  });
}

function MapWatcher({
  onChange,
}: {
  onChange: (b: { bounds: [number, number, number, number]; zoom: number }) => void;
}) {
  useMapEvents({
    moveend: (e) => {
      const m = e.target;
      const b = m.getBounds();
      onChange({
        bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        zoom: m.getZoom(),
      });
    },
    zoomend: (e) => {
      const m = e.target;
      const b = m.getBounds();
      onChange({
        bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        zoom: m.getZoom(),
      });
    },
  });
  return null;
}

export default function LeafletMap({
  dealers,
  center = [51.1657, 10.4515],
  zoom = 6,
  heightVh = 75,
}: Props) {
  const mapRef = useRef<L.Map | null>(null);

  const [view, setView] = useState<{ bounds: [number, number, number, number]; zoom: number } | null>(null);

  useEffect(() => {
    ensureLeafletDefaultIcon();
  }, []);

  // 1) Nur valide Geo-Dealer
  const geoDealers = useMemo(() => {
    return (dealers ?? []).filter(
      (d) =>
        typeof d.lat === "number" &&
        typeof d.lng === "number" &&
        Number.isFinite(d.lat) &&
        Number.isFinite(d.lng)
    );
  }, [dealers]);

  // 2) Supercluster Index bauen
  const clusterIndex = useMemo(() => {
    const points: GeoPointFeature[] = geoDealers.map((d) => ({
      type: "Feature",
      properties: { dealerId: String(d.id), dealer: d },
      geometry: {
        type: "Point",
        coordinates: [d.lng as number, d.lat as number],
      },
    }));

    const sc = new Supercluster({
      radius: 60,
      maxZoom: 17,
    });

    sc.load(points as any);
    return sc;
  }, [geoDealers]);

  // 3) Cluster für aktuellen View berechnen
  const clusters: ClusterFeature[] = useMemo(() => {
    if (!view) return [];
    const { bounds, zoom } = view;
    return clusterIndex.getClusters(bounds, Math.round(zoom)) as any;
  }, [clusterIndex, view]);

  return (
    <div
      style={{
        height: `${heightVh}vh`,
        width: "100%",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #ddd",
      }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
        whenCreated={(m) => {
          mapRef.current = m;
          const b = m.getBounds();
          setView({
            bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
            zoom: m.getZoom(),
          });
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* hält bounds/zoom aktuell */}
        <MapWatcher onChange={setView} />

        {clusters.map((c) => {
          const [lng, lat] = c.geometry.coordinates as [number, number];
          const props: any = c.properties;

          const isCluster = props.cluster;
          if (isCluster) {
            const count = props.point_count as number;
            const clusterId = props.cluster_id as number;

            return (
              <Marker
                key={`cluster-${clusterId}`}
                position={[lat, lng]}
                icon={createClusterIcon(count)}
                eventHandlers={{
                  click: () => {
                    const m = mapRef.current;
                    if (!m) return;
                    const nextZoom = Math.min(clusterIndex.getClusterExpansionZoom(clusterId), 18);
                    m.setView([lat, lng], nextZoom, { animate: true });
                  },
                }}
              />
            );
          }

          // Einzelpunkt
          const dealer: Dealer = props.dealer;
          return (
            <Marker key={`dealer-${dealer.id}`} position={[lat, lng]}>
              <Popup>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{dealer.name}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.35 }}>
                    {[
                      dealer.street,
                      [dealer.zipcode, dealer.city].filter(Boolean).join(" "),
                      dealer.country,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                  {dealer.source ? (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
                      Quelle: {dealer.source}
                    </div>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
