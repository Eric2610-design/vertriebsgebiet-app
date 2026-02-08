"use client";

import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";

type Market = "DE_AT" | "CH";
type Motor = "PANASONIC" | "BOSCH";

type Rule = {
  market: Market;
  motor: Motor;
  requiresFixprice: boolean;
  minQty: number;
  factor: number;
  active: boolean;
};

type SettingRow = { key: string; value: any; updated_at?: string };

const DEFAULT_VALUE = {
  version: 1,
  rules: [{"market": "DE_AT", "motor": "PANASONIC", "requiresFixprice": false, "minQty": 10, "factor": 2.2, "active": true}, {"market": "DE_AT", "motor": "PANASONIC", "requiresFixprice": false, "minQty": 20, "factor": 2.3, "active": true}, {"market": "DE_AT", "motor": "PANASONIC", "requiresFixprice": false, "minQty": 40, "factor": 2.5, "active": true}, {"market": "DE_AT", "motor": "PANASONIC", "requiresFixprice": false, "minQty": 80, "factor": 3.0, "active": true}, {"market": "CH", "motor": "PANASONIC", "requiresFixprice": false, "minQty": 10, "factor": 2.2, "active": true}, {"market": "CH", "motor": "PANASONIC", "requiresFixprice": false, "minQty": 20, "factor": 2.3, "active": true}, {"market": "CH", "motor": "PANASONIC", "requiresFixprice": false, "minQty": 40, "factor": 2.5, "active": true}, {"market": "CH", "motor": "PANASONIC", "requiresFixprice": false, "minQty": 80, "factor": 3.0, "active": true}, {"market": "DE_AT", "motor": "BOSCH", "requiresFixprice": true, "minQty": 20, "factor": 2.0, "active": true}, {"market": "DE_AT", "motor": "BOSCH", "requiresFixprice": true, "minQty": 40, "factor": 2.3, "active": true}, {"market": "DE_AT", "motor": "BOSCH", "requiresFixprice": true, "minQty": 80, "factor": 2.5, "active": true}, {"market": "CH", "motor": "BOSCH", "requiresFixprice": true, "minQty": 20, "factor": 2.0, "active": true}, {"market": "CH", "motor": "BOSCH", "requiresFixprice": true, "minQty": 40, "factor": 2.3, "active": true}, {"market": "CH", "motor": "BOSCH", "requiresFixprice": true, "minQty": 80, "factor": 2.5, "active": true}]
};

