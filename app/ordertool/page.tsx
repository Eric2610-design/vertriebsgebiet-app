"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Select } from "@/components/ui";

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
  raw?: Record<string, any> | null;
};

type CartLine = {
  item: StockItem;
  qty: number;
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

function parseNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readFirstNumber(raw: Record<string, any> | null | undefined, keys: string[]) {
  if (!raw) return null;
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && String(raw[key]).trim() !== "") {
      return parseNumber(raw[key]);
    }
  }
  return null;
}

function isFixprice(raw: Record<string, any> | null | undefined) {
  if (!raw) return false;
  const keys = ["Fixpreis", "Fixpreis/Sonderpreis", "Sonderpreis", "Fixpreisartikel"];
  return keys.some((key) => raw[key] !== undefined && raw[key] !== null && String(raw[key]).trim() !== "");
}

const PANASONIC_THRESHOLDS = [
  { min: 80, factor: 3.0 },
  { min: 40, factor: 2.5 },
  { min: 20, factor: 2.3 },
  { min: 10, factor: 2.2 },
];

const BOSCH_THRESHOLDS = [
  { min: 80, factor: 2.5 },
  { min: 40, factor: 2.3 },
  { min: 20, factor: 2.0 },
];

function computeUnitPrice(item: StockItem, qty: number, market: Market) {
  const raw = item.raw ?? null;
  const ek = market === "CH"
    ? readFirstNumber(raw, ["EK CHF", "EK in CHF", "EK_CHF"])
    : readFirstNumber(raw, ["EK EUR", "EK in EUR", "EK_EUR"]);
  const vk = market === "CH" ? item.price_chf : item.price_eur;
  const base = ek ?? vk ?? null;
  if (!base || !vk) return base;

  const motorBrand = (item.motor_brand || "").toLowerCase();
  const usesPanasonic = motorBrand.includes("panasonic");
  const usesBosch = motorBrand.includes("bosch");
  const fixprice = isFixprice(raw);

  let thresholdFactor: number | null = null;
  if (usesPanasonic) {
    thresholdFactor = PANASONIC_THRESHOLDS.find((entry) => qty >= entry.min)?.factor ?? null;
  } else if (usesBosch && fixprice) {
    thresholdFactor = BOSCH_THRESHOLDS.find((entry) => qty >= entry.min)?.factor ?? null;
  }

  if (!thresholdFactor) return base;

  const thresholdPrice = vk / thresholdFactor;
  if (market === "CH") return thresholdPrice;
  return base > thresholdPrice ? thresholdPrice : base;
}

