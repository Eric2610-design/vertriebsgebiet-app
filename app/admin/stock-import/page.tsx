"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { Button, Card, CardContent, CardHeader, Input } from "@/components/ui";
import RequireRole from "@/components/RequireRole";

type PreviewRow = Record<string, any>;

export default function StockImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const preview = useMemo(() => rows.slice(0, 8), [rows]);

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
