"use client";

import { useMemo, useState, useEffect } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Input, Select } from "@/components/ui";
import type { Dealer, Territory } from "@/lib/types";

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

type DealerListItem = Dealer & {
  customer_no?: string | null;
};

const plz2 = (zip?: string | null) => {
  if (!zip) return null;
  const m = String(zip).match(/(\d{2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
};

export default function OrdertoolPage() {
  const [market, setMarket] = useState<"DE_AT" | "CH">("DE_AT");
  const [showHelp, setShowHelp] = useState(true);
  const [dealers, setDealers] = useState<DealerListItem[]>([]);
  const [dealerQuery, setDealerQuery] = useState("");
  const [selectedDealerId, setSelectedDealerId] = useState("");
  const [customerNo, setCustomerNo] = useState("");
  const [dealerLoading, setDealerLoading] = useState(false);
  const [dealerError, setDealerError] = useState<string | null>(null);
  const [dealerRestricted, setDealerRestricted] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const loadDealers = async () => {
      try {
        setDealerLoading(true);
        setDealerError(null);
        const [authRes, repsRes, dealerRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/reps/list", { cache: "no-store" }),
          fetch("/api/dealers/list", { cache: "no-store" }),
        ]);
        const auth = await authRes.json();
        const reps = await repsRes.json();
        const dealerData = await dealerRes.json();
        if (cancelled) return;

        const role = String(auth?.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "superadmin" || auth?.is_admin;
        const email = String(auth?.email || "").trim().toLowerCase();
        const territories = (reps?.territories ?? []) as Territory[];
        const items = (dealerData?.items ?? []) as DealerListItem[];

        if (!isAdmin && email) {
          const userTerritories = territories.filter((t) => String(t.profile_email || "").toLowerCase() === email);
          if (userTerritories.length > 0) {
            const filtered = items.filter((dealer) => {
              const zipGroup = plz2(dealer.zip);
              if (zipGroup == null) return false;
              return userTerritories.some((t) => {
                if (t.country && dealer.country && t.country !== dealer.country) return false;
                return zipGroup >= t.plz2_from && zipGroup <= t.plz2_to;
              });
            });
            setDealers(filtered);
            setDealerRestricted(true);
          } else {
            setDealers([]);
            setDealerRestricted(true);
          }
        } else {
          setDealers(items);
          setDealerRestricted(false);
        }
      } catch (e: any) {
        if (!cancelled) setDealerError(e?.message ?? "Händler konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setDealerLoading(false);
      }
    };
    loadDealers();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDealers = useMemo(() => {
    const query = dealerQuery.trim().toLowerCase();
    if (!query) return dealers;
    return dealers.filter((dealer) => dealer.name?.toLowerCase().includes(query));
  }, [dealers, dealerQuery]);

  const selectedDealer = useMemo(() => {
    return dealers.find((dealer) => dealer.id === selectedDealerId) ?? null;
  }, [dealers, selectedDealerId]);

  const handleStartOrder = () => {
    if (!selectedDealer) return;
    try {
      const payload = {
        dealerId: selectedDealer.id,
        dealerName: selectedDealer.name,
        customerNo: customerNo.trim(),
      };
      localStorage.setItem("FLYER_ORDERTOOL_PREFILL_V1", JSON.stringify(payload));
      localStorage.setItem("flyer_market", market === "CH" ? "CH" : "DE");
      const target = market === "CH" ? links.templateCH : links.templateDE;
      window.open(target, "_blank", "noopener,noreferrer");
    } catch {
      alert("Ordertool konnte nicht geöffnet werden.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ordertool</h1>
          <div className="mt-1 text-sm text-slate-600">
            MVP: Generator innerhalb der App (nur Sidebar-Einstieg). Händler-Erkennung und Export folgen später.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MarketBadge market={market} />
          <Select value={market} onChange={(e) => setMarket(e.target.value as any)} className="w-32">
            <option value="DE_AT">DE / AT</option>
            <option value="CH">CH</option>
          </Select>
          <Button variant="secondary" onClick={() => setShowHelp((v) => !v)}>
            {showHelp ? "Hilfe ausblenden" : "Hilfe anzeigen"}
          </Button>
        </div>
      </div>

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
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-semibold">Händler & Bestellung öffnen</div>
              <div className="mt-1 text-xs text-slate-500">
                {dealerRestricted
                  ? "Es werden nur Händler aus deinem Gebiet angezeigt."
                  : "Admins sehen alle Händler. Kundennummer ist optional."}
              </div>
              <div className="mt-3 space-y-2">
                <Input
                  value={dealerQuery}
                  onChange={(e) => setDealerQuery(e.target.value)}
                  placeholder="Händler suchen…"
                />
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={selectedDealerId}
                  onChange={(e) => setSelectedDealerId(e.target.value)}
                >
                  <option value="">{dealerLoading ? "Lade Händler…" : "Händler auswählen…"}</option>
                  {filteredDealers.map((dealer) => (
                    <option key={dealer.id} value={dealer.id}>
                      {dealer.name} · {dealer.zip ?? "—"} {dealer.city ?? ""}
                    </option>
                  ))}
                </select>
                <Input
                  value={customerNo}
                  onChange={(e) => setCustomerNo(e.target.value)}
                  placeholder="Kundennummer (optional)"
                />
                <Button className="w-full" onClick={handleStartOrder} disabled={!selectedDealer || dealerLoading}>
                  Bestellung im Ordertool öffnen
                </Button>
                {dealerError ? <div className="text-xs text-rose-600">{dealerError}</div> : null}
              </div>
            </div>

            {showHelp && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <div className="font-semibold">So testest du es schnell:</div>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Im Generator Regeln/Schwellen + Preisbuch wie gewohnt auswählen.</li>
                  <li>Beim Lagerbestand nimmst du diese Dummy-Datei (Download unten).</li>
                  <li>Market stellst du hier oben auf DE/AT oder CH – im Generator wählst du entsprechend das passende Template.</li>
                </ol>
              </div>
            )}

            <div className="grid gap-2">
              <a href={links.dummyStock} download>
                <Button className="w-full" variant="secondary">Dummy-Lagerbestand herunterladen</Button>
              </a>
              <a href={links.templateDE} download>
                <Button className="w-full" variant="secondary">Standalone HTML (DE/AT)</Button>
              </a>
              <a href={links.templateCH} download>
                <Button className="w-full" variant="secondary">Standalone HTML (CH)</Button>
              </a>
            </div>

            <div className="text-xs text-slate-500">
              Hinweis: Aus Sicherheitsgründen kann die App die Dateiauswahl im Generator nicht automatisch befüllen.
              Du lädst die Dateien im Generator wie bisher über dessen Upload-Felder. Die Standalone-HTML kannst du direkt an Händler senden.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Generator</div>
                <div className="mt-1 text-xs text-slate-500">läuft als eingebettete HTML-Datei</div>
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
