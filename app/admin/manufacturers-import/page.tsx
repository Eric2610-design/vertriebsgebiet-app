"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { Button, Card, CardContent, CardHeader, Input } from "@/components/ui";

type Row = Record<string, any>;

function normalizeKey(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export default function ManufacturersImportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [colKey, setColKey] = useState<string>("key");
  const [colLabel, setColLabel] = useState<string>("label");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const preview = useMemo(() => rows.slice(0, 10), [rows]);

  const parsed = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [];
    for (const r of rows) {
      const kRaw = r?.[colKey];
      const lRaw = r?.[colLabel];
      const key = normalizeKey(kRaw);
      const label = String(lRaw || "").trim();
      if (!key || !label) continue;
      out.push({ key, label });
    }
    // de-dupe by key (last wins)
    const m = new Map<string, string>();
    for (const x of out) m.set(x.key, x.label);
    return Array.from(m.entries()).map(([key, label]) => ({ key, label }));
  }, [rows, colKey, colLabel]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Hersteller importieren</h1>
          <p className="text-sm text-slate-600">
            Lade eine Excel-Datei hoch und mappe die Spalten auf <b>key</b> und <b>label</b>. Neue Hersteller werden in
            der Datenbank angelegt und im Admin-Bereich als „Icon fehlt“ markiert.
          </p>
        </div>
        <div className="flex gap-2">
          <a className="text-sm underline" href="/templates/manufacturers_template.xlsx">
            Template herunterladen
          </a>
          <Link href="/admin">
            <Button variant="secondary">Zurück</Button>
          </Link>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader className="text-sm font-semibold">Upload</CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={async (e) => {
              try {
                setErr(null);
                setMsg(null);
                const f = e.target.files?.[0];
                if (!f) return;
                const buf = await f.arrayBuffer();
                const wb = XLSX.read(buf, { type: "array" });
                const name = wb.SheetNames?.[0];
                if (!name) throw new Error("Keine Tabelle gefunden");
                const ws = wb.Sheets[name];
                const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Row[];
                const h = json.length ? Object.keys(json[0] as any) : [];
                setRows(json);
                setHeaders(h);
                // set smart defaults
                if (h.includes("key")) setColKey("key");
                else if (h.includes("manufacturer_key")) setColKey("manufacturer_key");
                else if (h.includes("id")) setColKey("id");
                else setColKey(h[0] || "key");

                if (h.includes("label")) setColLabel("label");
                else if (h.includes("name")) setColLabel("name");
                else setColLabel(h[1] || h[0] || "label");
              } catch (e: any) {
                setErr(e?.message || "Fehler beim Lesen der Datei");
              }
            }}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs text-slate-500">Spalte für key</div>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                value={colKey}
                onChange={(e) => setColKey(e.target.value)}
              >
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-slate-500">Wird normalisiert (klein, Unterstrich, max 64 Zeichen).</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Spalte für label (Anzeige)</div>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                value={colLabel}
                onChange={(e) => setColLabel(e.target.value)}
              >
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={async () => {
                try {
                  setBusy(true);
                  setErr(null);
                  setMsg(null);
                  const res = await fetch("/api/admin/manufacturers/import", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ items: parsed }),
                  });
                  const js = await res.json();
                  if (!res.ok) throw new Error(js?.error || "Import fehlgeschlagen");
                  setMsg(`Import ok: ${js.inserted} neu, ${js.updated} aktualisiert.`);
                } catch (e: any) {
                  setErr(e?.message || "Fehler");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || parsed.length === 0}
            >
              {busy ? "Importiere…" : `Importieren (${parsed.length})`}
            </Button>
            <span className="text-xs text-slate-500">Nach dem Import Icons im Admin → „Fehlende Icons“ hochladen.</span>
          </div>

          {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div> : null}
          {msg ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div> : null}

          {preview.length ? (
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Vorschau (erste 10 Zeilen)</div>
              <div className="mt-2 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="px-2 py-1">{colKey}</th>
                      <th className="px-2 py-1">{colLabel}</th>
                      <th className="px-2 py-1">normalisiert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-2 py-1">{String(r?.[colKey] ?? "")}</td>
                        <td className="px-2 py-1">{String(r?.[colLabel] ?? "")}</td>
                        <td className="px-2 py-1 text-slate-600">{normalizeKey(String(r?.[colKey] ?? ""))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">Noch keine Datei geladen.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
