"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { Button, Card, CardContent, CardHeader, Input } from "@/components/ui";
import RequireRole from "@/components/RequireRole";

type PreviewRow = Record<string, any>;
type StockItem = {
  sku: string;
  series: string | null;
  model: string | null;
  color: string | null;
  frame_size: string | null;
  frame_type: string | null;
  battery: string | null;
  motor_type: string | null;
  motor_brand: string | null;
  avail_now: number | null;
  avail_total: number | null;
  raw?: Record<string, any> | null;
};

type StockSummaryFilter = {
  motor_brand: string;
  series: string;
  motor_type: string;
  frame_type: string;
  color: string;
  frame_size: string;
};

const SUMMARY_GROUP_FIELDS = [
  { key: "frame_size", label: "Rahmenhöhe" },
  { key: "frame_type", label: "Rahmenform" },
  { key: "motor_brand", label: "Motorhersteller" },
  { key: "series", label: "Modellfamilie" },
  { key: "motor_type", label: "Motortyp" },
  { key: "color", label: "Farbe" },
  { key: "battery", label: "Akku" },
] as const;

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const stockNow = (item: StockItem): number => Math.max(0, toNumber(item.avail_now));

const buildSuggestion = (item: StockItem): number => {
  const rawValue = item.raw?.["Menge Produktions-vorschlag"];
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    const total = toNumber(item.avail_total);
    const now = toNumber(item.avail_now);
    return Math.max(total - now, 0);
  }
  return Math.max(0, toNumber(rawValue));
};

