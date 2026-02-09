"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Card, CardContent, CardHeader, Select } from "@/components/ui";

function MarketBadge({ market }: { market: "DE_AT" | "CH" }) {
  if (market === "CH") return <Badge tone="blue">CH</Badge>;
  return <Badge tone="emerald">DE/AT</Badge>;
}

export default function OrdertoolPage() {
  const [market, setMarket] = useState<"DE_AT" | "CH">("DE_AT");
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);

  const ordertoolSrc = useMemo(() => (market === "CH" ? "/ordertool/template_ch.html" : "/ordertool/template_de_at.html"), [market]);

  useEffect(() => {
    const dealerId = searchParams.get("dealerId") || "";
    const dealerName = searchParams.get("dealerName") || "";
    const customerNo = searchParams.get("customerNo") || "";
    const marketParam = searchParams.get("market");
    if (marketParam === "CH") setMarket("CH");
    if (marketParam === "DE_AT") setMarket("DE_AT");
    if (dealerId || dealerName) {
      localStorage.setItem("FLYER_ORDERTOOL_PREFILL_V1", JSON.stringify({ dealerId, dealerName, customerNo }));
    }
    if (marketParam === "CH" || marketParam === "DE_AT") {
      localStorage.setItem("flyer_market", marketParam === "CH" ? "CH" : "DE");
    }
    setReady(true);
  }, [searchParams]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ordertool</h1>
          <div className="mt-1 text-sm text-slate-600">
            Eingebettetes Ordertool mit Live-Daten aus dem Admin-Bereich.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MarketBadge market={market} />
          <Select
            value={market}
            onChange={(e) => {
              const value = e.target.value as "DE_AT" | "CH";
              setMarket(value);
              localStorage.setItem("flyer_market", value === "CH" ? "CH" : "DE");
            }}
            className="w-32"
          >
            <option value="DE_AT">DE / AT</option>
            <option value="CH">CH</option>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Ordertool</div>
              <div className="mt-1 text-xs text-slate-500">läuft eingebettet in der App</div>
            </div>
            <MarketBadge market={market} />
          </div>
        </CardHeader>
        <CardContent>
          {ready ? (
            <iframe
              key={market}
              src={ordertoolSrc}
              className="h-[82vh] w-full rounded-xl border border-slate-200 bg-white"
              title="FLYER Ordertool"
            />
          ) : (
            <div className="text-sm text-slate-600">Ordertool lädt…</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
