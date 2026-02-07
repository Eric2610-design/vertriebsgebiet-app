"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";
import { Pictogram } from "@/components/Pictogram";
import { DealerListPictos } from "@/components/DealerListPictos";

type Group = {
  key: string;
  label: string;
  icon_data_url?: string | null;
  icon_missing?: boolean;
  dealers: Array<{ id: string; name: string; city: string | null; zip: string | null }>;
};

type DealerHit = { id: string; name: string; city: string | null; zip: string | null };

export default function BuyingGroupsPage() {
  const [items, setItems] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [isAdmin, setIsAdmin] = useState(false);

  const [createKey, setCreateKey] = useState("");
  const [createLabel, setCreateLabel] = useState("");

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DealerHit[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>("");

  // suggestions selection for bulk-assign
  const [suggestSelected, setSuggestSelected] = useState<Record<string, boolean>>({});

  // per-group merge selection (within member list)
  const [mergeSelByGroup, setMergeSelByGroup] = useState<Record<string, Record<string, boolean>>>({});
  const [mergeMasterByGroup, setMergeMasterByGroup] = useState<Record<string, string>>({});

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/buying-groups/list", { cache: "no-store" });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || "Fehler beim Laden");
      setItems(js.items || []);
    } catch (e: any) {
      setErr(e?.message || "Fehler beim Laden");
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
    load();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const qq = q.trim();
      if (qq.length < 2) {
        setHits([]);
        return;
      }
      const res = await fetch(`/api/dealers/search?q=${encodeURIComponent(qq)}`, { cache: "no-store" });
      const js = await res.json();
      setHits(js.items || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Map groups by key (used for filtering search results and member lookups)
  const byKey = useMemo(() => {
    return new Map(items.map((g) => [g.key, g] as const));
  }, [items]);

  // Only show assignable dealers (not already in the selected group)
  const assignableHits = useMemo(() => {
    const all = hits || [];
    if (!activeGroup) return all;
    const g = byKey.get(activeGroup);
    const members = new Set((g?.dealers || []).map((d) => d.id));
    return all.filter((h) => !members.has(h.id));
  }, [hits, activeGroup, byKey]);

  // when group (filter) is clicked, propose current results as suggestions (pre-selected)
  useEffect(() => {
    if (!activeGroup) {
      setSuggestSelected({});
      return;
    }
    // preselect up to 200 suggestions (keeps UI fast)
    const next: Record<string, boolean> = {};
    for (const h of assignableHits.slice(0, 200)) next[h.id] = true;
    setSuggestSelected(next);
  }, [activeGroup, assignableHits]);

  async function assignDealersBatch(dealer_ids: string[], buying_group_key: string | null) {
    const res = await fetch("/api/buying-groups/assign-batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealer_ids, buying_group_key }),
    });
    const js = await res.json();
    if (!res.ok) {
      alert(js?.error || "Zuordnung fehlgeschlagen (Admin?)");
      return false;
    }
    return true;
  }

  async function createGroup() {
    const key = createKey.trim();
    const label = createLabel.trim();
    if (!key || !label) return;
    const res = await fetch("/api/buying-groups/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, label }),
    });
    const js = await res.json();
    if (!res.ok) {
      alert(js?.error || "Anlegen fehlgeschlagen (Admin?)");
      return;
    }
    setCreateKey("");
    setCreateLabel("");
    await load();
  }

  async function assignDealer(dealer_id: string, buying_group_key: string | null) {
    const res = await fetch("/api/buying-groups/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealer_id, buying_group_key }),
    });
    const js = await res.json();
    if (!res.ok) {
      alert(js?.error || "Zuordnung fehlgeschlagen (Admin?)");
      return;
    }
    await load();
  }

  async function deleteGroup(key: string) {
    if (!confirm(`Einkaufsverband "${key}" wirklich löschen? (Zuordnungen werden entfernt)`)) return;
    const res = await fetch("/api/buying-groups/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const js = await res.json();
    if (!res.ok) {
      alert(js?.error || "Löschen fehlgeschlagen (Admin?)");
      return;
    }
    if (activeGroup === key) setActiveGroup("");
    await load();
  }

  function sortedByZip(list: any[]) {
    return [...(list || [])].sort((a, b) => {
      const az = String(a?.zip || "");
      const bz = String(b?.zip || "");
      const zc = az.localeCompare(bz);
      if (zc) return zc;
      return String(a?.name || "").localeCompare(String(b?.name || ""));
    });
  }

  function toggleMergeSel(groupKey: string, dealerId: string, checked: boolean) {
    setMergeSelByGroup((prev) => {
      const g = { ...(prev[groupKey] || {}) };
      if (checked) g[dealerId] = true;
      else delete g[dealerId];
      // also keep master in sync (first selected if current master disappears)
      setMergeMasterByGroup((mPrev) => {
        const ids = Object.keys(g);
        const cur = mPrev[groupKey] || "";
        const master = cur && g[cur] ? cur : (ids[0] || "");
        return { ...mPrev, [groupKey]: master };
      });
      return { ...prev, [groupKey]: g };
    });
  }

  async function mergeSelectedInGroup(groupKey: string) {
    const group = byKey.get(groupKey);
    const sel = mergeSelByGroup[groupKey] || {};
    const ids = Object.keys(sel).filter((k) => sel[k]);
    if (ids.length < 2) return alert("Bitte mindestens zwei Händler auswählen.");
    const preferred = (group?.dealers ?? []).find((d: any) => Number.isFinite(d?.lat) && Number.isFinite(d?.lng))?.id;
    const masterId = mergeMasterByGroup[groupKey] || preferred || ids[0];
    const mergeIds = ids.filter((x) => x !== masterId);
    const res = await fetch("/api/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ master_id: masterId, merge_ids: mergeIds, force: true, reason: `buying-group:${groupKey}` }),
    });
    const js = await res.json();
    if (!res.ok) return alert(js?.error || "Merge fehlgeschlagen");
    // refresh
    setMergeSelByGroup((p) => ({ ...p, [groupKey]: {} }));
    setMergeMasterByGroup((p) => ({ ...p, [groupKey]: "" }));
    await load();
  }

  return (
    <main className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Einkaufsverbände</h1>
          <p className="text-slate-600 text-sm">Übersicht und Zuordnung von Händlern zu Einkaufsverbänden.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/map" className="text-sm text-blue-600 hover:underline">Zur Karte</Link>
          <Link href="/cleanup" className="text-sm text-blue-600 hover:underline">Cleanup</Link>
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">Admin</Link>
        </div>
      </div>

      {err ? <div className="text-sm text-red-700 mb-4">{err}</div> : null}

      {isAdmin ? (
      <Card className="mb-6">
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="font-medium">Neuen Einkaufsverband anlegen (nur Admin)</div>
            <div className="text-sm text-slate-600">Key z. B. "zeg" / "bico" / "bikeco".</div>
          </div>
          <Badge>{loading ? "lädt…" : "bereit"}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="w-44">
            <label className="text-sm text-slate-700">Key</label>
            <Input value={createKey} onChange={(e) => setCreateKey(e.target.value)} placeholder="key" />
          </div>
          <div className="w-64">
            <label className="text-sm text-slate-700">Name</label>
            <Input value={createLabel} onChange={(e) => setCreateLabel(e.target.value)} placeholder="Name" />
          </div>
          <Button onClick={createGroup}>Anlegen</Button>
        </CardContent>
      </Card>
      ) : null}

      {isAdmin ? (
      <Card className="mb-6">
        <CardHeader>
          <div className="font-medium">Händler zuordnen (nur Admin)</div>
          <div className="text-sm text-slate-600">1) Verband auswählen 2) Händler suchen 3) Klick = zuweisen.</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {items.map((g) => (
              <button
                key={g.key}
                onClick={() => setActiveGroup(g.key)}
                className={`px-3 py-2 rounded-xl border text-sm flex items-center gap-2 ${activeGroup === g.key ? "bg-black text-white" : "bg-white"}`}
              >
                <Pictogram kind="buying_group" k={g.key} label={g.label} dataUrl={g.icon_data_url} size={18} />
                {g.label}
              </button>
            ))}
          </div>

          <div className="max-w-md">
            <label className="text-sm text-slate-700">Händler suchen</label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="z.B. Schneider" />
          </div>

          {activeGroup ? (
            <div className="text-xs text-slate-600">Aktiver Verband: {byKey.get(activeGroup)?.label || activeGroup}</div>
          ) : (
            <div className="text-xs text-slate-600">Bitte zuerst einen Verband auswählen.</div>
          )}

          {assignableHits.length ? (
            <div className="border rounded-xl">
              <div className="p-3 border-b flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">Vorschläge ({assignableHits.length})</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!activeGroup}
                    onClick={async () => {
                      if (!activeGroup) return;
                      const ids = assignableHits.map((h) => h.id);
                      if (!ids.length) return;
                      const ok = await assignDealersBatch(ids, activeGroup);
                      if (ok) {
                        setQ("");
                        setHits([]);
                        await load();
                      }
                    }}
                  >
                    Alle übernehmen
                  </Button>
                  <Button variant="secondary" onClick={() => setSuggestSelected({})}>
                    Alle ablehnen
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!activeGroup}
                    onClick={async () => {
                      if (!activeGroup) return;
                      const ids = Object.entries(suggestSelected)
                        .filter(([, v]) => v)
                        .map(([k]) => k)
                        .filter((id) => assignableHits.some((h) => h.id === id));
                      if (!ids.length) return;
                      const ok = await assignDealersBatch(ids, activeGroup);
                      if (ok) {
                        setQ("");
                        setHits([]);
                        await load();
                      }
                    }}
                  >
                    Markierte übernehmen
                  </Button>
                </div>
              </div>

              <div className="divide-y max-h-[420px] overflow-auto">
                {assignableHits.slice(0, 100).map((h) => (
                  <div key={h.id} className="p-3 flex items-center justify-between gap-3">
                    <label className="flex items-start gap-3 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!!suggestSelected[h.id]}
                        onChange={(e) =>
                          setSuggestSelected((s) => ({ ...s, [h.id]: e.target.checked }))
                        }
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{h.name}</div>
                        <div className="text-xs text-slate-600">{[h.zip, h.city].filter(Boolean).join(" ")}</div>
                      </div>
                    </label>
                    <div className="flex gap-2">
                      <Button
                        disabled={!activeGroup}
                        onClick={async () => {
                          if (!activeGroup) return;
                          const ok = await assignDealersBatch([h.id], activeGroup);
                          if (ok) await load();
                        }}
                      >
                        Zuordnen
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((g) => (
          <Card key={g.key}>
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pictogram kind="buying_group" k={g.key} label={g.label} dataUrl={g.icon_data_url} size={20} />
                <div>
                  <div className="font-medium">{g.label}</div>
                  <div className="text-xs text-slate-600">Key: {g.key}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{(g.dealers || []).length} Händler</Badge>
                {isAdmin ? (
                  <Button variant="secondary" onClick={() => deleteGroup(g.key)}>
                    Löschen
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {(g.dealers || []).length ? (
                <div className="space-y-2">
                  {isAdmin ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                      <div className="text-xs text-slate-600">Sortiert nach PLZ · Schnell-Merge ohne Force-Auswahl</div>
                      <Button
                        onClick={() => mergeSelectedInGroup(g.key)}
                        variant="secondary"
                        title="Markierte Händler zu einem Datensatz zusammenführen (Force)"
                      >
                        Markierte mergen
                      </Button>
                    </div>
                  ) : null}

                  {sortedByZip(g.dealers).slice(0, 80).map((d: any) => {
                    const sel = !!(mergeSelByGroup[g.key] || {})[d.id];
                    const master = (mergeMasterByGroup[g.key] || "") === d.id;
                    return (
                      <div key={d.id} className="flex items-center gap-2">
                        {isAdmin ? (
                          <div className="flex items-center gap-2 pr-1">
                            <input
                              type="checkbox"
                              checked={sel}
                              onChange={(e) => toggleMergeSel(g.key, d.id, e.target.checked)}
                              title="Für Merge markieren"
                            />
                            <input
                              type="radio"
                              name={`master-${g.key}`}
                              checked={master}
                              disabled={!sel}
                              onChange={() => setMergeMasterByGroup((p) => ({ ...p, [g.key]: d.id }))}
                              title="Als Master (Ziel)"
                            />
                          </div>
                        ) : null}

                        <Link href={`/dealer/${d.id}`} className="flex-1 block rounded-xl border p-2 hover:bg-black/5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{d.name}</div>
                              <div className="text-xs text-slate-600">{[d.zip, d.city].filter(Boolean).join(" ")}</div>
                            </div>
                            <div className="shrink-0">
                              <DealerListPictos
                                manufacturerKeys={d.manufacturer_keys ?? []}
                                buyingGroupKey={d.buying_group_key ?? null}
                                size={16}
                                maxManufacturers={3}
                              />
                            </div>
                          </div>
                        </Link>
                        {isAdmin ? (
                          <Button
                            variant="secondary"
                            onClick={() => assignDealer(d.id, null)}
                            title="Aus Verband entfernen"
                          >
                            Entfernen
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-slate-600">Keine Händler zugeordnet.</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
