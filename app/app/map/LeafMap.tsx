"use client";

import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import Supercluster from "supercluster";

type MapRow = {
  location_id: string;
  dealer_id: string;
  dealer_name: string;
  street: string | null;
  zipcode: string | null;
  city: string | null;
  lat: number;
  lng: number;
  sources: string[];
};

function dotIcon(className: string) {
  return L.divIcon({
    className: "",
    html: `<div class="${className}"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function clusterIcon(count: number) {
  return L.divIcon({
    className: "",
    html: `<div class="cluster-dot">${count}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function FitToPoints({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.2));
  }, [map, points]);
  return null;
}

function ClusterLayer({ locations }: { locations: MapRow[] }) {
  const map = useMap();
  const [zoom, setZoom] = useState<number>(6);
  const [bbox, setBbox] = useState<[number, number, number, number]>([5, 47, 16, 55]);

  useMapEvents({
    moveend() {
      const b = map.getBounds();
      setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      setZoom(map.getZoom());
    },
    zoomend() {
      const b = map.getBounds();
      setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      setZoom(map.getZoom());
    },
  });

  const index = useMemo(() => {
    const sc = new Supercluster({ radius: 60, maxZoom: 18 });
    sc.load(
      locations.map((l) => ({
        type: "Feature",
        properties: {
          cluster: false,
          location_id: l.location_id,
          dealer_id: l.dealer_id,
          dealer_name: l.dealer_name,
          street: l.street,
          zipcode: l.zipcode,
          city: l.city,
          sources: l.sources,
        },
        geometry: { type: "Point", coordinates: [l.lng, l.lat] },
      })) as any
    );
    return sc;
  }, [locations]);

  const clusters = useMemo(() => index.getClusters(bbox, Math.round(zoom)) as any[], [index, bbox, zoom]);

  return (
    <>
      {clusters.map((c: any) => {
        const [lng, lat] = c.geometry.coordinates;
        const isCluster = !!c.properties.cluster;

        if (isCluster) {
          const clusterId = c.id as number;
          const pointCount = c.properties.point_count as number;
          return (
            <Marker
              key={`cluster-${clusterId}`}
              position={[lat, lng]}
              icon={clusterIcon(pointCount)}
              eventHandlers={{
                click: () => {
                  const z = Math.min(index.getClusterExpansionZoom(clusterId), 18);
                  map.setView([lat, lng], z);
                },
              }}
            />
          );
        }

        const p = c.properties;
        return (
          <Marker key={p.location_id} position={[lat, lng]} icon={dotIcon("marker-dot")}>
            <Popup>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 800 }}>{p.dealer_name}</div>
                <small>{[p.street, `${p.zipcode ?? ""} ${p.city ?? ""}`].filter(Boolean).join(", ")}</small>
                <div style={{ marginTop: 8 }}>
                  <small>Quellen: {(p.sources ?? []).join(", ")}</small>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export default function LeafletMap({ locations }: { locations: MapRow[] }) {
  const points = useMemo(() => locations.map((l) => ({ lat: l.lat, lng: l.lng })), [locations]);
  const center: [number, number] = [51.1657, 10.4515]; // Mitte DE

  return (
    <MapContainer center={center} zoom={6} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitToPoints points={points} />
      <ClusterLayer locations={locations} />
    </MapContainer>
  );
}
