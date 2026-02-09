"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Input, Select } from "@/components/ui";

type Market = "DE_AT" | "CH";

type StockItem = {
  id: string;
  sku: string;
  name: string | null;
  model_year: number | null;
  series: string | null;
  model: string | null;
  color: string | null;
  frame_size: string | null;
  frame_type: string | null;
  battery: string | null;
  motor_type: string | null;
  motor_brand: string | null;
  price_eur: number | null;
  price_chf: number | null;
  avail_now: number | null;
  avail_total: number | null;
  availability_plan: Array<{ label: string; qty: number }> | null;
};

function MarketBadge({ market }: { market: Market }) {
  if (market === "CH") return <Badge tone="blue">CH</Badge>;
  return <Badge tone="emerald">DE/AT</Badge>;
}

function formatPrice(value: number | null, currency: "EUR" | "CHF") {
  if (value == null || !Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(value);
}

function getAvailabilityLabel(item: StockItem) {
  if ((item.avail_now ?? 0) > 0) return "sofort";
  const next = (item.availability_plan ?? []).find((entry) => entry.qty > 0);
  return next ? `ab ${next.label}` : "nicht verfügbar";
}

export default function OrdertoolPage() {
  const [market, setMarket] = useState<Market>("DE_AT");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const q = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const params = new URLSearchParams();
        params.set("market", market);
        if (q) params.set("q", q);
        const res = await fetch(`/api/stock/latest?${params.toString()}`, { cache: "no-store" });
        const js = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(js?.error || "Konnte Lagerbestand nicht laden.");
        if (alive) setItems(js?.items ?? []);
      } catch (e: any) {
        if (alive) {
          setItems([]);
          setErr(e?.message || "Fehler beim Laden.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [market, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ordertool</h1>
          <div className="mt-1 text-sm text-slate-600">
            Lagerbestand aus dem aktuellen Snapshot. Suche und filtere nach Artikelnummer oder Modell.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MarketBadge market={market} />
          <Select value={market} onChange={(e) => setMarket(e.target.value as Market)} className="w-32">
            <option value="DE_AT">DE / AT</option>
            <option value="CH">CH</option>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm font-semibold">Artikel &amp; Verfügbarkeit</div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suche nach Artikelnummer, Modell, Serie…"
              className="md:w-80"
            />
            <Button variant="secondary" onClick={() => setQuery("")} disabled={!query}>
              Zurücksetzen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {err ? <div className="text-sm text-red-700">{err}</div> : null}
          {loading ? <div className="text-sm text-slate-500">Lade Lagerbestand…</div> : null}

          {!loading && !items.length ? (
            <div className="text-sm text-slate-500">Keine Artikel gefunden.</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-2 py-2">Artikel</th>
                    <th className="px-2 py-2">Modell</th>
                    <th className="px-2 py-2">Verfügbarkeit</th>
                    <th className="px-2 py-2">Max.</th>
                    <th className="px-2 py-2">Preis</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-2 py-2">
                        <div className="font-medium">{item.name || "–"}</div>
                        <div className="text-xs text-slate-500">#{item.sku}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div>{item.model || item.series || "–"}</div>
                        <div className="text-xs text-slate-500">
                          {[item.color, item.frame_size].filter(Boolean).join(" · ") || "–"}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <Badge tone={(item.avail_now ?? 0) > 0 ? "emerald" : "slate"}>
                          {getAvailabilityLabel(item)}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">{item.avail_total ?? "–"}</td>
                      <td className="px-2 py-2">
                        {market === "CH"
                          ? formatPrice(item.price_chf, "CHF")
                          : formatPrice(item.price_eur, "EUR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
