"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";
import { Pictogram } from "@/components/Pictogram";

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

  const byKey = useMemo(() => {
    const m = new Map(items.map((g) => [g.key, g] as const));
    return m;
  }, [items]);

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

          {hits.length ? (
            <div className="border rounded-xl divide-y">
              {hits.slice(0, 20).map((h) => (
                <div key={h.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{h.name}</div>
                    <div className="text-xs text-slate-600">{[h.zip, h.city].filter(Boolean).join(" ")}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={!activeGroup}
                      onClick={() => assignDealer(h.id, activeGroup)}
                    >
                      Zuordnen
                    </Button>
                    <Button variant="secondary" onClick={() => assignDealer(h.id, null)}>
                      Entfernen
                    </Button>
                  </div>
                </div>
              ))}
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
                  {g.dealers.slice(0, 30).map((d) => (
                    <Link key={d.id} href={`/dealer/${d.id}`} className="block rounded-xl border p-2 hover:bg-black/5">
                      <div className="text-sm font-medium">{d.name}</div>
                      <div className="text-xs text-slate-600">{[d.zip, d.city].filter(Boolean).join(" ")}</div>
                    </Link>
                  ))}
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
