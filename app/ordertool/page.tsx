"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Select } from "@/components/ui";

function MarketBadge({ market }: { market: "DE_AT" | "CH" }) {
  if (market === "CH") return <Badge tone="blue">CH</Badge>;
  return <Badge tone="emerald">DE/AT</Badge>;
}

export default function OrdertoolPage() {
  const [market, setMarket] = useState<"DE_AT" | "CH">("DE_AT");
  const [showHelp, setShowHelp] = useState(true);

  const generatorSrc = useMemo(() => "/ordertool/generator.html", []);

  const links = useMemo(() => {
    return {
      dummyStock: "/ordertool/dummy_stock.xlsx",
      templateDE: "/ordertool/template_de_at.html",
      templateCH: "/ordertool/template_ch.html",
    };
  }, []);

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

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Sidebar</div>
              <MarketBadge market={market} />
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Zum Durchtesten nutzen wir erstmal Dummy-Lagerbestand.
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
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
                <Button className="w-full" variant="secondary">Template DE/AT herunterladen</Button>
              </a>
              <a href={links.templateCH} download>
                <Button className="w-full" variant="secondary">Template CH herunterladen</Button>
              </a>
            </div>

            <div className="text-xs text-slate-500">
              Hinweis: Aus Sicherheitsgründen kann die App die Dateiauswahl im Generator nicht automatisch befüllen.
              Du lädst die Dateien im Generator wie bisher über dessen Upload-Felder.
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
              <MarketBadge market={market} />
            </div>
          </CardHeader>
          <CardContent>
            <iframe
              key={market}
              src={generatorSrc}
              className="h-[78vh] w-full rounded-xl border border-slate-200 bg-white"
              title="FLYER Ordertool Generator"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
