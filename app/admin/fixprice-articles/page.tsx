"use client";

import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";

type FixpriceEntry = {
  motor?: string;
  isFixprice?: boolean;
  preisart?: string;
  ek?: number | null;
  uvp?: number | null;
};

type FixpriceSettings = {
  version: number;
  source?: {
    filename?: string;
    sheet?: string;
    imported_at?: string;
    rows?: number;
    unique_articles?: number;
  };
  byArticleNo?: Record<string, FixpriceEntry>;
};

export default function FixpriceArticlesPage() {
  const [setting, setSetting] = useState<FixpriceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function loadSetting() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings?key=fixprice_articles");
      const json = await res.json();
      setSetting(json?.setting?.value ?? null);
    } catch {
      setSetting(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSetting();
  }, []);

  async function uploadFile() {
    if (!file) {
      setMsg("❌ Bitte zuerst eine Datei auswählen.");
      return;
    }
    setImporting(true);
    setMsg(null);

    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/fixprice/import", { method: "POST", body: form });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMsg(`❌ Import fehlgeschlagen: ${json?.error || res.statusText}`);
    } else {
      const json = await res.json().catch(() => ({}));
      setSetting(json?.setting?.value ?? null);
      setMsg("✅ Datei importiert");
    }
    setImporting(false);
  }

  const summary = useMemo(() => {
    const count = setting?.byArticleNo ? Object.keys(setting.byArticleNo).length : 0;
    const source = setting?.source;
    return { count, source };
  }, [setting]);

  const preview = useMemo(() => {
    if (!setting?.byArticleNo) return [];
    return Object.entries(setting.byArticleNo).slice(0, 25);
  }, [setting]);

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="mx-auto max-w-6xl p-4 md:p-8 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Fixpreis · Artikel</h1>
            <p className="text-sm text-neutral-600">
              Fixpreis-Datei hochladen (Spalten: Artikelnummer, EK, UVP, Motorhersteller, Preisart).
              Das Ordertool nutzt daraus, ob ein Rad Fixpreis oder Standardpreis hat.
            </p>
          </div>
        </div>

        {msg && (
          <div className="rounded-xl border bg-neutral-50 p-3 text-sm">{msg}</div>
        )}

        {loading ? (
          <div className="text-sm text-neutral-600">Lade …</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-4 space-y-3">
              <div className="text-sm font-medium">Datei-Import</div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
                <button
                  onClick={uploadFile}
                  disabled={importing}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {importing ? "Importiere …" : "Hochladen"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4 space-y-2">
              <div className="text-sm font-medium">Aktueller Stand</div>
              <div className="text-sm text-neutral-600">
                Artikel in Datenbank: <span className="font-medium">{summary.count}</span>
              </div>
              {summary.source && (
                <div className="text-xs text-neutral-500 space-y-1">
                  {summary.source.filename && <div>Datei: {summary.source.filename}</div>}
                  {summary.source.sheet && <div>Sheet: {summary.source.sheet}</div>}
                  {summary.source.imported_at && <div>Importiert: {summary.source.imported_at}</div>}
                  {summary.source.rows !== undefined && <div>Zeilen: {summary.source.rows}</div>}
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-white overflow-hidden">
              <div className="px-3 py-2 text-sm font-medium bg-neutral-50">Beispiel (erste 25 Einträge)</div>
              <table className="w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Artikelnummer</th>
                    <th className="px-3 py-2 text-left">Motor</th>
                    <th className="px-3 py-2 text-left">Preisart</th>
                    <th className="px-3 py-2 text-left">EK</th>
                    <th className="px-3 py-2 text-left">UVP</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                        Keine Fixpreis-Artikel hinterlegt
                      </td>
                    </tr>
                  )}
                  {preview.map(([articleNo, entry]) => (
                    <tr key={articleNo} className="border-t">
                      <td className="px-3 py-2">{articleNo}</td>
                      <td className="px-3 py-2">{entry.motor || "—"}</td>
                      <td className="px-3 py-2">{entry.preisart || (entry.isFixprice ? "Fixpreis" : "—")}</td>
                      <td className="px-3 py-2">{entry.ek ?? "—"}</td>
                      <td className="px-3 py-2">{entry.uvp ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </RequireRole>
  );
}
