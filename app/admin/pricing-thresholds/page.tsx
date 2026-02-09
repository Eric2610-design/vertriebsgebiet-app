"use client";

import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";
import { Button, Card, CardContent, CardHeader, Input, Select } from "@/components/ui";

type Market = "DE_AT" | "CH";
type Motor = "PANASONIC" | "BOSCH";

type ThresholdRule = {
  market: Market;
  motor: Motor;
  requiresFixprice: boolean;
  minQty: number;
  factor: number;
  active: boolean;
};

type ThresholdSettings = {
  version: number;
  rules: ThresholdRule[];
};

type AttributeRule = {
  attribute: string;
  match: string;
  minQty: number;
  factor: number;
  active: boolean;
};

type AttributeRuleSettings = {
  version: number;
  rules: AttributeRule[];
};

const DEFAULT_SETTINGS: ThresholdSettings = {
  version: 1,
  rules: [
    // Panasonic DE/AT
    { market: "DE_AT", motor: "PANASONIC", requiresFixprice: false, minQty: 10, factor: 2.2, active: true },
    { market: "DE_AT", motor: "PANASONIC", requiresFixprice: false, minQty: 20, factor: 2.3, active: true },
    { market: "DE_AT", motor: "PANASONIC", requiresFixprice: false, minQty: 40, factor: 2.5, active: true },
    { market: "DE_AT", motor: "PANASONIC", requiresFixprice: false, minQty: 80, factor: 3.0, active: true },

    // Panasonic CH
    { market: "CH", motor: "PANASONIC", requiresFixprice: false, minQty: 10, factor: 2.2, active: true },
    { market: "CH", motor: "PANASONIC", requiresFixprice: false, minQty: 20, factor: 2.3, active: true },
    { market: "CH", motor: "PANASONIC", requiresFixprice: false, minQty: 40, factor: 2.5, active: true },
    { market: "CH", motor: "PANASONIC", requiresFixprice: false, minQty: 80, factor: 3.0, active: true },

    // Bosch Fixpreis DE/AT
    { market: "DE_AT", motor: "BOSCH", requiresFixprice: true, minQty: 20, factor: 2.0, active: true },
    { market: "DE_AT", motor: "BOSCH", requiresFixprice: true, minQty: 40, factor: 2.3, active: true },
    { market: "DE_AT", motor: "BOSCH", requiresFixprice: true, minQty: 80, factor: 2.5, active: true },

    // Bosch Fixpreis CH
    { market: "CH", motor: "BOSCH", requiresFixprice: true, minQty: 20, factor: 2.0, active: true },
    { market: "CH", motor: "BOSCH", requiresFixprice: true, minQty: 40, factor: 2.3, active: true },
    { market: "CH", motor: "BOSCH", requiresFixprice: true, minQty: 80, factor: 2.5, active: true },
  ],
};

function normalizeRules(rules: ThresholdRule[]): ThresholdRule[] {
  // remove obvious invalid rows + normalize numbers
  const cleaned = rules
    .map((r) => ({
      ...r,
      minQty: Number.isFinite(Number(r.minQty)) ? Math.max(1, Math.floor(Number(r.minQty))) : 1,
      factor: Number.isFinite(Number(r.factor)) ? Number(r.factor) : 1,
      active: !!r.active,
      requiresFixprice: !!r.requiresFixprice,
    }))
    .filter((r) => r.market && r.motor);

  // sort by market, motor, requiresFixprice, minQty asc
  cleaned.sort((a, b) => {
    if (a.market !== b.market) return a.market.localeCompare(b.market);
    if (a.motor !== b.motor) return a.motor.localeCompare(b.motor);
    if (a.requiresFixprice !== b.requiresFixprice) return Number(a.requiresFixprice) - Number(b.requiresFixprice);
    return a.minQty - b.minQty;
  });

  return cleaned;
}

