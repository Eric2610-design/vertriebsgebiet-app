"use client";

import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";

type RuleThreshold = {
  minQty: number;
  kalkulation: number;
};

type OrdertoolRule = {
  attribute: string;
  value: string;
  label?: string;
  thresholds: RuleThreshold[];
};

type OrdertoolRulesSettings = {
  version: number;
  rules: OrdertoolRule[];
};

type AttributeValues = Record<string, string[]>;

const DEFAULT_ATTRIBUTES = ["motor", "status", "battery_tags", "preisart"];

export default function OrdertoolRulesPage() {
  const [rules, setRules] = useState<OrdertoolRule[]>([]);
  const [version, setVersion] = useState(1);
  const [attributeValues, setAttributeValues] = useState<AttributeValues>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const attributes = useMemo(() => {
    const keys = Object.keys(attributeValues || {});
    if (keys.length) return keys;
    return DEFAULT_ATTRIBUTES;
  }, [attributeValues]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [rulesRes, dataRes] = await Promise.all([
          fetch("/api/settings?key=ordertool_rules"),
          fetch("/api/ordertool/data?market=DE"),
        ]);

        const rulesJson = await rulesRes.json();
        const rulesValue = rulesJson?.setting?.value;

        if (rulesValue?.rules) {
          setRules(rulesValue.rules);
          setVersion(Number(rulesValue.version) || 1);
        } else {
          setRules([]);
          setVersion(1);
        }

        if (dataRes.ok) {
          const dataJson = await dataRes.json();
          if (dataJson?.attributeValues) {
            setAttributeValues(dataJson.attributeValues);
          }
        }
      } catch {
        setRules([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function addRule() {
    const defaultAttribute = attributes[0] || "motor";
    setRules([
      ...rules,
      { attribute: defaultAttribute, value: "", label: "", thresholds: [] },
    ]);
  }

  function updateRule(idx: number, patch: Partial<OrdertoolRule>) {
    setRules(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRule(idx: number) {
    setRules(rules.filter((_, i) => i !== idx));
  }

  function addThreshold(idx: number) {
    setRules(
      rules.map((r, i) =>
        i === idx
          ? {
              ...r,
              thresholds: [
                ...(r.thresholds || []),
                { minQty: 0, kalkulation: 0 },
              ],
            }
          : r,
      ),
    );
  }

  function updateThreshold(
    ruleIdx: number,
    thresholdIdx: number,
    patch: Partial<RuleThreshold>,
  ) {
    setRules(
      rules.map((r, i) => {
        if (i !== ruleIdx) return r;
        const thresholds = (r.thresholds || []).map((t, j) =>
          j === thresholdIdx ? { ...t, ...patch } : t,
        );
        return { ...r, thresholds };
      }),
    );
  }

  function removeThreshold(ruleIdx: number, thresholdIdx: number) {
    setRules(
      rules.map((r, i) => {
        if (i !== ruleIdx) return r;
        const thresholds = (r.thresholds || []).filter((_, j) => j !== thresholdIdx);
        return { ...r, thresholds };
      }),
    );
  }

  async function save() {
    setSaving(true);
    setMsg(null);

    const payload: OrdertoolRulesSettings = {
      version: version + 1,
      rules,
    };

    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "ordertool_rules",
        value: payload,
      }),
    });

    if (!res.ok) {
      setMsg("❌ Fehler beim Speichern");
    } else {
      setMsg("✅ Gespeichert");
      setVersion(payload.version);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <RequireRole allow={["admin", "superadmin"]}>
        <div className="mx-auto max-w-5xl p-4 md:p-8 text-sm text-neutral-600">
          Lade …
        </div>
      </RequireRole>
    );
  }

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="mx-auto max-w-5xl p-4 md:p-8 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Ordertool · Regeln</h1>
            <p className="text-sm text-neutral-600">
              Definiere Regeln wie: Wenn Attribut X = Y, dann gelten Schwellen/Kalkulationen Z.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addRule}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
            >
              + Regel
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

        {msg && (
          <div className="rounded-xl border bg-neutral-50 p-3 text-sm">{msg}</div>
        )}

        <div className="space-y-4">
          {rules.length === 0 && (
            <div className="rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-500">
              Keine Regeln hinterlegt.
            </div>
          )}

          {rules.map((rule, idx) => {
            const values = attributeValues[rule.attribute] || [];
            const listId = `rule-values-${idx}`;
            return (
              <div key={idx} className="rounded-2xl border bg-white p-4 space-y-3">
                <div className="flex flex-wrap gap-3 items-center">
                  <select
                    value={rule.attribute}
                    onChange={(e) =>
                      updateRule(idx, { attribute: e.target.value, value: "" })
                    }
                    className="rounded-lg border px-2 py-1 text-sm"
                  >
                    {attributes.map((attr) => (
                      <option key={attr} value={attr}>
                        {attr}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-col">
                    <input
                      list={listId}
                      value={rule.value}
                      onChange={(e) => updateRule(idx, { value: e.target.value })}
                      placeholder="Wert"
                      className="rounded-lg border px-2 py-1 text-sm min-w-[220px]"
                    />
                    {values.length > 0 && (
                      <datalist id={listId}>
                        {values.map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                    )}
                  </div>
                  <input
                    value={rule.label || ""}
                    onChange={(e) => updateRule(idx, { label: e.target.value })}
                    placeholder="Label (optional)"
                    className="rounded-lg border px-2 py-1 text-sm min-w-[220px]"
                  />
                  <button
                    onClick={() => removeRule(idx)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Entfernen
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-neutral-500">
                    Schwellen (höchste Mindestmenge ≤ bestellte Menge gilt)
                  </div>
                  {rule.thresholds?.length ? (
                    <div className="space-y-2">
                      {rule.thresholds.map((threshold, tIdx) => (
                        <div key={tIdx} className="flex flex-wrap gap-2 items-center">
                          <input
                            type="number"
                            min={0}
                            value={threshold.minQty}
                            onChange={(e) =>
                              updateThreshold(idx, tIdx, {
                                minQty: Number(e.target.value || 0),
                              })
                            }
                            className="rounded-lg border px-2 py-1 text-sm w-32"
                            placeholder="Mindestmenge"
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={threshold.kalkulation}
                            onChange={(e) =>
                              updateThreshold(idx, tIdx, {
                                kalkulation: Number(e.target.value || 0),
                              })
                            }
                            className="rounded-lg border px-2 py-1 text-sm w-32"
                            placeholder="Kalkulation"
                          />
                          <button
                            onClick={() => removeThreshold(idx, tIdx)}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Entfernen
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-400">Keine Schwellen</div>
                  )}
                  <button
                    onClick={() => addThreshold(idx)}
                    className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
                  >
                    + Schwelle
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </RequireRole>
  );
}
