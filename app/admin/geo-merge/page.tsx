"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Input } from "@/components/ui";

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
};

type Suggestion = DealerRow & { score?: number; name_score?: number };

export default function GeoMergePage() {
  const [items, setItems] = useState<DealerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 150;

  const [active, setActive] = useState<DealerRow | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sLoading, setSLoading] = useState(false);

  const pageInfo = useMemo(() => ({ offset, limit }), [offset]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dealers/no-geo?limit=${limit}&offset=${offset}&q=${encodeURIComponent(q.trim())}`,
        { cache: "no-store" }
      );
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || "Fehler beim Laden");
      setItems(js.items || []);
    } catch (e: any) {
      setErr(e?.message || "Fehler beim Laden");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

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
    const ok = confirm(`Diesen Händler in den Vorschlag mergen?\n\nQuelle: ${active.name}\nMaster: ${masterId}`);
    if (!ok) return;

    const res = await fetch("/api/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ master_id: masterId, merge_ids: [active.id], force: true, reason: "geo-merge" }),
    });
    const js = await res.json().catch(() => ({}));
    if (!res.ok) return alert(js?.error || "Merge fehlgeschlagen");

    // refresh list + keep modal on next item
    setActive(null);
    setSuggestions([]);
    await load();
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
          <Link href="/map" className="text-sm text-blue-600 hover:underline">Zur Karte</Link>
          <Link href="/cleanup" className="text-sm text-blue-600 hover:underline">Cleanup</Link>
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">Admin</Link>
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
            <Badge>{loading ? "lädt…" : `${items.length} / ${limit}`}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-end justify-between">
              <div className="max-w-md flex-1">
                <label className="text-sm text-slate-700">Suche (Name)</label>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="z.B. Lucky Bike" />
              </div>
              <div className="flex gap-2">
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
              <div className="text-sm text-slate-600">Wähle einen Master mit Geodaten.</div>
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
              </div>
            ) : (
              <div className="text-sm text-slate-600">Klicke links einen Händler an.</div>
            )}

            {active && !sLoading && suggestions.length === 0 ? (
              <div className="text-sm text-slate-600">
                Keine Vorschläge gefunden. (Bei verrutschten PLZ/Ort-Daten kannst du über die Suche links einen passenden
                Master öffnen und dann manuell mergen.)
              </div>
            ) : null}

            <div className="border rounded-xl divide-y max-h-[560px] overflow-auto">
              {suggestions.map((s) => (
                <div key={s.id} className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{s.name}</div>
                    <div className="text-xs text-slate-600 truncate">{fmtAddr(s)}</div>
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
