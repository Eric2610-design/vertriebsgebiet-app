"use client";

import { useEffect, useState } from "react";
import RequireRole from "@/components/RequireRole";

type FixpriceRow = {
  articleNo: string;
  motor: "BOSCH" | "PANASONIC";
};

type FixpriceSettings = {
  version: number;
  rows: FixpriceRow[];
};

export default function FixpriceArticlesPage() {
  const [rows, setRows] = useState<FixpriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sourceInfo, setSourceInfo] = useState<any | null>(null);

  // Laden aus app_settings
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/settings?key=fixprice_articles");
        const json = await res.json();

        if (json?.value?.rows) {
          setRows(json.value.rows);
          setSourceInfo(json.value.source ?? null);
        } else {
          setRows([]);
          setSourceInfo(json.value?.source ?? null);
        }
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);

    const payload: FixpriceSettings = {
      version: 1,
      rows,
    };

    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "fixprice_articles",
        value: payload,
      }),
    });

    if (!res.ok) {
      setMsg("❌ Fehler beim Speichern");
    } else {
      setMsg("✅ Gespeichert");
    }

    setSaving(false);
  }

  function addRow() {
    setRows([...rows, { articleNo: "", motor: "BOSCH" }]);
  }

  function updateRow(idx: number, patch: Partial<FixpriceRow>) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="mx-auto max-w-6xl p-4 md:p-8 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Fixpreis · Artikel</h1>
            <p className="text-sm text-neutral-600">
              Artikelnummern mit Fixpreis (aus „Regeln und Schwellen.xlsx“).
              Spalte E ≠ leer ⇒ Fixpreis/Sonderpreis. Spalte E leer ⇒ Normalpreis.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={addRow}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
            >
              + Artikel
            </button>
            <label className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50 cursor-pointer">
              {uploading ? "Lade…" : "Fixpreis-Datei hochladen"}
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  setUploadMsg(null);
                  try {
                    const form = new FormData();
                    form.append("file", file);
                    const res = await fetch("/api/fixprice/import", { method: "POST", body: form });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json?.error ?? "Upload fehlgeschlagen");
                    setRows(json?.setting?.value?.rows ?? rows);
                    setSourceInfo(json?.setting?.value?.source ?? null);
                    setUploadMsg("Fixpreis-Datei importiert.");
                  } catch (err: any) {
                    setUploadMsg(err?.message ?? "Upload fehlgeschlagen");
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
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
        {uploadMsg && (
          <div className="rounded-xl border bg-neutral-50 p-3 text-sm">{uploadMsg}</div>
        )}
        {sourceInfo && (
          <div className="text-xs text-neutral-500">
            Quelle: {sourceInfo.filename ?? "—"} · Sheet: {sourceInfo.sheet ?? "—"} · Import: {sourceInfo.imported_at ?? "—"}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-neutral-600">Lade …</div>
        ) : (
          <div className="rounded-2xl border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-3 py-2 text-left">Artikelnummer</th>
                  <th className="px-3 py-2 text-left">Motor</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-6 text-center text-neutral-500"
                    >
                      Keine Fixpreis-Artikel hinterlegt
                    </td>
                  </tr>
                )}

                {rows.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">
                      <input
                        value={r.articleNo}
                        onChange={(e) =>
                          updateRow(idx, { articleNo: e.target.value.trim() })
                        }
                        placeholder="Artikelnummer"
                        className="w-full rounded-lg border px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.motor}
                        onChange={(e) =>
                          updateRow(idx, {
                            motor: e.target.value as "BOSCH" | "PANASONIC",
                          })
                        }
                        className="rounded-lg border px-2 py-1"
                      >
                        <option value="BOSCH">Bosch</option>
                        <option value="PANASONIC">Panasonic</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => removeRow(idx)}
                        className="text-red-600 hover:underline"
                      >
                        Entfernen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequireRole>
  );
}
