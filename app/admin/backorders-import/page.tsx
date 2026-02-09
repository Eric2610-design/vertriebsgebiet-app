"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

import RequireRole from "@/components/RequireRole";
import { Button, Card, CardContent, CardHeader, Input } from "@/components/ui";

type PreviewRow = any[];

function fmtJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function BackordersImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const preview = useMemo(() => rows.slice(0, 8), [rows]);

  async function handleFile(next: File | null) {
    setFile(next);
    setMsg(null);
    setErr(null);
    setResult(null);
    setRows([]);
    if (!next) return;

    try {
      const buf = await next.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const name = wb.SheetNames?.[0];
      if (!name) throw new Error("Keine Tabelle gefunden");
      const ws = wb.Sheets[name];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[];
      setRows(raw);
      setMsg(`Datei geladen: ${raw.length} Zeilen erkannt (inkl. Header).`);
    } catch (e: any) {
      setErr(e?.message || "Fehler beim Lesen der Datei");
    }
  }

  async function runImport() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/backorders/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Import fehlgeschlagen");
      setResult(json);
      setMsg("Import abgeschlossen.");
    } catch (e: any) {
      setErr(e?.message || "Import fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="mx-auto max-w-4xl p-4 md:p-8 space-y-4">
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">Auftragsrückstand · Import</div>
            <div className="text-sm text-slate-600">
              Importiert die Excel-Datei als neuen Snapshot (Run). Die Auftragsrückstand-Seite zeigt immer den neuesten Run.
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex gap-2">
                <Button disabled={!file || busy} onClick={runImport}>
                  {busy ? "Import läuft…" : "Import starten"}
                </Button>
              </div>
            </div>

            {msg && <div className="text-sm text-emerald-700">{msg}</div>}
            {err && <div className="text-sm text-red-700">{err}</div>}

            {result && (
              <pre className="text-xs bg-slate-50 border rounded-lg p-3 overflow-auto">{fmtJson(result)}</pre>
            )}

            {preview.length > 0 && (
              <div className="pt-2">
                <div className="text-sm font-medium">Vorschau (erste Zeilen)</div>
                <div className="mt-2 overflow-auto border rounded-lg">
                  <table className="min-w-full text-xs">
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className={i === 0 ? "bg-slate-50 font-medium" : ""}>
                          {(r as any[]).slice(0, 12).map((c, j) => (
                            <td key={j} className="px-2 py-1 border-b border-slate-100 whitespace-nowrap">
                              {String(c ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}
