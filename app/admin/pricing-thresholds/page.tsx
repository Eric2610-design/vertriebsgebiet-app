"use client";

import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/settings?key=pricing_thresholds");
        const json = await res.json();
        const loaded = json?.value?.rules ? (json.value as ThresholdSettings) : null;
        setRules(normalizeRules(loaded?.rules ?? []));
      } catch {
        setRules([]);
      } finally {
        setLoading(false);
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
            <button
              onClick={loadDefault}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
            >
              Default laden
            </button>
            <button
              onClick={addRule}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
            >
              + Schwelle
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Speichern
            </button>
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
      </div>
    </RequireRole>
  );
}
