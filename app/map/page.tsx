"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

import { Badge, Button, Card, CardContent, CardHeader, Input } from "@/components/ui";
import { DealerListPictos } from "@/components/DealerListPictos";
import { Pictogram } from "@/components/Pictogram";
import type { Dealer, Manufacturer, Profile, Territory } from "@/lib/types";
import { BUYING_GROUP_ICON_FALLBACK, MANUFACTURER_ICON_FALLBACK } from "@/lib/pictograms";

type DealerListItem = Dealer & {
  manufacturer_keys?: string[];
};

type Bounds = { south: number; west: number; north: number; east: number };

const FALLBACK_LABELS: Record<string, string> = {
  flyer: "FLYER",
  riese_mueller: "Riese & Müller",
  bergamont: "Bergamont",
  kalkhoff: "Kalkhoff",
};

const BUYING_GROUP_KEYS = new Set(["zeg", "bico", "bikeco"]);

function escapeHtml(s: string) {
  // Avoid String.prototype.replaceAll for compatibility with older browsers.
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function plz2(zip?: string | null): number | null {
  if (!zip) return null;
  const m = String(zip).match(/(\d{2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function inBounds(d: DealerListItem, b: Bounds | null) {
  if (!b) return true;
  if (d.lat == null || d.lng == null) return false;
  return d.lat >= b.south && d.lat <= b.north && d.lng >= b.west && d.lng <= b.east;
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Map<string, Leaflet.Marker>>(new Map());
  const suppressMoveEndRef = useRef(false);

  const leafletRef = useRef<any>(null);
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod: any = await import("leaflet");
        const L = mod?.default ?? mod;
        if (!cancelled) {
          leafletRef.current = L;
          setLeafletReady(true);
        }
      } catch (e: any) {
        if (!cancelled) setMapError(e?.message ?? "Leaflet konnte nicht geladen werden");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dealers, setDealers] = useState<DealerListItem[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [buyingGroups, setBuyingGroups] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);

  // Einkaufsverbände (z.B. ZEG/BICO) sind **keine** Hersteller und sollen nicht in den Hersteller-Filtern auftauchen.
  const manufacturersForUi = useMemo(() => {
    return manufacturers.filter((m) => !BUYING_GROUP_KEYS.has(m.key));
  }, [manufacturers]);

  const [q, setQ] = useState("");
  const [selectedManu, setSelectedManu] = useState<Record<string, boolean>>({});
  const [selectedReps, setSelectedReps] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  // Geo-duplicate merging (quick access on the map page)
  const [geoDupGroups, setGeoDupGroups] = useState<any[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [geoMaster, setGeoMaster] = useState<Record<string, string>>({});
  const [geoSelected, setGeoSelected] = useState<Record<string, Record<string, boolean>>>({});
  const [geoForce, setGeoForce] = useState<Record<string, boolean>>({});

  // "Einkaufsverbänden folgen" = optional Filter nach Einkaufsverband.
  const [selectedBuyingGroups, setSelectedBuyingGroups] = useState<Record<string, boolean>>({});

  // load initial data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setMapError(null);
        setLoading(true);
        const [dRes, mRes, rRes, bgRes] = await Promise.all([
          fetch("/api/dealers/list", { cache: "no-store" }),
          fetch("/api/manufacturers/list", { cache: "no-store" }),
          fetch("/api/reps/list", { cache: "no-store" }),
          fetch("/api/buying-groups/list", { cache: "no-store" }),
        ]);
        const dJs = await dRes.json();
        const mJs = await mRes.json();
        const rJs = await rRes.json();
        const bgJs = await bgRes.json();
        if (cancelled) return;
        setDealers(dJs.items ?? []);
        setManufacturers(mJs.items ?? []);
        setProfiles(rJs.profiles ?? []);
        setTerritories(rJs.territories ?? []);
        setBuyingGroups(bgJs.items ?? []);
        setMapError(null);
      } catch (e: any) {
        if (!cancelled) setMapError(e?.message ?? "Fehler beim Laden");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // load geo-duplicate suggestions (optional quick merge on this page)
  const loadGeoDup = async () => {
    try {
      setDupLoading(true);
      const res = await fetch("/api/duplicates", { cache: "no-store" });
      const js = await res.json().catch(() => ({}));
      setGeoDupGroups(js.geo_duplicates ?? []);
    } finally {
      setDupLoading(false);
    }
  };

  useEffect(() => {
    // load once in the background; user can refresh manually.
    loadGeoDup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGeoSel = (groupKey: string, dealerId: string, checked: boolean) => {
    setGeoSelected((prev) => {
      const g = { ...(prev[groupKey] ?? {}) };
      g[dealerId] = checked;
      return { ...prev, [groupKey]: g };
    });
  };

  const runGeoDupMerge = async (group: any) => {
    const master = geoMaster[group.key] ?? group.suggested_master_id ?? group.dealers?.[0]?.id;
    const picks = geoSelected[group.key] ?? {};
    const merge_ids = Object.entries(picks)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .filter((x) => x !== master);
    if (merge_ids.length === 0) return alert("Bitte mindestens eine Dublette auswählen");
    const force = geoForce[group.key] ?? true;
    if (!confirm(`Zusammenführen?\n\nMaster bleibt: ${group.dealers?.find((d: any) => d.id === master)?.name ?? master}\nDubletten: ${merge_ids.length}\n\nHinweis: ${force ? "FORCE aktiv" : "ohne Force"}`)) return;
    const res = await fetch("/api/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ master_id: master, merge_ids, reason: "map_geo_duplicates", force }),
    });
    const js = await res.json().catch(() => ({}));
    if (!res.ok) return alert(js?.error ?? "Merge fehlgeschlagen");
    setGeoSelected((prev) => ({ ...prev, [group.key]: {} }));
    await loadGeoDup();
  };

  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of manufacturers) m.set(x.key, x.label);
    // fallbacks
    for (const k of Object.keys(FALLBACK_LABELS)) if (!m.has(k)) m.set(k, FALLBACK_LABELS[k]);
    return m;
  }, [manufacturers]);

  const manuIconByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of manufacturers as any[]) {
      if (x?.icon_data_url) m.set(x.key, x.icon_data_url);
    }
    // fallbacks
    for (const [k, v] of Object.entries(MANUFACTURER_ICON_FALLBACK)) {
      if (!m.has(k)) m.set(k, v);
    }
    // Flyer uses marker icon
    m.set("flyer", "/markers/flyer.png");
    return m;
  }, [manufacturers]);

  const buyingGroupIconByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of buyingGroups as any[]) {
      if (x?.key && x?.icon_data_url) m.set(x.key, x.icon_data_url);
    }
    for (const [k, v] of Object.entries(BUYING_GROUP_ICON_FALLBACK)) {
      if (!m.has(k)) m.set(k, v);
    }
    return m;
  }, [buyingGroups]);

  // Flyer markers can show a small buying-group badge (top-right) if present.
  const flyerIconByBg = useMemo(() => {
    if (!leafletReady) return new Map<string, any>();
    const L = leafletRef.current as any;
    const cache = new Map<string, any>();
    function mk(bgIcon: string | null) {
      const key = bgIcon || "";
      if (cache.has(key)) return cache.get(key);
      const badge = bgIcon
        ? `<img src="${bgIcon}" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:5px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25);padding:2px;object-fit:contain" />`
        : "";
      const icon = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:36px;height:36px;border-radius:999px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.9);">
              <img src="/markers/flyer.png" style="width:32px;height:32px;border-radius:999px;display:block;" />
              ${badge}
            </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -16],
      });
      cache.set(key, icon);
      return icon;
    }
    (mk as any)._cache = cache;
    return { get: mk } as any;
  }, [leafletReady, buyingGroupIconByKey]);

  // Buying-group marker: show the buying-group pictogram as the main marker (for non-Flyer dealers).
  const buyingGroupMarkerIcon = useMemo(() => {
    if (!leafletReady) return new Map<string, any>();
    const L = leafletRef.current as any;
    const cache = new Map<string, any>();
    function mk(bgIcon: string) {
      const key = bgIcon || "";
      if (cache.has(key)) return cache.get(key);
      const icon = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:34px;height:34px;border-radius:999px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.9);">
                <img src="${bgIcon}" style="width:28px;height:28px;border-radius:8px;display:block;object-fit:contain" />
              </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -14],
      });
      cache.set(key, icon);
      return icon;
    }
    (mk as any)._cache = cache;
    return { get: mk } as any;
  }, [leafletReady]);

  const repByEmail = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profiles) m.set(p.email, p);
    return m;
  }, [profiles]);

  const repsList = useMemo(() => {
    return profiles
      .filter((p) => p.role !== "admin")
      .slice()
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .map((p) => ({ email: p.email, name: p.display_name }));
  }, [profiles]);

  const territoriesByRep = useMemo(() => {
    const m = new Map<string, Territory[]>();
    for (const t of territories) {
      const arr = m.get(t.profile_email) ?? [];
      arr.push(t);
      m.set(t.profile_email, arr);
    }
    return m;
  }, [territories]);

  const dealerRepNames = useMemo(() => {
    // dealerId -> "Name1, Name2"
    const territoryByRep = new Map<string, Territory[]>();
    for (const t of territories) {
      const arr = territoryByRep.get(t.profile_email) ?? [];
      arr.push(t);
      territoryByRep.set(t.profile_email, arr);
    }

    const map = new Map<string, string>();
    for (const d of dealers) {
      const p2 = plz2(d.zip);
      if (p2 == null) continue;
      const hits: string[] = [];
      for (const [email, ts] of territoryByRep.entries()) {
        if (ts.some((t) => p2 >= t.plz2_from && p2 <= t.plz2_to)) {
          const prof = repByEmail.get(email);
          // Admins (z.B. David) sollen nicht als AD bei Händlern angezeigt werden.
          if (prof?.role === "admin") continue;
          hits.push(prof?.display_name ?? email);
        }
      }
      if (hits.length) map.set(d.id, hits.sort().join(", "));
    }
    return map;
  }, [dealers, territories, repByEmail]);

  const filteredDealers = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const manuActive = Object.entries(selectedManu).filter(([, v]) => v).map(([k]) => k);
    const repActive = Object.entries(selectedReps).filter(([, v]) => v).map(([k]) => k);
    const bgActive = Object.entries(selectedBuyingGroups).filter(([, v]) => v).map(([k]) => k);

    return dealers.filter((d) => {
      // search
      if (qq) {
        const hay = `${d.name ?? ""} ${d.street ?? ""} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }

      // manufacturer filter
      if (manuActive.length) {
        const keys = d.manufacturer_keys ?? [];
        if (!manuActive.some((k) => keys.includes(k))) return false;
      }

      // rep filter (via territories) — match by PLZ range, not by string compare
      if (repActive.length) {
        const p2 = plz2(d.zip);
        // If a rep has no territories assigned yet, we don't want to hide the whole map.
        // We only apply the filter for reps that actually have at least one territory.
        const repsWithTerritories = repActive.filter((email) => (territoriesByRep.get(email) ?? []).length > 0);
        if (repsWithTerritories.length) {
          if (p2 == null) return false;
          const ok = repsWithTerritories.some((email) => {
            const ts = territoriesByRep.get(email) ?? [];
            return ts.some((t) => p2 >= t.plz2_from && p2 <= t.plz2_to);
          });
          if (!ok) return false;
        }
      }

      // buying-group filter (optional)
      if (bgActive.length) {
        const k = (d as any).buying_group_key as string | null | undefined;
        if (!k || !bgActive.includes(k)) return false;
      }

      return true;
    });
  }, [dealers, q, selectedManu, selectedReps, selectedBuyingGroups, territoriesByRep]);

  const visibleWithGeo = useMemo(() => {
    return filteredDealers
      .filter((d) => inBounds(d, bounds))
      .filter((d) => d.lat != null && d.lng != null)
      .slice(0, 2000);
  }, [filteredDealers, bounds]);

  const initMap = () => {
    if (!leafletReady) return;
    const L = leafletRef.current as any;
    if (!L) return;
    if (mapRef.current || !containerRef.current) return;
    try {
      const map = L.map(containerRef.current, { zoomControl: true, preferCanvas: true }).setView([51.16, 10.45], 6);
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      map.on("moveend", () => {
        if (suppressMoveEndRef.current) return;
        const b = map.getBounds();
        setBounds({
          south: b.getSouth(),
          west: b.getWest(),
          north: b.getNorth(),
          east: b.getEast(),
        });
      });

      // initial bounds
      const b = map.getBounds();
      setBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    } catch (e: any) {
      setMapError(e?.message ?? "Karte konnte nicht initialisiert werden");
    }
  };

  // init once
  useEffect(() => {
    if (!leafletReady) return;
    initMap();
    return () => {
      try {
        mapRef.current?.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady]);

  // Flyer marker is built via flyerIconByBg (can show buying-group badge).

  const defaultIcon = useMemo(() => {
  if (!leafletReady) return null;
  const L = leafletRef.current as any;
  // Default: droplet pin marker
  return L.divIcon({
    className: "",
    html: `<img src="/markers/pin.svg" style="width:28px;height:40px;display:block;filter: drop-shadow(0 2px 8px rgba(0,0,0,.25));" />`,
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -36],
  });
}, [leafletReady]);

  // render markers when visible dealers change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Leaflet is loaded dynamically; always access it via the ref (never via a global `L`).
    const L = leafletRef.current as any;
    if (!L) return;

    const desired = new Set(visibleWithGeo.map((d) => d.id));

    // remove stale
    for (const [id, marker] of markersRef.current.entries()) {
      if (!desired.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // add / update
    for (const d of visibleWithGeo) {
      if (d.lat == null || d.lng == null) continue;
      const keys = d.manufacturer_keys ?? [];
      const bgKey = (d as any).buying_group_key as string | undefined;
      const bgIcon = bgKey ? (buyingGroupIconByKey.get(bgKey) || null) : null;
      const hasFlyer = keys.includes("flyer");
      const icon =
  (hasFlyer
    ? flyerIconByBg.get(bgIcon)
    : bgIcon
      ? buyingGroupMarkerIcon.get(bgIcon)
      : defaultIcon) ??
  L.divIcon({
    className: "",
    html: hasFlyer
      ? `<div style="width:36px;height:36px;border-radius:999px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.9);"><img src="/markers/flyer.png" style="width:32px;height:32px;border-radius:999px;display:block;" /></div>`
      : `<img src="/markers/pin.svg" style="width:28px;height:40px;display:block;filter: drop-shadow(0 2px 8px rgba(0,0,0,.25));" />`,
    iconSize: hasFlyer ? [36, 36] : bgIcon ? [34, 34] : [28, 40],
    iconAnchor: hasFlyer ? [18, 18] : bgIcon ? [17, 17] : [14, 40],
    popupAnchor: hasFlyer ? [0, -16] : bgIcon ? [0, -14] : [0, -36],
  });
      const icons = keys
        .slice(0, 6)
        .map((k) => {
          const src = k === "flyer" ? "/markers/flyer.png" : (MANUFACTURER_ICON_FALLBACK[k] || null);
          const title = labelByKey.get(k) ?? k;
          if (!src) return escapeHtml(title);
          return `<img src="${src}" title="${escapeHtml(title)}" style="width:14px;height:14px;vertical-align:-2px;border-radius:4px;margin-left:2px;object-fit:contain" />`;
        })
        .join(" ");
      const repNames = dealerRepNames.get(d.id) ?? "";
      const popup = `
        <div style="min-width:220px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <div style="font-weight:700;margin-bottom:2px">${escapeHtml(d.name ?? "")}</div>
            ${bgIcon ? `<img src="${bgIcon}" title="Einkaufsverband" style="width:18px;height:18px;border-radius:4px;object-fit:contain" />` : ""}
          </div>
          <div style="font-size:12px;color:#475569">${escapeHtml(`${d.street ?? ""}`.trim())}</div>
          <div style="font-size:12px;color:#475569">${escapeHtml(`${d.zip ?? ""} ${d.city ?? ""}`.trim())}</div>
          <div style="margin-top:6px;font-size:12px">${icons ? `<b>Marken:</b> ${icons}` : ""}</div>
          ${repNames ? `<div style="margin-top:4px;font-size:12px"><b>AD:</b> ${escapeHtml(repNames)}</div>` : ""}
          <div style="margin-top:8px"><a href="/dealer/${encodeURIComponent(d.id)}" style="color:#2563eb;text-decoration:underline">Details öffnen</a></div>
        </div>
      `;

      const existing = markersRef.current.get(d.id);
      if (existing) {
        existing.setLatLng([d.lat, d.lng]);
        existing.setIcon(icon);
        existing.bindPopup(popup);
      } else {
        const m = L.marker([d.lat, d.lng], { icon }).addTo(map);
        m.bindPopup(popup);
        markersRef.current.set(d.id, m);
      }
    }
  }, [leafletReady, visibleWithGeo, labelByKey, dealerRepNames, flyerIconByBg, buyingGroupMarkerIcon, defaultIcon, buyingGroupIconByKey]);

  const runGeocode = async () => {
    try {
      setGeocodeBusy(true);
      await fetch("/api/geocode/run", { method: "POST" });
      // reload dealers
      const dRes = await fetch("/api/dealers/list", { cache: "no-store" });
      const dJs = await dRes.json();
      setDealers(dJs.items ?? []);
    } finally {
      setGeocodeBusy(false);
    }
  };

  const centerGermany = () => {
    const map = mapRef.current;
    if (!map) return;
    suppressMoveEndRef.current = true;
    map.setView([51.16, 10.45], 6);
    setTimeout(() => {
      suppressMoveEndRef.current = false;
      const b = map.getBounds();
      setBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    }, 0);
  };

  const openDealerOnMap = (id: string) => {
    const map = mapRef.current;
    const marker = markersRef.current.get(id);
    if (!map || !marker) return;
    suppressMoveEndRef.current = true;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 12));
    marker.openPopup();
    setTimeout(() => {
      suppressMoveEndRef.current = false;
      const b = map.getBounds();
      setBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    }, 0);
  };

  // initialise selectedManu lazily from manufacturers
  useEffect(() => {
    if (!manufacturersForUi.length) return;
    setSelectedManu((prev) => {
      if (Object.keys(prev).length) return prev;
      const next: Record<string, boolean> = {};
      for (const m of manufacturersForUi) next[m.key] = true;
      return next;
    });
  }, [manufacturersForUi]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Karte</h1>
          <p className="text-sm text-slate-600">Marker anklicken für Kurzinfos – Details öffnen für Datenpflege, Kontakte & Besuche.</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <Input placeholder="Suche (Name/Ort/PLZ)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={runGeocode} disabled={geocodeBusy}>
              {geocodeBusy ? "Geocoding..." : "Geocoding starten"}
            </Button>
            <Button variant="secondary" onClick={centerGermany}>
              Deutschland
            </Button>
          </div>

          <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <summary className="cursor-pointer select-none text-sm font-semibold">Filter</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Hersteller</div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs text-slate-600 underline"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        for (const m of manufacturersForUi) next[m.key] = true;
                        setSelectedManu(next);
                      }}
                      type="button"
                    >
                      alle
                    </button>
                    <button
                      className="text-xs text-slate-600 underline"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        for (const m of manufacturersForUi) next[m.key] = false;
                        setSelectedManu(next);
                      }}
                      type="button"
                    >
                      keine
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {manufacturersForUi.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedManu[m.key] ?? true}
                        onChange={(e) => setSelectedManu((p) => ({ ...p, [m.key]: e.target.checked }))}
                      />
                      <img
                        src={manuIconByKey.get(m.key) || "/markers/pin.svg"}
                        alt={m.label}
                        title={m.label}
                        className="h-5 w-5 rounded-md object-contain"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold">Außendienst</div>
                <div className="mt-2 flex flex-col gap-1">
                  {repsList.length ? (
                    repsList.map((r) => (
                      <label key={r.email} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedReps[r.email] ?? false}
                          onChange={(e) => setSelectedReps((p) => ({ ...p, [r.email]: e.target.checked }))}
                        />
                        <span>{r.name}</span>
                      </label>
                    ))
                  ) : (
                    <div className="text-sm text-slate-600">Noch keine AD-Profile/Gebiete importiert.</div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Einkaufsverbände</div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs text-slate-600 underline"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        for (const g of buyingGroups as any[]) {
                          if (g?.key) next[g.key] = true;
                        }
                        setSelectedBuyingGroups(next);
                      }}
                      type="button"
                    >
                      alle
                    </button>
                    <button
                      className="text-xs text-slate-600 underline"
                      onClick={() => setSelectedBuyingGroups({})}
                      type="button"
                    >
                      aus
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-col gap-2">
                  {(buyingGroups?.length ? buyingGroups : []).map((g: any) => (
                    <div key={g.key} className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!selectedBuyingGroups[g.key]}
                          onChange={(e) =>
                            setSelectedBuyingGroups((p) => {
                              const next = { ...p, [g.key]: e.target.checked };
                              if (!e.target.checked) {
                                // keep key but false; later filter ignores false values
                              }
                              return next;
                            })
                          }
                        />
                        <img
                          src={buyingGroupIconByKey.get(g.key) || "/markers/pin.svg"}
                          alt={g.label || g.key}
                          title={g.label || g.key}
                          className="h-5 w-5 rounded-md object-contain"
                        />
                        <span>{g.label || g.key}</span>
                      </label>

                      <button
                        className="text-xs text-slate-600 underline"
                        type="button"
                        onClick={() => {
                          // "Folgen" = Filter setzen + auf passende Händler zoomen.
                          setSelectedBuyingGroups({ [g.key]: true });
                          const map = mapRef.current;
                          if (!map) return;
                          const pts = (dealers as any[])
                            .filter((d) => (d as any).buying_group_key === g.key)
                            .filter((d) => d.lat != null && d.lng != null)
                            .map((d) => [d.lat, d.lng] as [number, number]);
                          if (pts.length === 1) {
                            suppressMoveEndRef.current = true;
                            map.setView(pts[0], Math.max(map.getZoom(), 10));
                            setTimeout(() => (suppressMoveEndRef.current = false), 0);
                          } else if (pts.length > 1) {
                            suppressMoveEndRef.current = true;
                            map.fitBounds(pts as any, { padding: [20, 20] } as any);
                            setTimeout(() => (suppressMoveEndRef.current = false), 0);
                          }
                        }}
                      >
                        folgen
                      </button>
                    </div>
                  ))}
                  {!buyingGroups?.length ? <div className="text-sm text-slate-600">Keine Einkaufsverbände geladen.</div> : null}
                </div>
              </div>
            </div>
          </details>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Badge tone="slate">Händler gesamt: {dealers.length}</Badge>
          <Badge tone="slate">Nach Filter: {filteredDealers.length}</Badge>
          <Badge tone="slate">Im Ausschnitt: {visibleWithGeo.length}</Badge>
          {loading ? <Badge tone="amber">Lade…</Badge> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-12">
        <Card className="md:col-span-5">
          <CardHeader className="flex items-center justify-between gap-2 text-sm font-semibold">
            <span>Händler im Kartenausschnitt</span>
            <Button
              variant="secondary"
              className="h-8 px-3"
              disabled={exportBusy || visibleWithGeo.length === 0}
              onClick={async () => {
                try {
                  setExportBusy(true);
                  const ids = visibleWithGeo.slice(0, 2000).map((d) => d.id);
                  const res = await fetch("/api/dealers/export", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ids }),
                  });
                  if (!res.ok) {
                    const t = await res.text();
                    throw new Error(t || "Export fehlgeschlagen");
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "haendler_kartenausschnitt.xlsx";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (e: any) {
                  alert(e?.message ?? "Export fehlgeschlagen");
                } finally {
                  setExportBusy(false);
                }
              }}
            >
              Excel
            </Button>
          </CardHeader>
          <CardContent className="max-h-[72vh] overflow-auto">
            {mapError ? (
              <div className="text-sm text-rose-700">{mapError}</div>
            ) : visibleWithGeo.length === 0 ? (
              <div className="text-sm text-slate-600">Keine Händler im aktuellen Kartenausschnitt (oder noch ohne Geodaten).</div>
            ) : (
              <ul className="space-y-2">
                {visibleWithGeo.map((d) => {
                  const keys2 = d.manufacturer_keys ?? [];
                  const repNames = dealerRepNames.get(d.id) ?? "";
                  const buyingGroupKey = (d as any).buying_group_key as string | null | undefined;
                  return (
                    <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <button className="text-left" onClick={() => openDealerOnMap(d.id)} type="button">
                          <div className="text-sm font-semibold">{d.name}</div>
                          <div className="text-xs text-slate-600">{`${d.zip ?? ""} ${d.city ?? ""}`.trim()}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <DealerListPictos manufacturerKeys={keys2} buyingGroupKey={null} size={16} maxManufacturers={3} />
                            {repNames ? <Badge tone="amber">{repNames}</Badge> : null}
                          </div>
                        </button>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            {buyingGroupKey ? <Pictogram kind="buying_group" k={buyingGroupKey} size={16} /> : null}
                            <Link href={`/dealer/${d.id}`} className="text-xs text-blue-700 underline">Details</Link>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {visibleWithGeo.length >= 2000 ? <div className="mt-2 text-xs text-slate-500">Liste gekürzt auf 2000.</div> : null}
          </CardContent>
        </Card>

        <Card className="md:col-span-7 h-[72vh] overflow-hidden">
          <CardHeader className="text-sm font-semibold">Karte</CardHeader>
          <CardContent className="h-full p-0">
            {mapError ? (
              <div className="p-4 text-sm text-rose-700">{mapError}</div>
            ) : (
              <div ref={containerRef} className="h-full w-full" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold">Geo-Dubletten (schnelles Zusammenführen)</div>
              <p className="mt-1 text-xs text-slate-600">
                Vorschläge basierend auf sehr nahen Koordinaten. Hier kannst du mehrere Dubletten markieren und per Klick zusammenführen.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={loadGeoDup} disabled={dupLoading}>
                {dupLoading ? "Lade…" : "Aktualisieren"}
              </Button>
              <Badge tone="slate">{dupLoading ? "…" : `${geoDupGroups.length} Gruppen`}</Badge>
              <Link href="/cleanup" className="text-xs text-blue-700 underline">
                Vollständige Cleanup-Seite öffnen
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {geoDupGroups.length === 0 ? (
              <div className="text-sm text-slate-600">Keine Geo-Dubletten gefunden.</div>
            ) : (
              <div className="space-y-3">
                {geoDupGroups.slice(0, 60).map((g: any) => {
                  const masterId = geoMaster[g.key] ?? g.suggested_master_id ?? g.dealers?.[0]?.id;
                  const force = geoForce[g.key] ?? true;
                  return (
                    <div key={g.key} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-semibold">
                            PLZ {g.zip} · min. Abstand: {Math.round(g.min_distance_m)} m
                          </div>
                          <div className="text-xs text-slate-600">Gruppe: {g.key}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-xs text-slate-700">Master:</label>
                          <select
                            className="h-8 rounded-lg border border-slate-200 px-2 text-sm"
                            value={masterId}
                            onChange={(e) => setGeoMaster((p) => ({ ...p, [g.key]: e.target.value }))}
                          >
                            {(g.dealers ?? []).map((d: any) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                          <label className="inline-flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={force}
                              onChange={(e) => setGeoForce((p) => ({ ...p, [g.key]: e.target.checked }))}
                            />
                            Force
                          </label>
                          <Button className="h-8" onClick={() => runGeoDupMerge(g)}>
                            Zusammenführen
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 overflow-auto">
                        <table className="min-w-[900px] w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left">
                              <th className="py-2 pr-2">Auswahl</th>
                              <th className="py-2 pr-2">Händler</th>
                              <th className="py-2 pr-2">Adresse</th>
                              <th className="py-2 pr-2">Marken</th>
                              <th className="py-2 pr-2">Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(g.dealers ?? []).map((d: any) => (
                              <tr key={d.id} className="border-b border-slate-100 align-top">
                                <td className="py-2 pr-2">
                                  <input
                                    type="checkbox"
                                    checked={!!(geoSelected[g.key] ?? {})[d.id]}
                                    onChange={(e) => toggleGeoSel(g.key, d.id, e.target.checked)}
                                    disabled={d.id === masterId}
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <div className="font-semibold">{d.name}</div>
                                  <div className="text-xs text-slate-500">{d.id}</div>
                                </td>
                                <td className="py-2 pr-2">
                                  <div>{d.street}</div>
                                  <div className="text-xs text-slate-600">{`${d.zip ?? ""} ${d.city ?? ""}`.trim()}</div>
                                </td>
                                <td className="py-2 pr-2">
                                  <DealerListPictos
                                    manufacturerKeys={d.manufacturer_keys ?? []}
                                    buyingGroupKey={(d as any).buying_group_key ?? null}
                                    size={16}
                                    maxManufacturers={4}
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <Link href={`/dealer/${d.id}`} className="text-xs text-blue-700 underline">
                                    Öffnen
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
                {geoDupGroups.length > 60 ? (
                  <div className="text-xs text-slate-600">Hinweis: Anzeige auf 60 Gruppen begrenzt (nutze ggf. die Cleanup-Seite).</div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}