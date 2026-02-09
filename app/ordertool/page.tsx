"use client";

import { useMemo, useState, useEffect } from "react";
import { Badge, Button, Input, Select } from "@/components/ui";
import type { Dealer, Territory } from "@/lib/types";

type Market = "DE_AT" | "CH";

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

  const links = {
    dummyStock: "/ordertool/dummy_stock.xlsx",
    templateDE: "/ordertool/template_de_at.html",
    templateCH: "/ordertool/template_ch.html",
  };

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
              <Button variant="secondary" onClick={() => setShowHelp((v) => !v)}>
                {showHelp ? "Hilfe ausblenden" : "Hilfe anzeigen"}
              </Button>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-slate-700/50 bg-[#0b1220] p-4">
              <div className="text-sm font-semibold">Händler &amp; Bestellung öffnen</div>
              <div className="mt-1 text-xs text-slate-400">
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
                  className="w-full rounded-xl border border-slate-700/50 bg-[#0b1220] px-3 py-2 text-sm text-slate-100"
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
                {dealerError ? <div className="text-xs text-rose-400">{dealerError}</div> : null}
              </div>
            </div>

            {showHelp && (
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3 text-xs text-slate-300">
                <div className="font-semibold">So testest du es schnell:</div>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Im Generator Regeln/Schwellen + Preisbuch wie gewohnt auswählen.</li>
                  <li>Beim Lagerbestand nimmst du diese Dummy-Datei (Download unten).</li>
                  <li>
                    Market stellst du hier oben auf DE/AT oder CH – im Generator wählst du entsprechend das passende
                    Template.
                  </li>
                </ol>
              </div>
            )}

            <div className="grid gap-2">
              <a href={links.dummyStock} download>
                <Button className="w-full" variant="secondary">
                  Dummy-Lagerbestand herunterladen
                </Button>
              </a>
              <a href={links.templateDE} download>
                <Button className="w-full" variant="secondary">
                  Standalone HTML (DE/AT)
                </Button>
              </a>
              <a href={links.templateCH} download>
                <Button className="w-full" variant="secondary">
                  Standalone HTML (CH)
                </Button>
              </a>
            </div>

            <div className="text-xs text-slate-400">
              Hinweis: Aus Sicherheitsgründen kann die App die Dateiauswahl im Generator nicht automatisch befüllen. Du
              lädst die Dateien im Generator wie bisher über dessen Upload-Felder. Die Standalone-HTML kannst du direkt
              an Händler senden.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
