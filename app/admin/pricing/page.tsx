"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import RequireRole from "@/components/RequireRole";
import { Badge, Button, Card, CardContent, CardHeader, Input, Select } from "@/components/ui";

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

type FixpriceSettingValue = {
  version: number;
  source?: {
    filename?: string;
    sheet?: string;
    imported_at?: string;
    rows?: number;
    unique_articles?: number;
  };
  byArticleNo?: Record<string, { motor?: string; isFixprice?: boolean }>;
};

type PricingAttributeAction = "FIXPREIS" | "SONDERPREIS" | "SCHWELLE";
type PricingAttributeRule = {
  id: string;
  market: "ALL" | Market;
  header: string;
  match: string;
  action: PricingAttributeAction;
  minQty?: number;
  factor?: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type PricingAttributeRuleSettings = {
  version: number;
  rules: PricingAttributeRule[];
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
  const cleaned = rules
    .map((r) => ({
      ...r,
      minQty: Number.isFinite(Number(r.minQty)) ? Math.max(1, Math.floor(Number(r.minQty))) : 1,
      factor: Number.isFinite(Number(r.factor)) ? Number(r.factor) : 1,
      active: !!r.active,
      requiresFixprice: !!r.requiresFixprice,
    }))
    .filter((r) => r.market && r.motor);

  cleaned.sort((a, b) => {
    if (a.market !== b.market) return a.market.localeCompare(b.market);
    if (a.motor !== b.motor) return a.motor.localeCompare(b.motor);
    if (a.requiresFixprice !== b.requiresFixprice) return Number(a.requiresFixprice) - Number(b.requiresFixprice);
    return a.minQty - b.minQty;
  });
  return cleaned;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const s = String(v).trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function newId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function PricingPage() {
  // --- Thresholds ---
  const defaultRules = useMemo(() => normalizeRules(DEFAULT_SETTINGS.rules), []);
  const [rules, setRules] = useState<ThresholdRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [filterMarket, setFilterMarket] = useState<Market | "ALL">("ALL");
  const [filterMotor, setFilterMotor] = useState<Motor | "ALL">("ALL");
  const [filterFix, setFilterFix] = useState<"ALL" | "FIX" | "NONFIX">("ALL");

  // --- Fixprice import ---
  const [fixSetting, setFixSetting] = useState<FixpriceSettingValue | null>(null);
  const [fixLoading, setFixLoading] = useState(true);
  const [fixUploading, setFixUploading] = useState(false);
  const [fixMsg, setFixMsg] = useState<string>("");
  const [fixFile, setFixFile] = useState<File | null>(null);

  // --- Attribute rules from stock snapshot ---
  const [attrHeaders, setAttrHeaders] = useState<string[]>([]);
  const [attrHeader, setAttrHeader] = useState<string>("");
  const [attrMarket, setAttrMarket] = useState<"ALL" | Market>("DE_AT");
  const [attrValues, setAttrValues] = useState<string[]>([]);
  const [attrValue, setAttrValue] = useState<string>("");
  const [attrAction, setAttrAction] = useState<PricingAttributeAction>("FIXPREIS");
  const [attrMinQty, setAttrMinQty] = useState<string>("10");
  const [attrFactor, setAttrFactor] = useState<string>("2.5");

  const [attrRules, setAttrRules] = useState<PricingAttributeRule[]>([]);
  const [attrLoading, setAttrLoading] = useState(true);
  const [attrSaving, setAttrSaving] = useState(false);
  const [attrMsg, setAttrMsg] = useState<string>("");
  const [attrBusy, setAttrBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setFixLoading(true);
      setAttrLoading(true);
      try {
        const [tRes, fRes, aRes, hRes] = await Promise.all([
          fetch("/api/settings?key=pricing_thresholds", { cache: "no-store" }),
          fetch("/api/settings?key=fixprice_articles", { cache: "no-store" }),
          fetch("/api/settings?key=pricing_attribute_rules_v1", { cache: "no-store" }),
          fetch("/api/admin/stock/attributes?mode=headers", { cache: "no-store" }),
        ]);

        const tJson = await tRes.json().catch(() => ({}));
        const fJson = await fRes.json().catch(() => ({}));
        const aJson = await aRes.json().catch(() => ({}));
        const hJson = await hRes.json().catch(() => ({}));

        const savedThresholds = (tJson?.setting?.value as any)?.rules ? (tJson.setting.value as ThresholdSettings) : null;
        const loadedRules = normalizeRules(savedThresholds?.rules ?? defaultRules);

        const fixVal = (fJson?.setting?.value ?? null) as FixpriceSettingValue | null;
        const attrVal = (aJson?.setting?.value ?? null) as PricingAttributeRuleSettings | null;

        const headers = Array.isArray(hJson?.headers) ? (hJson.headers as string[]) : [];
        const firstHeader = headers[0] ?? "";

        if (!alive) return;
        setRules(loadedRules);
        setFixSetting(fixVal);
        setAttrRules(Array.isArray(attrVal?.rules) ? attrVal!.rules : []);
        setAttrHeaders(headers);
        setAttrHeader(firstHeader);
      } catch {
        if (!alive) return;
        setRules(defaultRules);
        setFixSetting(null);
        setAttrRules([]);
        setAttrHeaders([]);
        setAttrHeader("");
      } finally {
        if (alive) {
          setLoading(false);
          setFixLoading(false);
          setAttrLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [defaultRules]);

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

  function resetToDefault() {
    setRules(defaultRules);
    setMsg("Default gesetzt (noch nicht gespeichert)." );
  }

  async function saveThresholds() {
    setSaving(true);
    setMsg("");
    try {
      const payload: ThresholdSettings = { version: 1, rules: normalizeRules(rules) };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "pricing_thresholds", value: payload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Speichern fehlgeschlagen");
      setMsg("✅ Schwellen gespeichert");
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? "Speichern fehlgeschlagen"}`);
    } finally {
      setSaving(false);
    }
  }

  // Fixprice stats
  const fixStats = useMemo(() => {
    const map = fixSetting?.byArticleNo ?? {};
    const keys = Object.keys(map);
    let fix = 0;
    for (const k of keys) {
      if (map[k]?.isFixprice) fix += 1;
    }
    return { total: keys.length, fix };
  }, [fixSetting]);

  async function importFixprices() {
    if (!fixFile) return;
    setFixUploading(true);
    setFixMsg("");
    try {
      const form = new FormData();
      form.append("file", fixFile);
      const res = await fetch("/api/fixprice/import", { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Import fehlgeschlagen");
      const next = (j?.setting?.value ?? null) as FixpriceSettingValue | null;
      setFixSetting(next);
      setFixMsg("✅ Fixpreise importiert");
      setFixFile(null);
    } catch (e: any) {
      setFixMsg(`❌ ${e?.message ?? "Import fehlgeschlagen"}`);
    } finally {
      setFixUploading(false);
    }
  }

  // Attribute rules: load values when header/market changes
  useEffect(() => {
    let alive = true;
    (async () => {
      setAttrBusy(true);
      setAttrValues([]);
      setAttrValue("");
      try {
        if (!attrHeader) {
          if (alive) setAttrValues([]);
          return;
        }
        const m = attrMarket === "ALL" ? "DE_AT" : attrMarket;
        const res = await fetch(
          `/api/admin/stock/attributes?mode=values&market=${encodeURIComponent(m)}&header=${encodeURIComponent(attrHeader)}`,
          { cache: "no-store" }
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error ?? "Werte konnten nicht geladen werden");
        if (!alive) return;
        const values = Array.isArray(j?.values) ? (j.values as string[]) : [];
        setAttrValues(values);
        setAttrValue(values[0] ?? "");
      } catch {
        if (!alive) return;
        setAttrValues([]);
        setAttrValue("");
      } finally {
        if (alive) setAttrBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [attrHeader, attrMarket]);

  function addAttributeRule() {
    if (!attrHeader || !attrValue) {
      setAttrMsg("Bitte zuerst Header und Wert auswählen.");
      return;
    }
    const now = new Date().toISOString();
    const base: PricingAttributeRule = {
      id: newId(),
      market: attrMarket,
      header: attrHeader,
      match: attrValue,
      action: attrAction,
      active: true,
      created_at: now,
      updated_at: now,
    };

    if (attrAction === "SCHWELLE") {
      base.minQty = Math.max(1, Math.floor(toNum(attrMinQty)));
      base.factor = Math.max(0.1, toNum(attrFactor) || 0);
    }

    setAttrRules((prev) => [base, ...prev]);
    setAttrMsg("Regel hinzugefügt (noch nicht gespeichert)." );
  }

  function updateAttrRule(id: string, patch: Partial<PricingAttributeRule>) {
    setAttrRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r)));
  }
  function removeAttrRule(id: string) {
    setAttrRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function saveAttributeRules() {
    setAttrSaving(true);
    setAttrMsg("");
    try {
      const payload: PricingAttributeRuleSettings = {
        version: 1,
        rules: attrRules.map((r) => ({
          ...r,
          minQty: r.action === "SCHWELLE" ? Math.max(1, Math.floor(toNum(r.minQty))) : undefined,
          factor: r.action === "SCHWELLE" ? Math.max(0.1, toNum(r.factor)) : undefined,
          active: !!r.active,
        })),
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "pricing_attribute_rules_v1", value: payload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Speichern fehlgeschlagen");
      setAttrMsg("✅ Attribut-Regeln gespeichert");
    } catch (e: any) {
      setAttrMsg(`❌ ${e?.message ?? "Speichern fehlgeschlagen"}`);
    } finally {
      setAttrSaving(false);
    }
  }

  const defaultGrouped = useMemo(() => {
    return defaultRules;
  }, [defaultRules]);

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <main className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Schwellen, Fixpreise & Sonderpreise</h1>
            <p className="text-slate-600 text-sm">
              Default-Schwellen sind immer sichtbar. Zusätzlich kannst du Fixpreise/Sonderpreise und attributbasierte Regeln pflegen.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/admin">
              <Button variant="secondary">Zurück</Button>
            </Link>
            <Link href="/admin/stock-import">
              <Button variant="secondary">Lager-Upload</Button>
            </Link>
          </div>
        </div>

        {/* Default thresholds (read-only) */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Default Schwellen (read-only)</div>
              <div className="text-sm text-slate-600">Aktueller Default, wie er ohne gespeicherte Einstellungen gilt.</div>
            </div>
            <Badge tone="blue">Default</Badge>
          </CardHeader>
          <CardContent>
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
                  </tr>
                </thead>
                <tbody>
                  {defaultGrouped.map((r, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2">{r.market === "DE_AT" ? "DE/AT" : "CH"}</td>
                      <td className="px-3 py-2">{r.motor === "BOSCH" ? "Bosch" : "Panasonic"}</td>
                      <td className="px-3 py-2">{r.requiresFixprice ? "Ja" : "Nein"}</td>
                      <td className="px-3 py-2">{r.minQty}</td>
                      <td className="px-3 py-2">{r.factor}</td>
                      <td className="px-3 py-2">{r.active ? "✓" : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Editable thresholds */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Schwellen & Preisregeln</div>
              <div className="text-sm text-slate-600">Diese Regeln überschreiben den Default, sobald du sie speicherst.</div>
            </div>
            <Badge>{loading ? "lädt…" : "bereit"}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" onClick={resetToDefault}>Default übernehmen</Button>
              <Button variant="secondary" onClick={addRule}>+ Schwelle</Button>
              <Button onClick={saveThresholds} disabled={saving}>{saving ? "Speichert…" : "Speichern"}</Button>
            </div>
            {msg ? <div className="rounded-xl border bg-neutral-50 p-3 text-sm">{msg}</div> : null}

            <div className="rounded-2xl border bg-white p-4 flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <div className="text-xs text-neutral-600">Markt</div>
                <select value={filterMarket} onChange={(e) => setFilterMarket(e.target.value as any)} className="rounded-lg border px-2 py-1 text-sm">
                  <option value="ALL">Alle</option>
                  <option value="DE_AT">DE/AT</option>
                  <option value="CH">CH</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-neutral-600">Motor</div>
                <select value={filterMotor} onChange={(e) => setFilterMotor(e.target.value as any)} className="rounded-lg border px-2 py-1 text-sm">
                  <option value="ALL">Alle</option>
                  <option value="PANASONIC">Panasonic</option>
                  <option value="BOSCH">Bosch</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-neutral-600">Fixpreis</div>
                <select value={filterFix} onChange={(e) => setFilterFix(e.target.value as any)} className="rounded-lg border px-2 py-1 text-sm">
                  <option value="ALL">Alle</option>
                  <option value="FIX">Nur Fixpreis</option>
                  <option value="NONFIX">Ohne Fixpreis</option>
                </select>
              </div>
              <div className="text-xs text-neutral-500">Gezeigt: <span className="font-semibold text-neutral-800">{filtered.length}</span></div>
            </div>

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
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">Keine Regeln (Filter prüfen oder Default übernehmen)</td>
                    </tr>
                  ) : null}

                  {filtered.map((r, idxInFiltered) => {
                    const idx = rules.findIndex((x) => x === r);
                    const safeIdx = idx >= 0 ? idx : idxInFiltered;
                    return (
                      <tr key={`${r.market}-${r.motor}-${r.requiresFixprice}-${r.minQty}-${idxInFiltered}`} className="border-t">
                        <td className="px-3 py-2">
                          <select value={r.market} onChange={(e) => updateRule(safeIdx, { market: e.target.value as Market })} className="rounded-lg border px-2 py-1">
                            <option value="DE_AT">DE/AT</option>
                            <option value="CH">CH</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select value={r.motor} onChange={(e) => updateRule(safeIdx, { motor: e.target.value as Motor })} className="rounded-lg border px-2 py-1">
                            <option value="PANASONIC">Panasonic</option>
                            <option value="BOSCH">Bosch</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select value={r.requiresFixprice ? "YES" : "NO"} onChange={(e) => updateRule(safeIdx, { requiresFixprice: e.target.value === "YES" })} className="rounded-lg border px-2 py-1">
                            <option value="NO">Nein</option>
                            <option value="YES">Ja</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={1} value={r.minQty} onChange={(e) => updateRule(safeIdx, { minQty: Number(e.target.value) })} className="w-28 rounded-lg border px-2 py-1" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.1" min={0.1} value={r.factor} onChange={(e) => updateRule(safeIdx, { factor: Number(e.target.value) })} className="w-28 rounded-lg border px-2 py-1" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={r.active} onChange={(e) => updateRule(safeIdx, { active: e.target.checked })} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => removeRule(safeIdx)} className="text-red-600 hover:underline">Löschen</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-slate-500">Hinweis: Faktor bezieht sich auf VK (Preis = VK / Faktor).</div>
          </CardContent>
        </Card>

        {/* Fixprice import */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Fixpreis-Artikel (Import)</div>
              <div className="text-sm text-slate-600">Import aus „Regeln und Schwellen.xlsx“ über /api/fixprice/import.</div>
            </div>
            <Badge>{fixLoading ? "lädt…" : `${fixStats.fix}/${fixStats.total}`}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Datei (xlsx)</label>
                <Input type="file" accept=".xlsx,.xls" onChange={(e) => setFixFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={importFixprices} disabled={!fixFile || fixUploading}>{fixUploading ? "Importiert…" : "Import starten"}</Button>
              </div>
            </div>
            {fixMsg ? <div className="rounded-xl border bg-neutral-50 p-3 text-sm">{fixMsg}</div> : null}

            <div className="rounded-xl border bg-white p-3 text-sm">
              {fixSetting?.source ? (
                <div className="space-y-1">
                  <div><span className="text-slate-500">Quelle:</span> <span className="font-medium">{fixSetting.source.filename ?? "(unbekannt)"}</span> (Sheet: {fixSetting.source.sheet ?? "?"})</div>
                  <div><span className="text-slate-500">Import:</span> {fixSetting.source.imported_at ? new Date(fixSetting.source.imported_at).toLocaleString("de-DE") : "?"}</div>
                  <div><span className="text-slate-500">Artikel:</span> {fixStats.total.toLocaleString("de-DE")} (davon Fixpreis/Sonderpreis markiert: {fixStats.fix.toLocaleString("de-DE")})</div>
                </div>
              ) : (
                <div className="text-slate-600">Noch kein Fixpreis-Import vorhanden.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Attribute rules */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Zusatzregeln per Lager-Header</div>
              <div className="text-sm text-slate-600">
                Wähle einen Header aus dem aktuellen Lagerbestand-Snapshot, dann einen Wert – und lege Fixpreis/Sonderpreis oder eine Schwelle fest.
              </div>
            </div>
            <Badge>{attrLoading ? "lädt…" : "bereit"}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Header</label>
                <Select value={attrHeader} onChange={(e) => setAttrHeader(e.target.value)} disabled={!attrHeaders.length}>
                  {attrHeaders.length ? (
                    attrHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))
                  ) : (
                    <option value="">Keine Header (erst Lager-Upload?)</option>
                  )}
                </Select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Markt</label>
                <Select value={attrMarket} onChange={(e) => setAttrMarket(e.target.value as any)}>
                  <option value="DE_AT">DE/AT</option>
                  <option value="CH">CH</option>
                  <option value="ALL">Alle</option>
                </Select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Attribut / Wert</label>
                <Select value={attrValue} onChange={(e) => setAttrValue(e.target.value)} disabled={!attrHeader || attrBusy}>
                  {attrBusy ? <option value="">lädt…</option> : <option value="">Wert wählen…</option>}
                  {attrValues.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Aktion</label>
                <Select value={attrAction} onChange={(e) => setAttrAction(e.target.value as PricingAttributeAction)}>
                  <option value="FIXPREIS">Fixpreis</option>
                  <option value="SONDERPREIS">Sonderpreis</option>
                  <option value="SCHWELLE">Schwelle</option>
                </Select>
              </div>
            </div>

            {attrAction === "SCHWELLE" ? (
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <div>
                  <label className="text-xs text-slate-500">Mindestmenge</label>
                  <Input value={attrMinQty} onChange={(e) => setAttrMinQty(e.target.value)} type="number" min={1} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Faktor</label>
                  <Input value={attrFactor} onChange={(e) => setAttrFactor(e.target.value)} type="number" step="0.1" min={0.1} />
                </div>
                <div className="md:col-span-4 flex gap-2">
                  <Button variant="secondary" onClick={addAttributeRule}>+ Regel hinzufügen</Button>
                  <Button onClick={saveAttributeRules} disabled={attrSaving}>{attrSaving ? "Speichert…" : "Speichern"}</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" onClick={addAttributeRule}>+ Regel hinzufügen</Button>
                <Button onClick={saveAttributeRules} disabled={attrSaving}>{attrSaving ? "Speichert…" : "Speichern"}</Button>
              </div>
            )}

            {attrMsg ? <div className="rounded-xl border bg-neutral-50 p-3 text-sm">{attrMsg}</div> : null}

            <div className="rounded-2xl border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Aktiv</th>
                    <th className="px-3 py-2 text-left">Markt</th>
                    <th className="px-3 py-2 text-left">Header</th>
                    <th className="px-3 py-2 text-left">Wert</th>
                    <th className="px-3 py-2 text-left">Aktion</th>
                    <th className="px-3 py-2 text-left">Menge</th>
                    <th className="px-3 py-2 text-left">Faktor</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {attrRules.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">Noch keine Zusatzregeln vorhanden.</td>
                    </tr>
                  ) : null}
                  {attrRules.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={!!r.active} onChange={(e) => updateAttrRule(r.id, { active: e.target.checked })} />
                      </td>
                      <td className="px-3 py-2">{r.market}</td>
                      <td className="px-3 py-2">{r.header}</td>
                      <td className="px-3 py-2">{r.match}</td>
                      <td className="px-3 py-2">{r.action}</td>
                      <td className="px-3 py-2">{r.action === "SCHWELLE" ? (r.minQty ?? "–") : "–"}</td>
                      <td className="px-3 py-2">{r.action === "SCHWELLE" ? (r.factor ?? "–") : "–"}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeAttrRule(r.id)} className="text-red-600 hover:underline">Entfernen</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </RequireRole>
  );
}