export default function PricingThresholdsPage() {
  const [rules, setRules] = useState<ThresholdRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [filterMarket, setFilterMarket] = useState<Market | "ALL">("ALL");
  const [filterMotor, setFilterMotor] = useState<Motor | "ALL">("ALL");
  const [filterFix, setFilterFix] = useState<"ALL" | "FIX" | "NONFIX">("ALL");

  const [attributes, setAttributes] = useState<Record<string, string[]>>({});
  const [attributeRules, setAttributeRules] = useState<AttributeRule[]>([]);
  const [rulesMsg, setRulesMsg] = useState<string>("");
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setRulesLoading(true);
      try {
        const [res, rulesRes] = await Promise.all([
          fetch("/api/settings?key=pricing_thresholds"),
          fetch("/api/ordertool/data", { cache: "no-store" }),
        ]);
        const json = await res.json();
        const rulesJson = await rulesRes.json().catch(() => ({}));
        const loaded = json?.value?.rules ? (json.value as ThresholdSettings) : null;
        setRules(normalizeRules(loaded?.rules ?? []));
        setAttributes(rulesJson?.attributes ?? {});
        setAttributeRules(rulesJson?.rules ?? []);
      } catch {
        setRules([]);
        setAttributes({});
        setAttributeRules([]);
      } finally {
        setLoading(false);
        setRulesLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (filterMarket !== "ALL" && r.market !== filterMarket) return false;
      if (filterMotor !== "ALL" && r.motor !== filterMotor) return false;
      if (filterFix === "FIX" && !r.requiresFixprice) return false;
      if (filterFix === "NONFIX" && r.requiresFixprice) return false;
      return true;
    });
  }, [rules, filterMarket, filterMotor, filterFix]);

  function updateRule(idx: number, patch: Partial<ThresholdRule>) {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRule(idx: number) {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  }

  function addRule() {
    setRules((prev) => [
      ...prev,
      { market: "DE_AT", motor: "PANASONIC", requiresFixprice: false, minQty: 10, factor: 2.2, active: true },
    ]);
  }

  const attributeKeys = useMemo(() => {
    return Object.keys(attributes).filter((key) => (attributes[key] ?? []).length > 0);
  }, [attributes]);

  function updateAttributeRule(idx: number, patch: Partial<AttributeRule>) {
    setAttributeRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeAttributeRule(idx: number) {
    setAttributeRules((prev) => prev.filter((_, i) => i !== idx));
  }

  function addAttributeRule() {
    const nextAttribute = attributeKeys[0] ?? "motor";
    const nextMatch = attributes[nextAttribute]?.[0] ?? "";
    setAttributeRules((prev) => [
      ...prev,
      { attribute: nextAttribute, match: nextMatch, minQty: 10, factor: 2.5, active: true },
    ]);
  }

  function loadDefault() {
    setRules(normalizeRules(DEFAULT_SETTINGS.rules));
    setMsg("Default geladen (noch nicht gespeichert).");
  }

  async function save() {
    setSaving(true);
    setMsg(null);

    const payload: ThresholdSettings = {
      version: 1,
      rules: normalizeRules(rules),
    };

    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "pricing_thresholds",
        value: payload,
      }),
    });

    if (!res.ok) setMsg("❌ Fehler beim Speichern");
    else setMsg("✅ Gespeichert");

    setSaving(false);
  }

  async function saveAttributeRules() {
    setRulesMsg("");
    setRulesSaving(true);
    try {
      const payload: AttributeRuleSettings = {
        version: 1,
        rules: attributeRules.map((r) => ({
          ...r,
          minQty: Number.isFinite(Number(r.minQty)) ? Math.max(1, Math.floor(Number(r.minQty))) : 1,
          factor: Number.isFinite(Number(r.factor)) ? Number(r.factor) : 1,
          active: !!r.active,
        })),
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "ordertool_attribute_rules_v1", value: payload }),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen.");
      setRulesMsg("Gespeichert.");
    } catch (e: any) {
      setRulesMsg(e?.message ?? "Speichern fehlgeschlagen.");
    } finally {
      setRulesSaving(false);
    }
  }

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="mx-auto max-w-6xl p-4 md:p-8 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Schwellen · Preise</h1>
            <p className="text-sm text-neutral-600">
              Schwellenregeln pro Markt und Motor. Faktoren beziehen sich auf VK (Preis = VK / Faktor).
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={loadDefault}>
              Default laden
            </Button>
            <Button variant="secondary" onClick={addRule}>
              + Schwelle
            </Button>
            <Button onClick={save} disabled={saving}>
              Speichern
            </Button>
          </div>
        </div>

        {msg && <div className="rounded-xl border bg-neutral-50 p-3 text-sm">{msg}</div>}

        <div className="rounded-2xl border bg-white p-4 flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <div className="text-xs text-neutral-600">Markt</div>
            <select
              value={filterMarket}
              onChange={(e) => setFilterMarket(e.target.value as any)}
              className="rounded-lg border px-2 py-1 text-sm"
            >
              <option value="ALL">Alle</option>
              <option value="DE_AT">DE/AT</option>
              <option value="CH">CH</option>
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-neutral-600">Motor</div>
            <select
              value={filterMotor}
              onChange={(e) => setFilterMotor(e.target.value as any)}
              className="rounded-lg border px-2 py-1 text-sm"
            >
              <option value="ALL">Alle</option>
              <option value="PANASONIC">Panasonic</option>
              <option value="BOSCH">Bosch</option>
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-neutral-600">Fixpreis</div>
            <select
              value={filterFix}
              onChange={(e) => setFilterFix(e.target.value as any)}
              className="rounded-lg border px-2 py-1 text-sm"
            >
              <option value="ALL">Alle</option>
              <option value="FIX">Nur Fixpreis</option>
              <option value="NONFIX">Ohne Fixpreis</option>
            </select>
          </div>

          <div className="text-xs text-neutral-500">
            Gezeigt: <span className="font-semibold text-neutral-800">{filtered.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-neutral-600">Lade …</div>
        ) : (
          <div className="rounded-2xl border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-3 py-2 text-left">Markt</th>
                  <th className="px-3 py-2 text-left">Motor</th>
                  <th className="px-3 py-2 text-left">Fixpreis?</th>
                  <th className="px-3 py-2 text-left">ab Menge</th>
                  <th className="px-3 py-2 text-left">Faktor</th>
                  <th className="px-3 py-2 text-left">Aktiv</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                      Keine Regeln (Filter prüfen oder Default laden)
                    </td>
                  </tr>
                )}

                {filtered.map((r, idxInFiltered) => {
                  // idx im Originalarray finden (weil filtered andere Reihenfolge/Subset)
                  const idx = rules.findIndex(
                    (x) =>
                      x.market === r.market &&
                      x.motor === r.motor &&
                      x.requiresFixprice === r.requiresFixprice &&
                      x.minQty === r.minQty &&
                      x.factor === r.factor &&
                      x.active === r.active
                  );

                  // Fallback wenn findIndex -1 (z.B. duplicate display)
                  const safeIdx = idx >= 0 ? idx : idxInFiltered;

                  return (
                    <tr key={`${r.market}-${r.motor}-${r.requiresFixprice}-${r.minQty}-${idxInFiltered}`} className="border-t">
                      <td className="px-3 py-2">
                        <select
                          value={r.market}
                          onChange={(e) => updateRule(safeIdx, { market: e.target.value as Market })}
                          className="rounded-lg border px-2 py-1"
                        >
                          <option value="DE_AT">DE/AT</option>
                          <option value="CH">CH</option>
                        </select>
                      </td>

                      <td className="px-3 py-2">
                        <select
                          value={r.motor}
                          onChange={(e) => updateRule(safeIdx, { motor: e.target.value as Motor })}
                          className="rounded-lg border px-2 py-1"
                        >
                          <option value="PANASONIC">Panasonic</option>
                          <option value="BOSCH">Bosch</option>
                        </select>
                      </td>

                      <td className="px-3 py-2">
                        <select
                          value={r.requiresFixprice ? "YES" : "NO"}
                          onChange={(e) => updateRule(safeIdx, { requiresFixprice: e.target.value === "YES" })}
                          className="rounded-lg border px-2 py-1"
                        >
                          <option value="NO">Nein</option>
                          <option value="YES">Ja</option>
                        </select>
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={r.minQty}
                          onChange={(e) => updateRule(safeIdx, { minQty: Number(e.target.value) })}
                          className="w-28 rounded-lg border px-2 py-1"
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.1"
                          min={0.1}
                          value={r.factor}
                          onChange={(e) => updateRule(safeIdx, { factor: Number(e.target.value) })}
                          className="w-28 rounded-lg border px-2 py-1"
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={r.active}
                          onChange={(e) => updateRule(safeIdx, { active: e.target.checked })}
                        />
                      </td>

                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeRule(safeIdx)}
                          className="text-red-600 hover:underline"
                        >
                          Löschen
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Ordertool: Attribut-Regeln</div>
              <div className="text-sm text-slate-600">
                Attribute und Werte stammen aus dem aktuellen Lagerbestandssnapshot.
              </div>
            </div>
            <span className="text-xs text-slate-500">{rulesLoading ? "lädt…" : "bereit"}</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={addAttributeRule}>
                + Regel
              </Button>
              <Button onClick={saveAttributeRules} disabled={rulesSaving}>
                {rulesSaving ? "Speichert…" : "Speichern"}
              </Button>
            </div>

            <div className="space-y-2">
              {attributeRules.length ? (
                attributeRules.map((rule, idx) => {
                  const values = attributes[rule.attribute] ?? [];
                  return (
                    <div key={`${rule.attribute}-${idx}`} className="rounded-xl border p-3 space-y-2">
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="min-w-[160px]">
                          <label className="text-xs text-slate-500">Attribut</label>
                          <Select
                            value={rule.attribute}
                            onChange={(e) =>
                              updateAttributeRule(idx, {
                                attribute: e.target.value,
                                match: attributes[e.target.value]?.[0] ?? "",
                              })
                            }
                          >
                            {attributeKeys.length ? (
                              attributeKeys.map((attr) => (
                                <option key={attr} value={attr}>
                                  {attr}
                                </option>
                              ))
                            ) : (
                              <option value="">Keine Attribute</option>
                            )}
                          </Select>
                        </div>

                        <div className="min-w-[200px]">
                          <label className="text-xs text-slate-500">Wert</label>
                          <Select
                            value={rule.match}
                            onChange={(e) => updateAttributeRule(idx, { match: e.target.value })}
                            disabled={!values.length}
                          >
                            <option value="">Wert wählen…</option>
                            {values.map((val) => (
                              <option key={val} value={val}>
                                {val}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <div className="w-32">
                          <label className="text-xs text-slate-500">Mindestmenge</label>
                          <Input
                            type="number"
                            min={1}
                            value={rule.minQty}
                            onChange={(e) => updateAttributeRule(idx, { minQty: Number(e.target.value) })}
                          />
                        </div>

                        <div className="w-32">
                          <label className="text-xs text-slate-500">Kalkulation</label>
                          <Input
                            type="number"
                            step="0.1"
                            min={0}
                            value={rule.factor}
                            onChange={(e) => updateAttributeRule(idx, { factor: Number(e.target.value) })}
                          />
                        </div>

                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={rule.active}
                            onChange={(e) => updateAttributeRule(idx, { active: e.target.checked })}
                          />
                          aktiv
                        </label>

                        <Button variant="secondary" onClick={() => removeAttributeRule(idx)}>
                          Entfernen
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-slate-600">Noch keine Regeln vorhanden.</div>
              )}
            </div>

            {rulesMsg ? <div className="text-sm text-slate-700">{rulesMsg}</div> : null}
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}