function clampInt(v: any, fallback: number) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clampNum(v: any, fallback: number) {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export default function PricingThresholdsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [rules, setRules] = useState<Rule[]>([]);

  const [filterMarket, setFilterMarket] = useState<Market | "ALL">("ALL");
  const [filterMotor, setFilterMotor] = useState<Motor | "ALL">("ALL");
  const [filterFix, setFilterFix] = useState<"ALL" | "FIX" | "NONFIX">("ALL");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/settings?key=pricing_thresholds", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        const row: SettingRow | null = j?.setting ?? null;
        const v = row?.value ?? null;

        if (!alive) return;

        if (v && Array.isArray(v?.rules)) {
          // normalize
          const rr: Rule[] = v.rules.map((r: any) => ({
            market: (String(r.market ?? "DE_AT").toUpperCase() as Market),
            motor: (String(r.motor ?? "PANASONIC").toUpperCase() as Motor),
            requiresFixprice: !!r.requiresFixprice,
            minQty: clampInt(r.minQty, 10),
            factor: clampNum(r.factor, 2.2),
            active: r.active !== false,
          }));
          setRules(rr);
        } else {
          setRules([]);
        }
      } catch {
        if (alive) setRules([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return rules
      .filter((r) => (filterMarket === "ALL" ? true : r.market === filterMarket))
      .filter((r) => (filterMotor === "ALL" ? true : r.motor === filterMotor))
      .filter((r) => {
        if (filterFix === "ALL") return true;
        return filterFix === "FIX" ? r.requiresFixprice : !r.requiresFixprice;
      })
      .sort((a, b) => {
        if (a.market !== b.market) return a.market.localeCompare(b.market);
        if (a.motor !== b.motor) return a.motor.localeCompare(b.motor);
        if (a.requiresFixprice !== b.requiresFixprice) return a.requiresFixprice ? 1 : -1;
        return a.minQty - b.minQty;
      });
  }, [rules, filterMarket, filterMotor, filterFix]);

  function setRule(i: number, patch: Partial<Rule>) {
    setRules((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], ...patch };
      return copy;
    });
  }

  function addRule() {
    setRules((prev) => [
      ...prev,
      {
        market: "DE_AT",
        motor: "PANASONIC",
        requiresFixprice: false,
        minQty: 10,
        factor: 2.2,
        active: true,
      },
    ]);
  }

  function removeRule(i: number) {
    setRules((prev) => prev.filter((_, idx) => idx !== i));
  }

  function loadDefaults() {
    setRules(DEFAULT_VALUE.rules as any);
    setMsg("Default geladen (noch nicht gespeichert).");
  }

  function validateAll(): string | null {
    for (const r of rules) {
      if (!r.minQty || r.minQty < 1) return "minQty muss > 0 sein.";
      if (!r.factor || r.factor <= 0) return "factor muss > 0 sein.";
    }
    const seen = new Set<string>();
    for (const r of rules) {
      const k = `${r.market}|${r.motor}|${r.requiresFixprice ? 1 : 0}|${r.minQty}`;
      if (seen.has(k)) return `Doppelte Schwelle: ${k}`;
      seen.add(k);
    }
    return null;
  }

  async function save() {
    setMsg("");
    const err = validateAll();
    if (err) {
      setMsg(err);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        version: 1,
        rules,
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "pricing_thresholds", value: payload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Speichern fehlgeschlagen");
      setMsg("Gespeichert.");
    } catch (e: any) {
      setMsg(e?.message ?? "Fehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequireRole role="admin">
      <div className="mx-auto max-w-6xl p-4 md:p-8 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-2xl font-semibold">Schwellen · Preise</div>
            <div className="text-sm text-neutral-600">
              Admin/Superadmin kann hier Schwellen hinzufügen/ändern/löschen. Speicherung in <Badge>app_settings.pricing_thresholds</Badge>.
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadDefaults}>Default laden</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</Button>
          </div>
        </div>

        {msg ? (
          <Card>
            <CardContent className="py-3 text-sm">
              {msg}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Filter" />
          <CardContent className="flex flex-wrap gap-2 items-end">
            <div className="w-40">
              <div className="text-xs text-neutral-600 mb-1">Markt</div>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={filterMarket}
                onChange={(e) => setFilterMarket(e.target.value as any)}
              >
                <option value="ALL">Alle</option>
                <option value="DE_AT">DE/AT</option>
                <option value="CH">CH</option>
              </select>
            </div>

            <div className="w-44">
              <div className="text-xs text-neutral-600 mb-1">Motor</div>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={filterMotor}
                onChange={(e) => setFilterMotor(e.target.value as any)}
              >
                <option value="ALL">Alle</option>
                <option value="PANASONIC">Panasonic</option>
                <option value="BOSCH">Bosch</option>
              </select>
            </div>

            <div className="w-44">
              <div className="text-xs text-neutral-600 mb-1">Fixpreis</div>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={filterFix}
                onChange={(e) => setFilterFix(e.target.value as any)}
              >
                <option value="ALL">Alle</option>
                <option value="FIX">nur Fixpreis</option>
                <option value="NONFIX">nur Normalpreis</option>
              </select>
            </div>

            <div className="ml-auto">
              <Button variant="secondary" onClick={addRule}>+ Schwelle</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={`Regeln (${filtered.length})`} />
          <CardContent className="overflow-auto">
            {loading ? (
              <div className="text-sm text-neutral-600">Lade…</div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-neutral-600">
                Keine Regeln gefunden. Klicke „Default laden“ oder füge Schwellen hinzu.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="py-2 pr-2">Markt</th>
                    <th className="py-2 pr-2">Motor</th>
                    <th className="py-2 pr-2">Fixpreis?</th>
                    <th className="py-2 pr-2">ab Menge</th>
                    <th className="py-2 pr-2">Faktor</th>
                    <th className="py-2 pr-2">Aktiv</th>
                    <th className="py-2 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idxFiltered) => {
                    const index = rules.findIndex((x) =>
                      x.market === r.market &&
                      x.motor === r.motor &&
                      x.requiresFixprice === r.requiresFixprice &&
                      x.minQty === r.minQty &&
                      x.factor === r.factor &&
                      x.active === r.active
                    );

                    const i = index >= 0 ? index : idxFiltered;

                    return (
                      <tr key={`${i}-${r.market}-${r.motor}-${r.minQty}`} className="border-t">
                        <td className="py-2 pr-2">
                          <select
                            className="rounded-lg border px-2 py-1"
                            value={rules[i].market}
                            onChange={(e) => setRule(i, { market: e.target.value as any })}
                          >
                            <option value="DE_AT">DE/AT</option>
                            <option value="CH">CH</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            className="rounded-lg border px-2 py-1"
                            value={rules[i].motor}
                            onChange={(e) => setRule(i, { motor: e.target.value as any })}
                          >
                            <option value="PANASONIC">Panasonic</option>
                            <option value="BOSCH">Bosch</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            className="rounded-lg border px-2 py-1"
                            value={rules[i].requiresFixprice ? "1" : "0"}
                            onChange={(e) => setRule(i, { requiresFixprice: e.target.value === "1" })}
                          >
                            <option value="0">nein</option>
                            <option value="1">ja</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={String(rules[i].minQty)}
                            onChange={(e) => setRule(i, { minQty: clampInt(e.target.value, rules[i].minQty) })}
                            className="w-24"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={String(rules[i].factor)}
                            onChange={(e) => setRule(i, { factor: clampNum(e.target.value, rules[i].factor) })}
                            className="w-24"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={rules[i].active}
                            onChange={(e) => setRule(i, { active: e.target.checked })}
                          />
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <Button variant="secondary" onClick={() => removeRule(i)}>Löschen</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Hinweis" />
          <CardContent className="text-sm text-neutral-600 space-y-2">
            <div>
              Preislogik wird im Ordertool angewendet (VK / Faktor). Für DE/AT gilt zusätzlich die Sonderregel:
              wenn (VK/Faktor) teurer als EK, bleibt EK bestehen.
            </div>
            <div>
              Bosch-Schwellen pflegst du nur für <Badge>Fixpreis = ja</Badge> (requiresFixprice=true).
            </div>
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}
