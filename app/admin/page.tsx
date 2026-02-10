"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Input, Select } from "@/components/ui";
import { DealerListPictos } from "@/components/DealerListPictos";

type DealerRow = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  country_iso: string | null;
  lat: number | null;
  lng: number | null;
  buying_group_key?: string | null;
  manufacturer_keys?: string[];
};

type Suggestion = DealerRow & { score?: number; name_score?: number };

export default function GeoMergePage() {
  const [items, setItems] = useState<DealerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [stats, setStats] = useState<{ total_scanned?: number; total_matches?: number } | null>(null);

  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 150;

  const [sort, setSort] = useState<"zip" | "buying_group">("zip");

  const [active, setActive] = useState<DealerRow | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sLoading, setSLoading] = useState(false);

  // Force merge should be ON by default (same as buying-group merge)
  const [forceMerge, setForceMerge] = useState(true);

  // Manual master search (for cases with messy zip/city)
  const [masterQ, setMasterQ] = useState("");
  const [masterItems, setMasterItems] = useState<DealerRow[]>([]);
  const [mLoading, setMLoading] = useState(false);

  const pageInfo = useMemo(() => ({ offset, limit }), [offset]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dealers/no-geo?only_match=1&scan=2500&sort=${sort}&limit=${limit}&offset=${offset}&q=${encodeURIComponent(q.trim())}`,
        { cache: "no-store" }
      );
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || "Fehler beim Laden");
      setItems(js.items || []);
      setStats({ total_scanned: js.total_scanned, total_matches: js.total_matches });
    } catch (e: any) {
      setErr(e?.message || "Fehler beim Laden");
      setItems([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, sort]);

  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      load();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function loadSuggestions(dealer: DealerRow) {
    setActive(dealer);
    setSuggestions([]);
    setMasterItems([]);
    setSLoading(true);
    try {
      const res = await fetch(`/api/dealers/geo-suggestions?id=${encodeURIComponent(dealer.id)}`, {
        cache: "no-store",
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || "Fehler bei Vorschlägen");
      setSuggestions(js.items || []);
    } catch (e: any) {
      setSuggestions([]);
      alert(e?.message || "Fehler bei Vorschlägen");
    } finally {
      setSLoading(false);
    }
  }

  async function mergeInto(masterId: string) {
    if (!active) return;
    const ok = confirm(
      `Diesen Händler mergen?\n\nQuelle: ${active.name}\nMaster: ${masterId}\n\nForce Merge: ${forceMerge ? "AN" : "AUS"}`
    );
    if (!ok) return;

    const res = await fetch("/api/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        master_id: masterId,
        merge_ids: [active.id],
        force: forceMerge,
        reason: forceMerge ? "geo-merge-force" : "geo-merge",
      }),
    });
    const js = await res.json().catch(() => ({}));
    if (!res.ok) return alert(js?.error || "Merge fehlgeschlagen");

    // refresh list + keep modal on next item
    setActive(null);
    setSuggestions([]);
    await load();
  }

  async function excludeActive() {
    if (!active) return;
    const ok = confirm(
      `Diesen Händler von der Geo-Merge-Liste ausschließen (kein passendes Match)?\n\n${active.name}\n${fmtAddr(active)}`
    );
    if (!ok) return;
    const res = await fetch("/api/dealers/geo-exclude", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealer_id: active.id, reason: "geo-no-match" }),
    });
    const js = await res.json().catch(() => ({}));
    if (!res.ok) return alert(js?.error || "Ausschließen fehlgeschlagen");
    setActive(null);
    setSuggestions([]);
    setMasterItems([]);
    await load();
  }

  async function searchMasters() {
    if (!active) return;
    setMLoading(true);
    try {
      const res = await fetch(
        `/api/dealers/geo-master-search?id=${encodeURIComponent(active.id)}&q=${encodeURIComponent(masterQ.trim())}&limit=25`,
        { cache: "no-store" }
      );
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || "Master-Suche fehlgeschlagen");
      setMasterItems(js.items || []);
    } catch (e: any) {
      setMasterItems([]);
      alert(e?.message || "Master-Suche fehlgeschlagen");
    } finally {
      setMLoading(false);
    }
  }

  function fmtAddr(d: DealerRow) {
    return [d.street, [d.zip, d.city].filter(Boolean).join(" "), d.country_iso || d.country].filter(Boolean).join(" · ");
  }

  return (
    <main className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Händler ohne Geodaten</h1>
          <p className="text-slate-600 text-sm">PLZ-sortiert · Vorschläge mit Ähnlichkeit · Merge wie beim Einkaufsverband.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">Admin</Link>
          <Link href="/admin/geo-merge/overview" className="text-sm text-blue-600 hover:underline">Übersicht</Link>
        </div>
      </div>

      {err ? <div className="text-sm text-red-700 mb-4">{err}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Liste ohne Geodaten</div>
              <div className="text-sm text-slate-600">Sortiert nach PLZ. Klick öffnet Vorschläge.</div>
            </div>
            <Badge>
              {loading
                ? "lädt…"
                : stats?.total_matches != null
                  ? `${items.length} / ${limit} (Matches: ${stats.total_matches})`
                  : `${items.length} / ${limit}`}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-end justify-between">
              <div className="max-w-md flex-1">
                <label className="text-sm text-slate-700">Suche (Name)</label>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="z.B. Lucky Bike" />
              </div>
              <div className="flex gap-2">
                <div className="w-52">
                  <label className="text-sm text-slate-700">Sortieren</label>
                  <Select
                    value={sort}
                    onChange={(e) => {
                      setOffset(0);
                      setSort((e.target.value as any) === "buying_group" ? "buying_group" : "zip");
                    }}
                  >
                    <option value="zip">PLZ</option>
                    <option value="buying_group">Einkaufsverband</option>
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  Zurück
                </Button>
                <Button
                  variant="secondary"
                  disabled={items.length < limit || loading}
                  onClick={() => setOffset(offset + limit)}
                >
                  Weiter
                </Button>
              </div>
            </div>

            <div className="border rounded-xl divide-y max-h-[560px] overflow-auto">
              {(items || []).map((d) => (
                <button
                  key={d.id}
                  onClick={() => loadSuggestions(d)}
                  className={`w-full text-left p-3 hover:bg-slate-50 ${active?.id === d.id ? "bg-slate-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{d.name}</div>
                      <div className="text-xs text-slate-600 truncate">{fmtAddr(d)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <DealerListPictos
                          manufacturerKeys={d.manufacturer_keys ?? []}
                          buyingGroupKey={d.buying_group_key ?? null}
                          size={16}
                          maxManufacturers={4}
                        />
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{String(d.zip ?? "").padStart(5, " ")}</div>
                  </div>
                </button>
              ))}
              {!items.length && !loading ? <div className="p-4 text-sm text-slate-600">Keine Treffer.</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Vorschläge / Merge</div>
              <div className="text-sm text-slate-600">Wähle einen Master mit Geodaten. Force Merge ist standardmäßig an.</div>
            </div>
            <Badge>{sLoading ? "sucht…" : suggestions.length ? `${suggestions.length} Vorschläge` : "bereit"}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {active ? (
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-600">Quelle (ohne Geo)</div>
                <div className="font-medium text-sm">{active.name}</div>
                <div className="text-xs text-slate-600">{fmtAddr(active)}</div>
                <div className="text-xs text-slate-500 mt-1">ID: {active.id}</div>

                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <label className="text-xs text-slate-600 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={forceMerge}
                      onChange={(e) => setForceMerge(e.target.checked)}
                    />
                    Force Merge
                  </label>
                  <Button variant="secondary" onClick={excludeActive}>Kein Match / Ausschließen</Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">Klicke links einen Händler an.</div>
            )}

            {active && !sLoading && suggestions.length === 0 ? (
              <div className="text-sm text-slate-600">
                Keine Vorschläge gefunden. Nutze unten die <b>Master-Suche</b> (z.B. "Lucky Bike") und merge dann per Force.
              </div>
            ) : null}

            {active ? (
              <div className="rounded-xl border p-3 space-y-2">
                <div className="text-xs text-slate-600">Master manuell suchen (mit Geodaten)</div>
                <div className="flex gap-2">
                  <Input value={masterQ} onChange={(e) => setMasterQ(e.target.value)} placeholder="z.B. Lucky Bike" />
                  <Button variant="secondary" onClick={searchMasters} disabled={mLoading}>
                    {mLoading ? "…" : "Suchen"}
                  </Button>
                </div>
                {masterItems.length ? (
                  <div className="border rounded-xl divide-y max-h-[220px] overflow-auto">
                    {masterItems.map((m) => (
                      <div key={m.id} className="p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{m.name}</div>
                          <div className="text-xs text-slate-600 truncate">{fmtAddr(m)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <DealerListPictos
                          manufacturerKeys={m.manufacturer_keys ?? []}
                          buyingGroupKey={m.buying_group_key ?? null}
                          size={16}
                          maxManufacturers={4}
                        />
                      </div>
                        </div>
                        <Button onClick={() => mergeInto(m.id)}>Merge</Button>
                      </div>
                    ))}
                  </div>
                ) : masterQ.trim().length >= 2 && !mLoading ? (
                  <div className="text-xs text-slate-600">Keine Treffer.</div>
                ) : null}
              </div>
            ) : null}

            <div className="border rounded-xl divide-y max-h-[560px] overflow-auto">
              {suggestions.map((s) => (
                <div key={s.id} className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{s.name}</div>
                    <div className="text-xs text-slate-600 truncate">{fmtAddr(s)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <DealerListPictos
                        manufacturerKeys={s.manufacturer_keys ?? []}
                        buyingGroupKey={s.buying_group_key ?? null}
                        size={16}
                        maxManufacturers={4}
                      />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Score: {Number(s.score ?? 0).toFixed(3)} · Name: {Number(s.name_score ?? 0).toFixed(3)}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <Button onClick={() => mergeInto(s.id)}>Merge</Button>
                    <div className="text-xs text-slate-500">Geo: {s.lat?.toFixed?.(5)},{" "}{s.lng?.toFixed?.(5)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
