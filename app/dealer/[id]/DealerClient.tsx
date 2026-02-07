"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Input, Textarea, Badge } from "@/components/ui";
import { Pictogram } from "@/components/Pictogram";
import { DealerListPictos } from "@/components/DealerListPictos";
import { BUYING_GROUP_ICON_FALLBACK } from "@/lib/pictograms";
import type * as Leaflet from "leaflet";

type ManufacturerItem = { key: string; label: string };

type Contact = {
  id: string;
  role: "Geschaeftsfuehrer" | "Verkauf" | "Werkstatt" | "Buchhaltung" | "Sonstiges";
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

const CONTACT_ROLES: Array<{ value: Contact["role"]; label: string }> = [
  { value: "Geschaeftsfuehrer", label: "Geschäftsführer" },
  { value: "Verkauf", label: "Verkauf" },
  { value: "Werkstatt", label: "Werkstatt" },
  { value: "Buchhaltung", label: "Buchhaltung" },
  { value: "Sonstiges", label: "Sonstiges" },
];

export default function DealerClient({ id }: { id: string }) {
  const [dealer, setDealer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);

  // Mini map (Leaflet)
  const miniMapRef = useRef<HTMLDivElement | null>(null);
  const miniLeafletRef = useRef<any>(null);
  const miniMapInstanceRef = useRef<Leaflet.Map | null>(null);
  const miniMarkerRef = useRef<any>(null);
  const [miniLeafletReady, setMiniLeafletReady] = useState(false);
  const [miniMapError, setMiniMapError] = useState<string>("");

  const [allManufacturers, setAllManufacturers] = useState<ManufacturerItem[]>([]);

  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [newLabel, setNewLabel] = useState<string>("");
  const [newKey, setNewKey] = useState<string>("");

  const [visitNote, setVisitNote] = useState("");

  // Branch / merge helpers
  const [parentDealer, setParentDealer] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [parentQuery, setParentQuery] = useState("");
  const [parentSuggestions, setParentSuggestions] = useState<any[]>([]);

  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeSuggestions, setMergeSuggestions] = useState<any[]>([]);
  const [mergeSelected, setMergeSelected] = useState<Record<string, boolean>>({});
  const [mergeForce, setMergeForce] = useState(false);
  const [sameZipDealers, setSameZipDealers] = useState<any[]>([]);
  const [sameZipSelected, setSameZipSelected] = useState<Record<string, boolean>>({});
  const [sameZipForce, setSameZipForce] = useState(true);
  const [sameZipIgnoredIds, setSameZipIgnoredIds] = useState<string[]>([]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newContact, setNewContact] = useState<{
    role: Contact["role"];
    name: string;
    email: string;
    phone: string;
  }>({ role: "Geschaeftsfuehrer", name: "", email: "", phone: "" });

  async function loadDealer() {
    const res = await fetch(`/api/dealers/${id}`, { cache: "no-store" });
    const js = await res.json();
    setDealer(js);
    setContacts(js?.contacts ?? []);


    // other dealers in the same PLZ (only show when there is actually more than one)
    const z = String(js?.dealer?.zip ?? "").trim();
    if (z) {
      try {
        const zr = await fetch(`/api/dealers/by-zip?zip=${encodeURIComponent(z)}`, { cache: "no-store" });
        const zj = await zr.json();
        const itemsRaw = (zj?.items ?? []).filter((x: any) => x.id !== id);

        // hide dealers that were explicitly marked as "not duplicate" with this dealer
        let ignored: string[] = [];
        try {
          const ir = await fetch(`/api/duplicates/ignored-with?dealer_id=${encodeURIComponent(id)}`, { cache: "no-store" });
          const ij = await ir.json();
          ignored = Array.isArray(ij?.ignored_ids) ? ij.ignored_ids : [];
        } catch {
          ignored = [];
        }
        setSameZipIgnoredIds(ignored);
        const ignoredSet = new Set(ignored);
        const items = itemsRaw.filter((x: any) => !ignoredSet.has(x.id));
        setSameZipDealers(items);
        setSameZipSelected({});
      } catch {
        setSameZipDealers([]);
        setSameZipSelected({});
        setSameZipIgnoredIds([]);
      }
    } else {
      setSameZipDealers([]);
      setSameZipIgnoredIds([]);
    }

    const pd = js?.dealer?.parent_dealer_id;
    if (pd) {
      try {
        const r = await fetch(`/api/dealers/${pd}`, { cache: "no-store" });
        const pj = await r.json();
        setParentDealer(pj?.dealer ?? null);
      } catch {
        setParentDealer(null);
      }
    } else {
      setParentDealer(null);
    }

    // branches for this dealer as parent
    try {
      const br = await fetch(`/api/dealers/branches?parent_id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const bj = await br.json();
      setBranches(bj?.items ?? []);
    } catch {
      setBranches([]);
    }
  }

  async function loadManufacturers() {
    const res = await fetch("/api/manufacturers/list", { cache: "no-store" });
    const js = await res.json();
    setAllManufacturers(js.items ?? []);
  }

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([loadDealer(), loadManufacturers()]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        const j = await r.json();
        const role = String(j?.role || "").toLowerCase();
        setIsAdmin(role === "admin" || role === "superadmin" || !!j?.is_admin);
      } catch {
        setIsAdmin(false);
      }
    })();
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function removeBuyingGroup() {
    if (!dealer?.buying_group) return;
    if (!confirm(`Händler aus dem Einkaufsverband "${dealer.buying_group.label}" entfernen?`)) return;
    const res = await fetch("/api/buying-groups/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealer_id: id, buying_group_key: null }),
    });
    const js = await res.json();
    if (!res.ok) return alert(js?.error ?? "Entfernen fehlgeschlagen");
    await loadAll();
  }

  // Load Leaflet dynamically for the mini map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod: any = await import("leaflet");
        const L = mod?.default ?? mod;
        if (!cancelled) {
          miniLeafletRef.current = L;
          setMiniLeafletReady(true);
        }
      } catch {
        if (!cancelled) setMiniLeafletReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clean up mini map on unmount (prevents "white field" after navigation)
  useEffect(() => {
    return () => {
      try {
        const ro = (miniLeafletRef.current as any)?.__mini_ro as ResizeObserver | undefined;
        ro?.disconnect?.();
      } catch {
        // ignore
      }
      try {
        miniMapInstanceRef.current?.remove?.();
      } catch {
        // ignore
      }
      miniMapInstanceRef.current = null;
      miniMarkerRef.current = null;
    };
  }, []);

  // Init / update mini map when dealer data is present
  useEffect(() => {
    if (!miniLeafletReady) return;
    const L = miniLeafletRef.current as any;
    if (!L) return;
    const d = dealer?.dealer;
    const el = miniMapRef.current;
    if (!el) return;
    const lat = d?.lat;
    const lng = d?.lng;
    if (lat == null || lng == null) return;

    setMiniMapError("");

    // init map once
    if (!miniMapInstanceRef.current) {
      try {
        // Leaflet can throw "Map container is already initialized" after client-side navigations.
        // Reset the internal marker on the container before creating a new map.
        if ((el as any)._leaflet_id) {
          try {
            delete (el as any)._leaflet_id;
          } catch {
            (el as any)._leaflet_id = undefined;
          }
        }

        const map = L.map(el, {
          zoomControl: false,
          attributionControl: false,
        });
        miniMapInstanceRef.current = map;

        // Use OSM tiles (HTTPS). If tiles fail to load, the map would appear blank.
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(map);
      } catch (e: any) {
        setMiniMapError(e?.message ?? "Karte konnte nicht initialisiert werden");
        return;
      }

      // Keep map responsive (fixes "white field" when container size changes)
      try {
        const map = miniMapInstanceRef.current as any;
        const ro = new ResizeObserver(() => {
          try {
            map.invalidateSize();
          } catch {
            // ignore
          }
        });
        ro.observe(el);
        (miniLeafletRef.current as any).__mini_ro = ro;
      } catch {
        // ignore
      }
    }

    const map = miniMapInstanceRef.current!;
    map.setView([lat, lng], Math.max(map.getZoom(), 14));

    const manuKeys: string[] = (dealer?.manufacturers ?? []).map((m: any) => m.key);
    const hasFlyer = manuKeys.includes("flyer");
    const bgKey = dealer?.buying_group?.key as string | undefined;
    const bgIcon = bgKey ? (dealer?.buying_group?.icon_data_url || BUYING_GROUP_ICON_FALLBACK[bgKey] || null) : null;

    const icon = hasFlyer
      ? L.divIcon({
          className: "",
          html: `<div style="position:relative;width:36px;height:36px;border-radius:999px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.9);">
              <img src="/markers/flyer.png" style="width:32px;height:32px;border-radius:999px;display:block;" />
              ${bgIcon ? `<img src="${bgIcon}" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:5px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25);padding:2px;object-fit:contain" />` : ""}
            </div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })
      : bgIcon
        ? L.divIcon({
            className: "",
            html: `<div style="position:relative;width:34px;height:34px;border-radius:999px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.9);">
                <img src="${bgIcon}" style="width:28px;height:28px;border-radius:8px;display:block;object-fit:contain" />
              </div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          })
        : L.divIcon({
            className: "",
            html: `<img src="/markers/pin.svg" style="width:28px;height:40px;display:block;filter: drop-shadow(0 2px 8px rgba(0,0,0,.25));" />`,
            iconSize: [28, 40],
            iconAnchor: [14, 40],
          });

    if (miniMarkerRef.current) {
      miniMarkerRef.current.setLatLng([lat, lng]);
      miniMarkerRef.current.setIcon(icon);
    } else {
      miniMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
    }

    // fix rendering if card was hidden / resized
    const kick = () => {
      try {
        map.invalidateSize();
      } catch {
        // ignore
      }
    };
    setTimeout(kick, 0);
    setTimeout(kick, 120);
    setTimeout(kick, 600);
  }, [miniLeafletReady, dealer]);

  // Cleanup mini map on unmount
  useEffect(() => {
    return () => {
      try {
        const map = miniMapInstanceRef.current as any;
        if (map) map.remove();
      } catch {
        // ignore
      }
      miniMapInstanceRef.current = null;
      miniMarkerRef.current = null;
      try {
        const ro = (miniLeafletRef.current as any)?.__mini_ro;
        if (ro) ro.disconnect();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    const q = parentQuery.trim();
    if (q.length < 2) {
      setParentSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/dealers/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const js = await res.json();
      setParentSuggestions((js.items ?? []).filter((x: any) => x.id !== id));
    }, 250);
    return () => clearTimeout(t);
  }, [parentQuery, id]);

  useEffect(() => {
    const q = mergeQuery.trim();
    if (q.length < 2) {
      setMergeSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/dealers/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const js = await res.json();
      setMergeSuggestions((js.items ?? []).filter((x: any) => x.id !== id));
    }, 250);
    return () => clearTimeout(t);
  }, [mergeQuery, id]);

  const manufacturerLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of allManufacturers) m.set(it.key, it.label);
    return m;
  }, [allManufacturers]);

  const existingKeys = useMemo(() => {
    return new Set((dealer?.manufacturers ?? []).map((m: any) => m.key));
  }, [dealer]);

  const availableExisting = useMemo(() => {
    return allManufacturers.filter((m) => !existingKeys.has(m.key));
  }, [allManufacturers, existingKeys]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/dealers/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dealer }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Speichern fehlgeschlagen");
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function addVisit() {
    if (!visitNote.trim()) return;
    const res = await fetch(`/api/dealers/${id}/visits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: visitNote.trim() }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Besuch konnte nicht gespeichert werden");
    setVisitNote("");
    await loadDealer();
  }

  async function removeManufacturer(key: string) {
    if (!confirm(`Hersteller "${key}" wirklich entfernen?`)) return;
    const res = await fetch(`/api/dealers/${id}/manufacturers/${encodeURIComponent(key)}`, { method: "DELETE" });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Löschen fehlgeschlagen");
    await loadDealer();
  }

  async function addManufacturer() {
    if (addMode === "existing") {
      const key = selectedKey.trim();
      if (!key) return;
      const res = await fetch(`/api/dealers/${id}/manufacturers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Hinzufügen fehlgeschlagen");
      setSelectedKey("");
      await loadDealer();
      return;
    }

    // new
    if (!newLabel.trim()) return alert("Bitte Hersteller-Name eingeben");
    const res = await fetch(`/api/dealers/${id}/manufacturers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: newKey.trim() || "__new__", label: newLabel.trim() }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Anlegen fehlgeschlagen");
    setNewLabel("");
    setNewKey("");
    await loadAll();
  }

  async function deleteDealer() {
    if (!confirm("Händler wirklich löschen? (inkl. Besuche & Zuordnungen)")) return;
    const res = await fetch(`/api/dealers/${id}`, { method: "DELETE" });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Löschen fehlgeschlagen");
    window.location.href = "/map";
  }

  async function setAsBranch(parentId: string | null) {
    // attach this dealer as a branch of parentId (or remove branch)
    setSaving(true);
    try {
      const res = await fetch(`/api/dealers/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dealer: {
            ...dealer.dealer,
            parent_dealer_id: parentId,
          },
        }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Speichern fehlgeschlagen");
      setParentQuery("");
      setParentSuggestions([]);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function runMerge() {
    const ids = Object.entries(mergeSelected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) return alert("Bitte mindestens einen Händler auswählen");
    if (!confirm(`Diese ${ids.length} Händler in "${dealer.dealer.name}" zusammenführen?\n\nHinweis: Wenn Regeln (Straße/Land/PLZ) blockieren, aktiviere unten "Force Merge" oder "Straße ignorieren".`)) return;
    const reason = "manual_dealer_page";
    const res = await fetch(`/api/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ master_id: id, merge_ids: ids, reason, force: mergeForce }),
    });
    const js = await res.json();
    if (!res.ok) return alert(js?.error ?? "Merge fehlgeschlagen");
    setMergeSelected({});
    setMergeQuery("");
    setMergeSuggestions([]);
    await loadAll();
  }

  async function runSameZipMerge() {
    const ids = Object.entries(sameZipSelected).filter(([,v])=>v).map(([k])=>k);
    if (ids.length === 0) return alert("Bitte mindestens einen Händler auswählen");
    if (!confirm(`Diese ${ids.length} Händler in "${dealer.dealer.name}" zusammenführen?

PLZ: ${dealer.dealer.zip ?? ""}

Hinweis: ${sameZipForce ? "FORCE aktiv (ignoriert Adresse/Land/PLZ-Checks)." : "Ohne Force ist Merge nur erlaubt, wenn Adresse identisch ist."}`)) return;
    const reason = "dealer_page_same_zip";
    const res = await fetch(`/api/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ master_id: id, merge_ids: ids, reason, force: sameZipForce }),
    });
    const js = await res.json();
    if (!res.ok) return alert(js?.error ?? "Merge fehlgeschlagen");
    setSameZipSelected({});
    await loadAll();
  }

  async function runSameZipIgnore() {
    const ids = Object.entries(sameZipSelected).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) return alert("Bitte mindestens einen Händler auswählen");
    const name = dealer?.dealer?.name ?? id;
    const zip = dealer?.dealer?.zip ?? "";
    if (!confirm(`Als NICHT-Duplikat speichern?\n\nHändler: ${name}\nPLZ: ${zip}\nNicht-Duplikate: ${ids.length}\n\nDiese Paare werden künftig nicht mehr als Dubletten vorgeschlagen.`)) return;
    const res = await fetch("/api/duplicates/ignore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealer_id: id, ignore_ids: ids, reason: "dealer_page_same_zip_not_duplicate" }),
    });
    const js = await res.json();
    if (!res.ok) return alert(js?.error ?? "Konnte Ignore nicht speichern");
    setSameZipSelected({});
    await loadAll();
  }

  function updateContactLocal(contactId: string, patch: Partial<Contact>) {
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, ...patch } : c)));
  }

  async function addContact() {
    if (!newContact.name.trim()) return alert("Bitte Name eingeben");
    const res = await fetch(`/api/dealers/${id}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: newContact.role,
        name: newContact.name.trim(),
        email: newContact.email.trim(),
        phone: newContact.phone.trim(),
      }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Kontakt konnte nicht gespeichert werden");
    setNewContact({ role: "Geschaeftsfuehrer", name: "", email: "", phone: "" });
    await loadDealer();
  }

  async function saveContact(contact: Contact) {
    const res = await fetch(`/api/dealers/${id}/contacts/${encodeURIComponent(contact.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: contact.role,
        name: contact.name,
        email: contact.email ?? "",
        phone: contact.phone ?? "",
      }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Kontakt konnte nicht aktualisiert werden");
    await loadDealer();
  }

  async function deleteContact(contactId: string) {
    if (!confirm("Kontakt wirklich löschen?")) return;
    const res = await fetch(`/api/dealers/${id}/contacts/${encodeURIComponent(contactId)}`, { method: "DELETE" });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Kontakt konnte nicht gelöscht werden");
    await loadDealer();
  }

  if (loading) return <div className="p-6 text-sm text-slate-600">Lade...</div>;
  if (!dealer?.dealer) return <div className="p-6 text-sm text-rose-600">Nicht gefunden</div>;

  const d = dealer.dealer;
  const hasFlyer = (dealer?.manufacturers ?? []).some((m: any) => m.key === "flyer");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-start gap-3">
            <h1 className="text-xl font-semibold">{d.name}</h1>
          </div>
          <p className="text-sm text-slate-600">{[d.street, `${d.zip ?? ""} ${d.city ?? ""}`].filter(Boolean).join(", ")}</p>
        </div>
        <div className="flex items-center gap-2">
          {dealer.buying_group ? (
            <Pictogram
              kind="buying_group"
              k={dealer.buying_group.key}
              label={dealer.buying_group.label}
              dataUrl={dealer.buying_group.icon_data_url}
              size={20}
              className="mr-1"
            />
          ) : null}
          {dealer.buying_group && isAdmin ? (
            <Button variant="secondary" onClick={removeBuyingGroup}>
              Aus Verband entfernen
            </Button>
          ) : null}
          <Link href="/map"><Button variant="secondary">Zur Karte</Button></Link>
          <Link href="/cleanup"><Button variant="secondary">Cleanup</Button></Link>
          <Link href="/admin/buying-groups"><Button variant="secondary">Einkaufsverbände</Button></Link>
          <Button variant="danger" onClick={deleteDealer}>Händler löschen</Button>
        </div>
      </div>

      {/* Kacheln nie nebeneinander (auch auf Desktop) */}
      <div className="mt-4 grid gap-4">
        <Card>
          <CardHeader className="text-sm font-semibold">Karte (Ausschnitt)</CardHeader>
          <CardContent>
            {d.lat == null || d.lng == null ? (
              <div className="text-sm text-slate-600">Keine Koordinaten vorhanden.</div>
            ) : (
              <div className="h-[220px] w-full overflow-hidden rounded-xl border border-slate-200">
                <div className="relative h-full w-full">
                  <div ref={miniMapRef} className="h-full w-full" />
                  {miniMapError ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs text-rose-700 p-3 text-center">
                      {miniMapError}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Unternehmen / Filialen</CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Status</div>
              {d.parent_dealer_id ? (
                <div>
                  <div className="font-medium">Filiale</div>
                  <div className="text-xs text-slate-600">
                    Hauptfirma: {parentDealer?.name ?? d.parent_dealer_id}
                    {parentDealer?.id ? (
                      <> · <Link className="underline" href={`/dealer/${parentDealer.id}`}>öffnen</Link></>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-medium">Hauptfirma</div>
                  <div className="text-xs text-slate-600">Filialen: {branches.length}</div>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-500">Filialname (optional)</label>
              <Input
                value={d.branch_label ?? ""}
                onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, branch_label:e.target.value}}))}
                placeholder="z. B. Innenstadt, Werkstatt, Speyer"
              />
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" disabled={saving} onClick={save}>Speichern</Button>
                {d.parent_dealer_id ? (
                  <Button variant="secondary" disabled={saving} onClick={()=>setAsBranch(null)}>Als Hauptfirma setzen</Button>
                ) : null}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500">Als Filiale zuordnen (Hauptfirma suchen)</label>
              <Input value={parentQuery} onChange={(e)=>setParentQuery(e.target.value)} placeholder="Name suchen…" />
              {parentSuggestions.length > 0 ? (
                <div className="mt-2 max-h-48 overflow-auto rounded-xl border bg-white">
                  {parentSuggestions.slice(0, 15).map((p: any) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      onClick={() => setAsBranch(p.id)}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{[p.street, `${p.zip ?? ""} ${p.city ?? ""}`].filter(Boolean).join(", ")}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {branches.length > 0 ? (
              <div>
                <div className="text-xs text-slate-500">Filialen</div>
                <div className="mt-1 space-y-1">
                  {branches.slice(0, 10).map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
                      <div>
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs text-slate-500">{[b.branch_label, b.street, `${b.zip ?? ""} ${b.city ?? ""}`].filter(Boolean).join(" · ")}</div>
                      </div>
                      <Link className="underline text-sm" href={`/dealer/${b.id}`}>öffnen</Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Stammdaten (editierbar)</CardHeader>
          <CardContent className="space-y-3">
            <label className="text-xs text-slate-500">Name</label>
            <Input value={d.name ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, name:e.target.value}}))} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Straße</label>
                <Input value={d.street ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, street:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">PLZ</label>
                <Input value={d.zip ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, zip:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Ort</label>
                <Input value={d.city ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, city:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Land</label>
                <Input value={d.country ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, country:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Telefon</label>
                <Input value={d.phone ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, phone:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">E-Mail</label>
                <Input value={d.email ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, email:e.target.value}}))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Website</label>
                <Input value={d.website ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, website:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Öffnungszeiten</label>
                <Input value={d.opening_hours ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, opening_hours:e.target.value}}))} />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500">Notizen</label>
              <Textarea value={d.notes ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, notes:e.target.value}}))} rows={4} />
            </div>

            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>{saving ? "Speichere..." : "Speichern"}</Button>
              <Button variant="secondary" onClick={loadAll}>Neu laden</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Hersteller</CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(dealer.manufacturers ?? []).length === 0 ? (
                <span className="text-sm text-slate-500">Keine Hersteller zugeordnet.</span>
              ) : (
                (dealer.manufacturers ?? []).map((m: any) => (
                  <span key={m.key} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm">
                    <Pictogram kind="manufacturer" k={m.key} label={manufacturerLabel.get(m.key) ?? m.key} size={18} />
                    <button className="text-xs text-slate-500 hover:text-rose-700" onClick={() => removeManufacturer(m.key)}>entfernen</button>
                  </span>
                ))
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-500">Hinzufügen</label>
                <div className="ml-auto flex gap-2 text-xs">
                  <button className={addMode === "existing" ? "font-semibold" : "text-slate-500"} onClick={() => setAddMode("existing")}>Dropdown</button>
                  <button className={addMode === "new" ? "font-semibold" : "text-slate-500"} onClick={() => setAddMode("new")}>Neu</button>
                </div>
              </div>

              {addMode === "existing" ? (
                <div className="mt-2 flex gap-2">
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={selectedKey}
                    onChange={(e) => setSelectedKey(e.target.value)}
                  >
                    <option value="">Hersteller wählen…</option>
                    {availableExisting.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                  <Button onClick={addManufacturer}>Hinzufügen</Button>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <Input placeholder="Hersteller-Name (z.B. Cannondale)" value={newLabel} onChange={(e)=>setNewLabel(e.target.value)} />
                  <Input placeholder="Key optional (z.B. cannondale)" value={newKey} onChange={(e)=>setNewKey(e.target.value)} />
                  <Button onClick={addManufacturer}>Anlegen & zuordnen</Button>
                  <div className="text-xs text-slate-500">Neue Hersteller stehen danach automatisch überall im Dropdown zur Verfügung.</div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">FLYER Rückstände & Rechnungen</div>
                <Badge tone={hasFlyer ? "blue" : "slate"} title={hasFlyer ? "FLYER" : "Platzhalter"}>
                  {hasFlyer ? <img src="/markers/flyer.png" alt="FLYER" className="h-4 w-4" /> : "Platzhalter"}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Platzhalter – später wird dieser Bereich nur angezeigt, wenn wirklich FLYER-Rechnungen/Offene Aufträge vorhanden sind.
              </div>
              <div className="mt-3 grid gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-700">Offene Aufträge (Beispiel)</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                    <li>Auftrag #TEST-001 · 2× Uproc X · fällig 15.03.2026</li>
                    <li>Auftrag #TEST-002 · 1× Goroc · fällig 02.04.2026</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-700">Rechnungen (Beispiel)</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                    <li>Rechnung #TEST-INV-11 · 12.01.2026 · 4.980 €</li>
                    <li>Rechnung #TEST-INV-12 · 29.01.2026 · 1.245 €</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Filialen & Dubletten</CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-semibold">Filiale / Hauptfirma</div>
              <div className="mt-2 text-xs text-slate-500">
                Gleicher Name aber andere Adresse? Dann ist das meistens eine Filiale. Hier kannst du den Händler als Filiale einer Hauptfirma zuordnen.
              </div>

              <div className="mt-3">
                <div className="text-xs text-slate-500">Aktuell</div>
                {d.parent_dealer_id ? (
                  <div className="mt-1 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
                    <div className="text-sm">
                      <div className="font-semibold">{parentDealer?.name ?? "Hauptfirma"}</div>
                      <div className="text-xs text-slate-500">{parentDealer ? [parentDealer.street, `${parentDealer.zip ?? ""} ${parentDealer.city ?? ""}`].filter(Boolean).join(", ") : d.parent_dealer_id}</div>
                    </div>
                    <div className="flex gap-2">
                      {parentDealer?.id && <Link href={`/dealer/${parentDealer.id}`}><Button variant="secondary">Öffnen</Button></Link>}
                      <Button variant="secondary" onClick={() => setAsBranch(null)}>Entfernen</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-slate-600">Dieser Händler ist aktuell keine Filiale.</div>
                )}
              </div>

              <div className="mt-3">
                <div className="text-xs text-slate-500">Als Filiale zuordnen…</div>
                <Input className="mt-1" placeholder="Hauptfirma suchen (mind. 2 Buchstaben)…" value={parentQuery} onChange={(e)=>setParentQuery(e.target.value)} />
                {parentSuggestions.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white">
                    {parentSuggestions.slice(0, 12).map((x:any) => (
                      <button
                        key={x.id}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => setAsBranch(x.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold">{x.name}</div>
                          <div className="shrink-0">
                            <DealerListPictos
                              manufacturerKeys={x.manufacturer_keys ?? []}
                              buyingGroupKey={x.buying_group_key ?? null}
                              size={14}
                              maxManufacturers={3}
                            />
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{[x.street, `${x.zip ?? ""} ${x.city ?? ""}`].filter(Boolean).join(", ")}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <div className="text-xs text-slate-500">Filialen dieser Hauptfirma</div>
                {branches.length === 0 ? (
                  <div className="mt-1 text-sm text-slate-600">Keine Filialen zugeordnet.</div>
                ) : (
                  <div className="mt-2 grid gap-2">
                    {branches.map((b:any) => (
                      <Link key={b.id} href={`/dealer/${b.id}`} className="rounded-xl border border-slate-200 bg-white p-2 hover:bg-slate-50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold">{b.branch_label ? `${b.name} · ${b.branch_label}` : b.name}</div>
                          <div className="shrink-0">
                            <DealerListPictos
                              manufacturerKeys={b.manufacturer_keys ?? []}
                              buyingGroupKey={b.buying_group_key ?? null}
                              size={14}
                              maxManufacturers={3}
                            />
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{[b.street, `${b.zip ?? ""} ${b.city ?? ""}`].filter(Boolean).join(", ")}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {sameZipDealers.length > 0 ? (
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold">Weitere Händler in derselben PLZ</div>
                <div className="mt-1 text-xs text-slate-500">
                  In PLZ {d.zip} gibt es noch {sameZipDealers.length} weiteren Händler. Wenn das derselbe Betrieb ist (Dubletten), kannst du hier direkt forcen.
                </div>

                <div className="mt-3 space-y-2">
                  {sameZipDealers.slice(0, 25).map((x:any) => (
                    <label key={x.id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!!sameZipSelected[x.id]}
                        onChange={(e)=>setSameZipSelected((s)=>({ ...s, [x.id]: e.target.checked }))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold truncate">{x.name}</div>
                          <div className="shrink-0">
                            <DealerListPictos manufacturerKeys={x.manufacturer_keys ?? []} buyingGroupKey={x.buying_group_key ?? null} size={14} maxManufacturers={3} />
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{[x.street, `${x.zip ?? ""} ${x.city ?? ""}`].filter(Boolean).join(", ")}</div>
                        <Link className="text-xs text-blue-600 hover:underline" href={`/dealer/${x.id}`} target="_blank">öffnen</Link>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={sameZipForce} onChange={(e)=>setSameZipForce(e.target.checked)} />
                    <span><b>Force Merge</b> (ignoriert Land/PLZ/Ort &amp; Straße – du entscheidest)</span>
                  </label>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="secondary" onClick={runSameZipMerge}>Auswahl in diesen Händler mergen</Button>
                  <Button variant="secondary" onClick={runSameZipIgnore}>Nicht Duplikat</Button>
                  <Button variant="secondary" onClick={()=>setSameZipSelected({})}>Auswahl löschen</Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-semibold">Dubletten zusammenführen (nur wenn Adresse identisch ist)</div>
              <div className="mt-2 text-xs text-slate-500">
                Wenn derselbe Händler mehrfach importiert wurde (z.B. „Fahrrad Weindel“), kannst du hier die Dubletten in diesen Händler mergen. Merge wird serverseitig nur erlaubt, wenn Straße/PLZ/Ort/Land exakt übereinstimmen.
              </div>
              <Input className="mt-3" placeholder="Händler suchen…" value={mergeQuery} onChange={(e)=>setMergeQuery(e.target.value)} />

              {mergeSuggestions.length > 0 && (
                <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white">
                  {mergeSuggestions.slice(0, 20).map((x:any) => (
                    <label key={x.id} className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!!mergeSelected[x.id]}
                        onChange={(e)=>setMergeSelected((s)=>({ ...s, [x.id]: e.target.checked }))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold truncate">{x.name}</div>
                          <div className="shrink-0">
                            <DealerListPictos
                              manufacturerKeys={x.manufacturer_keys ?? []}
                              buyingGroupKey={x.buying_group_key ?? null}
                              size={14}
                              maxManufacturers={3}
                            />
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{[x.street, `${x.zip ?? ""} ${x.city ?? ""}`].filter(Boolean).join(", ")}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={mergeForce} onChange={(e)=>setMergeForce(e.target.checked)} />
                <span><b>Force Merge</b> (ignoriert Land/PLZ/Ort &amp; Straße – du entscheidest)</span>
              </div>
<div className="mt-3 flex items-center gap-2">
                <Button onClick={runMerge}>In diesen Händler mergen</Button>
                <Button variant="secondary" onClick={()=>setMergeSelected({})}>Auswahl löschen</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Kontaktpersonen</CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="grid gap-2">
                <div>
                  <label className="text-xs text-slate-500">Rolle</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={newContact.role}
                    onChange={(e) => setNewContact((s) => ({ ...s, role: e.target.value as any }))}
                  >
                    {CONTACT_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Name</label>
                  <Input className="mt-1" value={newContact.name} onChange={(e) => setNewContact((s) => ({ ...s, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">E-Mail (optional)</label>
                  <Input className="mt-1" value={newContact.email} onChange={(e) => setNewContact((s) => ({ ...s, email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Telefon (optional)</label>
                  <Input className="mt-1" value={newContact.phone} onChange={(e) => setNewContact((s) => ({ ...s, phone: e.target.value }))} />
                </div>
              </div>
              <div className="mt-3">
                <Button onClick={addContact}>Kontakt hinzufügen</Button>
              </div>
            </div>

            <div className="max-h-[44vh] overflow-auto rounded-xl border border-slate-200 bg-white">
              {contacts.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">Noch keine Kontaktpersonen hinterlegt.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {contacts.map((c) => (
                    <li key={c.id} className="p-3">
                      <div className="grid gap-2 md:grid-cols-[160px_1fr_1fr_140px]">
                        <div>
                          <label className="text-xs text-slate-500">Rolle</label>
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            value={c.role}
                            onChange={(e) => updateContactLocal(c.id, { role: e.target.value as any })}
                          >
                            {CONTACT_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Name</label>
                          <Input className="mt-1" value={c.name} onChange={(e) => updateContactLocal(c.id, { name: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-slate-500">E-Mail</label>
                            <Input className="mt-1" value={c.email ?? ""} onChange={(e) => updateContactLocal(c.id, { email: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Telefon</label>
                            <Input className="mt-1" value={c.phone ?? ""} onChange={(e) => updateContactLocal(c.id, { phone: e.target.value })} />
                          </div>
                        </div>
                        <div className="flex items-end gap-2">
                          <Button variant="secondary" onClick={() => saveContact(c)}>Speichern</Button>
                          <Button variant="danger" onClick={() => deleteContact(c.id)}>Löschen</Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Besuche</CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Textarea value={visitNote} onChange={(e)=>setVisitNote(e.target.value)} placeholder="Besuchsnotiz…" rows={3} />
              <Button onClick={addVisit}>Hinzufügen</Button>
            </div>

            <div className="max-h-[44vh] overflow-auto rounded-xl border border-slate-200 bg-white">
              {(dealer.visits ?? []).length === 0 ? (
                <div className="p-3 text-sm text-slate-500">Noch keine Besuche.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(dealer.visits ?? []).slice(0, 2000).map((v: any) => (
                    <li key={v.id} className="p-3">
                      <div className="text-xs text-slate-500">{new Date(v.created_at).toLocaleString("de-DE")}</div>
                      <div className="mt-1 text-sm">{v.note}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader className="text-sm font-semibold">Händler zusammenführen (nur bei identischer Adresse)</CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              Merge ist nur erlaubt, wenn Straße/PLZ/Ort/Land exakt gleich sind. Gleicher Name mit anderer Adresse ist i. d. R. eine Filiale.
            </div>
            <Input value={mergeQuery} onChange={(e)=>setMergeQuery(e.target.value)} placeholder="Händler suchen…" />
            {mergeSuggestions.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded-xl border bg-white">
                {mergeSuggestions.slice(0, 25).map((p: any) => (
                  <label key={p.id} className="flex items-start gap-2 px-3 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!mergeSelected[p.id]}
                      onChange={(e)=>setMergeSelected((s)=>({ ...s, [p.id]: e.target.checked }))}
                    />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{[p.street, `${p.zip ?? ""} ${p.city ?? ""}`].filter(Boolean).join(", ")}</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button onClick={runMerge}>In diesen Händler mergen</Button>
              <Button variant="secondary" onClick={() => { setMergeSelected({}); setMergeQuery(""); setMergeSuggestions([]); }}>Zurücksetzen</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