export default function OrdertoolPage() {
  const [market, setMarket] = useState<Market>("DE_AT");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, CartLine>>({});

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

  const cartLines = Object.values(cart);
  const cartTotal = cartLines.reduce((sum, line) => {
    const unit = computeUnitPrice(line.item, line.qty, market);
    if (!unit) return sum;
    return sum + unit * line.qty;
  }, 0);

  return (
    <div className="-mx-4 -mt-6 bg-gradient-to-b from-[#060a14] to-[#0b1220] pb-10 text-slate-100">
      <div className="mx-auto max-w-[1100px] px-4 pt-8">
        <div className="rounded-[18px] border border-slate-700/40 bg-slate-900/80 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold">FLYER Ordertool</h1>
              <div className="mt-1 text-sm text-slate-300">
                Lagerbestand aus dem aktuellen Snapshot. Suche und filtere nach Artikelnummer oder Modell.
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MarketBadge market={market} />
              <Select
                value={market}
                onChange={(e) => setMarket(e.target.value as Market)}
                className="h-10 w-36 rounded-xl border border-slate-700/60 bg-[#0b1220] text-sm font-semibold text-slate-100"
              >
                <option value="DE_AT">🇩🇪 DE / AT</option>
                <option value="CH">🇨🇭 CH</option>
              </Select>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
            <section className="rounded-2xl border border-slate-700/40 bg-slate-900/40 p-4">
              <h2 className="text-sm font-semibold">Suche &amp; Filter</h2>
              <p className="mt-1 text-xs text-slate-400">
                Filtere nach Artikelnummer, Modell, Serie oder Farbe. Markt bestimmt die sichtbaren Preise.
              </p>

              <div className="mt-3 flex flex-col gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Suche nach Artikelnummer, Modell, Serie…"
                  className="h-10 rounded-xl border border-slate-700/70 bg-[#0b1220] text-sm font-semibold text-slate-100 placeholder:text-slate-500"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setQuery("")}
                    disabled={!query}
                    className="h-10 rounded-xl border border-slate-700/70 bg-white/5 text-slate-100 hover:bg-white/10"
                  >
                    Zurücksetzen
                  </Button>
                  <div className="text-xs text-slate-500">Es wird immer der neueste Import genutzt.</div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-700/40 bg-slate-900/40 p-3 text-xs text-slate-300">
                <div className="font-semibold text-slate-200">Status</div>
                {err ? <div className="mt-1 text-red-300">{err}</div> : null}
                {loading ? <div className="mt-1 text-slate-400">Lade Lagerbestand…</div> : null}
                {!loading && !items.length ? <div className="mt-1 text-slate-400">Keine Artikel gefunden.</div> : null}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-700/40 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Warenkorb</div>
                  <div className="text-xs text-slate-400">
                    Gesamt: {formatPrice(cartTotal || 0, market === "CH" ? "CHF" : "EUR")}
                  </div>
                </div>

                {cartLines.length === 0 ? (
                  <div className="mt-3 text-xs text-slate-400">Noch keine Positionen hinzugefügt.</div>
                ) : (
                  <div className="mt-3 space-y-3 text-xs">
                    {cartLines.map((line) => {
                      const unit = computeUnitPrice(line.item, line.qty, market);
                      const lineTotal = unit ? unit * line.qty : null;
                      return (
                        <div key={line.item.id} className="rounded-xl border border-slate-700/50 bg-[#0b1220] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-slate-100">{line.item.name || "–"}</div>
                              <div className="text-xs text-slate-500">#{line.item.sku}</div>
                            </div>
                            <button
                              className="text-xs text-slate-400 hover:text-slate-200"
                              onClick={() => {
                                setCart((prev) => {
                                  const next = { ...prev };
                                  delete next[line.item.id];
                                  return next;
                                });
                              }}
                              type="button"
                            >
                              Entfernen
                            </button>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-2 text-xs text-slate-300">
                              Menge
                              <input
                                type="number"
                                min={1}
                                max={line.item.avail_total ?? 999}
                                value={line.qty}
                                onChange={(e) => {
                                  const nextQty = Math.max(1, Number(e.target.value) || 1);
                                  setCart((prev) => ({
                                    ...prev,
                                    [line.item.id]: { ...line, qty: nextQty },
                                  }));
                                }}
                                className="h-8 w-20 rounded-lg border border-slate-700/70 bg-[#0b1220] px-2 text-right text-xs text-slate-100"
                              />
                            </label>
                            <div className="text-xs text-slate-400">
                              Preis/Stk: {unit ? formatPrice(unit, market === "CH" ? "CHF" : "EUR") : "–"}
                            </div>
                            <div className="text-xs text-slate-200">
                              Summe: {lineTotal ? formatPrice(lineTotal, market === "CH" ? "CHF" : "EUR") : "–"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-700/40 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Artikel &amp; Verfügbarkeit</div>
                <div className="text-xs text-slate-400">Max = Verfügbar gesamt</div>
              </div>

              <div className="mt-3 overflow-auto">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="px-3 py-1">Artikel</th>
                      <th className="px-3 py-1">Modell</th>
                      <th className="px-3 py-1">Verfügbarkeit</th>
                      <th className="px-3 py-1 text-right">Max.</th>
                      <th className="px-3 py-1 text-right">Preis</th>
                      <th className="px-3 py-1 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="rounded-xl bg-[#0b1220]">
                        <td className="px-3 py-2 align-top">
                          <div className="font-semibold text-slate-100">{item.name || "–"}</div>
                          <div className="text-xs text-slate-500">#{item.sku}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-slate-100">{item.model || item.series || "–"}</div>
                          <div className="text-xs text-slate-500">
                            {[item.color, item.frame_size].filter(Boolean).join(" · ") || "–"}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Badge tone={(item.avail_now ?? 0) > 0 ? "emerald" : "slate"}>
                            {getAvailabilityLabel(item)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right align-top text-slate-100">
                          {item.avail_total ?? "–"}
                        </td>
                        <td className="px-3 py-2 text-right align-top text-slate-100">
                          {market === "CH"
                            ? formatPrice(item.price_chf, "CHF")
                            : formatPrice(item.price_eur, "EUR")}
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          <Button
                            variant="secondary"
                            className="h-8 rounded-lg border border-slate-700/70 bg-white/5 text-xs text-slate-100 hover:bg-white/10"
                            onClick={() => {
                              setCart((prev) => {
                                const existing = prev[item.id];
                                const nextQty = existing ? existing.qty + 1 : 1;
                                return {
                                  ...prev,
                                  [item.id]: { item, qty: nextQty },
                                };
                              });
                            }}
                          >
                            + Warenkorb
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
