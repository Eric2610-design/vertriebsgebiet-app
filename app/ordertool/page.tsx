"use client";

import { useMemo, useState, useEffect } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Input, Select } from "@/components/ui";
import type { Dealer, Territory } from "@/lib/types";

type Market = "DE_AT" | "CH";

function MarketBadge({ market }: { market: Market }) {
  if (market === "CH") return <Badge tone="blue">CH</Badge>;
  return <Badge tone="emerald">DE/AT</Badge>;
}

type DealerListItem = Dealer & {
  customer_no?: string | null;
};

const TEMPLATE_LINKS = {
  DE_AT: "/ordertool/template_de_at.html",
  CH: "/ordertool/template_ch.html",
} as const;

const plz2 = (zip?: string | null) => {
  if (!zip) return null;
  const m = String(zip).match(/(\d{2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
};

export default function OrdertoolPage() {
  const [market, setMarket] = useState<"DE_AT" | "CH">("DE_AT");
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
      const target = market === "CH" ? TEMPLATE_LINKS.CH : TEMPLATE_LINKS.DE_AT;
      window.open(target, "_blank", "noopener,noreferrer");
    } catch {
      alert("Ordertool konnte nicht geöffnet werden.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ordertool</h1>
          <div className="mt-1 text-sm text-slate-600">
            Lagerbestand aus dem aktuellen Snapshot. Suche und filtere nach Artikelnummer oder Modell.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MarketBadge market={market} />
          <Select
            value={market}
            onChange={(e) => setMarket(e.target.value as Market)}
            className="h-10 w-36 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900"
          >
            <option value="DE_AT">🇩🇪 DE / AT</option>
            <option value="CH">🇨🇭 CH</option>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="text-sm font-semibold">Händler &amp; Bestellung öffnen</CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="text-xs text-slate-500">
            {dealerRestricted
              ? "Es werden nur Händler aus deinem Gebiet angezeigt."
              : "Admins sehen alle Händler. Kundennummer ist optional."}
          </div>
          <div className="space-y-2">
            <Input
              value={dealerQuery}
              onChange={(e) => setDealerQuery(e.target.value)}
              placeholder="Händler suchen…"
            />
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="text-sm font-semibold">Hinweise</CardHeader>
        <CardContent className="text-xs text-slate-600 space-y-2">
          <p>
            Für Tests kannst du weiterhin die Dummy-Lagerbestände und HTML-Templates aus der Admin-Ansicht laden.
          </p>
          <p>
            Händlername und Kundennummer werden beim Öffnen des Ordertools automatisch übernommen, wenn sie hier
            eingegeben wurden.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