export default function StockImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [summaryItems, setSummaryItems] = useState<StockItem[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryMarket, setSummaryMarket] = useState<"DE_AT" | "CH">("DE_AT");
  const [summaryFilter, setSummaryFilter] = useState<StockSummaryFilter>({
    motor_brand: "",
    series: "",
    motor_type: "",
    frame_type: "",
    color: "",
    frame_size: "",
  });
  const [summaryGroupBy, setSummaryGroupBy] = useState<(typeof SUMMARY_GROUP_FIELDS)[number]["key"]>(
    "frame_size"
  );
  const showSchemaHint = err?.includes("Schema-Cache") || err?.includes("stock_runs") || err?.includes("stock_items");

  const preview = useMemo(() => rows.slice(0, 8), [rows]);
  const summaryFilters = useMemo(() => {
    const makeOptions = (key: keyof StockItem) => {
      const values = summaryItems
        .map((item) => String(item[key] ?? "").trim())
        .filter((val) => val.length > 0);
      return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
    };

    return {
      motor_brand: makeOptions("motor_brand"),
      series: makeOptions("series"),
      motor_type: makeOptions("motor_type"),
      frame_type: makeOptions("frame_type"),
      color: makeOptions("color"),
      frame_size: makeOptions("frame_size"),
    };
  }, [summaryItems]);

  const filteredSummaryItems = useMemo(() => {
    return summaryItems.filter((item) => {
      if (summaryFilter.motor_brand && item.motor_brand !== summaryFilter.motor_brand) return false;
      if (summaryFilter.series && item.series !== summaryFilter.series) return false;
      if (summaryFilter.motor_type && item.motor_type !== summaryFilter.motor_type) return false;
      if (summaryFilter.frame_type && item.frame_type !== summaryFilter.frame_type) return false;
      if (summaryFilter.color && item.color !== summaryFilter.color) return false;
      if (summaryFilter.frame_size && item.frame_size !== summaryFilter.frame_size) return false;
      return true;
    });
  }, [summaryItems, summaryFilter]);

  const summaryTotals = useMemo(() => {
    const sum = (items: StockItem[]) =>
      items.reduce(
        (acc, item) => {
          const now = stockNow(item);
          const build = buildSuggestion(item);
          acc.lagernd += now;
          acc.zuBauen += build;
          return acc;
        },
        { lagernd: 0, zuBauen: 0 }
      );

    const all = sum(filteredSummaryItems);
    const bosch = sum(filteredSummaryItems.filter((item) => /bosch/i.test(item.motor_brand ?? "")));
    const pana = sum(filteredSummaryItems.filter((item) => /panasonic/i.test(item.motor_brand ?? "")));
    return { all, bosch, pana };
  }, [filteredSummaryItems]);

  const summaryBreakdown = useMemo(() => {
    const map = new Map<string, { lagernd: number; zuBauen: number; skus: number }>();
    for (const item of filteredSummaryItems) {
      const key = String(item[summaryGroupBy as keyof StockItem] ?? "").trim() || "(leer)";
      const now = stockNow(item);
      const build = buildSuggestion(item);
      const entry = map.get(key) ?? { lagernd: 0, zuBauen: 0, skus: 0 };
      entry.lagernd += now;
      entry.zuBauen += build;
      entry.skus += 1;
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .map(([label, data]) => ({ label, ...data }))
      .sort((a, b) => b.lagernd - a.lagernd);
  }, [filteredSummaryItems, summaryGroupBy]);

  const summaryMeta = useMemo(() => {
    const total = summaryItems.length;
    const relevant = summaryItems.filter((item) => (Number(item.avail_now ?? 0) || 0) > 0).length;
    return { total, relevant };
  }, [summaryItems]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const res = await fetch(`/api/stock/latest?market=${summaryMarket}&limit=5000`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Daten konnten nicht geladen werden.");
        if (alive) setSummaryItems((json?.items ?? []) as StockItem[]);
      } catch (e: any) {
        if (alive) setSummaryError(e?.message ?? "Daten konnten nicht geladen werden.");
      } finally {
        if (alive) setSummaryLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [summaryMarket]);

  async function handleFile(nextFile: File | null) {
    setFile(nextFile);
    setMsg(null);
    setErr(null);
    setRows([]);
    setHeaders([]);
    if (!nextFile) return;

    try {
      const buf = await nextFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const name = wb.SheetNames?.[0];
      if (!name) throw new Error("Keine Tabelle gefunden");
      const ws = wb.Sheets[name];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as PreviewRow[];
      const h = json.length ? Object.keys(json[0] as any) : [];
      setRows(json);
      setHeaders(h);
    } catch (e: any) {
      setErr(e?.message || "Fehler beim Lesen der Datei");
    }
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/stock/import", { method: "POST", body: form });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || "Import fehlgeschlagen");
      setMsg(`Snapshot erstellt: ${js.rows_valid}/${js.rows_total} Zeilen übernommen.`);
    } catch (e: any) {
      setErr(e?.message || "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Lagerbestand importieren</h1>
            <p className="text-sm text-slate-600">
              Lade die tägliche Lagerbestandsdatei hoch. Daraus wird ein Snapshot erzeugt, den das Ordertool verwendet.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="secondary">Zurück</Button>
          </Link>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <div className="text-sm font-semibold">Quelle-Analyse</div>
            <div className="text-xs text-slate-500">
              Quelle geladen: {summaryMeta.total.toLocaleString("de-CH")} Zeilen, davon{" "}
              {summaryMeta.relevant.toLocaleString("de-CH")} relevant (Freier verfügbarer Bestand &gt; 0).
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Markt</label>
                <select
                  className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={summaryMarket}
                  onChange={(e) => setSummaryMarket(e.target.value as "DE_AT" | "CH")}
                >
                  <option value="DE_AT">DE/AT</option>
                  <option value="CH">CH</option>
                </select>
              </div>
              {summaryLoading ? <div className="text-xs text-slate-500">Lade Lagerbestand…</div> : null}
              {summaryError ? <div className="text-xs text-rose-600">{summaryError}</div> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Gesamt lagernd</div>
                <div className="text-2xl font-semibold">{summaryTotals.all.lagernd.toLocaleString("de-CH")}</div>
                <div className="text-xs text-slate-500">Summe „Freier verfügbarer Bestand“</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Bosch lagernd</div>
                <div className="text-2xl font-semibold">{summaryTotals.bosch.lagernd.toLocaleString("de-CH")}</div>
                <div className="text-xs text-slate-500">nur Motorhersteller Bosch</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Panasonic lagernd</div>
                <div className="text-2xl font-semibold">{summaryTotals.pana.lagernd.toLocaleString("de-CH")}</div>
                <div className="text-xs text-slate-500">nur Motorhersteller Panasonic</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Gesamt zu bauen</div>
                <div className="text-2xl font-semibold">{summaryTotals.all.zuBauen.toLocaleString("de-CH")}</div>
                <div className="text-xs text-slate-500">Summe „Menge Produktions-vorschlag“ (Spalte AA)</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Bosch zu bauen</div>
                <div className="text-2xl font-semibold">{summaryTotals.bosch.zuBauen.toLocaleString("de-CH")}</div>
                <div className="text-xs text-slate-500">nur Motorhersteller Bosch</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Panasonic zu bauen</div>
                <div className="text-2xl font-semibold">{summaryTotals.pana.zuBauen.toLocaleString("de-CH")}</div>
                <div className="text-xs text-slate-500">nur Motorhersteller Panasonic</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Motorhersteller</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={summaryFilter.motor_brand}
                  onChange={(e) => setSummaryFilter((prev) => ({ ...prev, motor_brand: e.target.value }))}
                >
                  <option value="">alle</option>
                  {summaryFilters.motor_brand.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Modellfamilie</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={summaryFilter.series}
                  onChange={(e) => setSummaryFilter((prev) => ({ ...prev, series: e.target.value }))}
                >
                  <option value="">alle</option>
                  {summaryFilters.series.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Motortyp</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={summaryFilter.motor_type}
                  onChange={(e) => setSummaryFilter((prev) => ({ ...prev, motor_type: e.target.value }))}
                >
                  <option value="">alle</option>
                  {summaryFilters.motor_type.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Rahmenform</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={summaryFilter.frame_type}
                  onChange={(e) => setSummaryFilter((prev) => ({ ...prev, frame_type: e.target.value }))}
                >
                  <option value="">alle</option>
                  {summaryFilters.frame_type.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Farbe</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={summaryFilter.color}
                  onChange={(e) => setSummaryFilter((prev) => ({ ...prev, color: e.target.value }))}
                >
                  <option value="">alle</option>
                  {summaryFilters.color.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Rahmenhöhe</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={summaryFilter.frame_size}
                  onChange={(e) => setSummaryFilter((prev) => ({ ...prev, frame_size: e.target.value }))}
                >
                  <option value="">alle</option>
                  {summaryFilters.frame_size.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-slate-500">Aufschlüsselung nach</div>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={summaryGroupBy}
                onChange={(e) =>
                  setSummaryGroupBy(e.target.value as (typeof SUMMARY_GROUP_FIELDS)[number]["key"])
                }
              >
                {SUMMARY_GROUP_FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] text-slate-500">
                      <th className="px-3 py-2">Wert</th>
                      <th className="px-3 py-2">Lagernd</th>
                      <th className="px-3 py-2">Zu bauen</th>
                      <th className="px-3 py-2">SKUs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryBreakdown.map((row) => (
                      <tr key={row.label} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{row.label}</td>
                        <td className="px-3 py-2">{row.lagernd.toLocaleString("de-CH")}</td>
                        <td className="px-3 py-2">{row.zuBauen.toLocaleString("de-CH")}</td>
                        <td className="px-3 py-2">{row.skus.toLocaleString("de-CH")}</td>
                      </tr>
                    ))}
                    {!summaryBreakdown.length ? (
                      <tr>
                        <td className="px-3 py-3 text-slate-500" colSpan={4}>
                          Keine Daten für die aktuelle Auswahl.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Upload</CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={upload} disabled={!file || busy}>
                {busy ? "Importiere…" : "Snapshot erstellen"}
              </Button>
              <span className="text-xs text-slate-500">Beim Import wird immer ein neuer Run angelegt.</span>
            </div>

            {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div> : null}
            {showSchemaHint ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Hinweis: Bitte die Migration <span className="font-semibold">006_stock_snapshot.sql</span> ausführen und
                anschließend den Supabase Schema-Cache neu laden. Danach erneut importieren.
              </div>
            ) : null}
            {msg ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div> : null}

            {preview.length ? (
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Vorschau (erste 8 Zeilen)</div>
                <div className="mt-2 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-[11px] text-slate-500">
                        {headers.slice(0, 8).map((h) => (
                          <th key={h} className="px-2 py-1">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, idx) => (
                        <tr key={idx} className="border-t border-slate-100">
                          {headers.slice(0, 8).map((h) => (
                            <td key={h} className="px-2 py-1 text-slate-700">
                              {String(row?.[h] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {headers.length > 8 ? (
                  <div className="mt-2 text-[11px] text-slate-500">
                    Es werden {headers.length} Spalten erkannt. Die Vorschau zeigt die ersten 8.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-slate-600">Noch keine Datei geladen.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}
