"use client";

import { useState } from "react";
import RequireRole from "@/components/RequireRole";

export default function BackordersImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<string>("");

  async function runImport() {
    if (!file) return;
    setLog("Import läuft…");

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/api/admin/backorders-import", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setLog(`❌ Fehler: ${json?.error ?? res.statusText}`);
      return;
    }

    setLog(`✅ OK\nrun_id: ${json.run_id}\n${JSON.stringify(json.stats, null, 2)}`);
  }

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="mx-auto max-w-4xl p-4 md:p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Auftragsrückstand · Import</h1>
          <p className="text-sm text-slate-600">
            Admin lädt die Datei „Auftragsbestandsposten…xlsx“ hoch. Die Rückstandsliste nutzt immer den neuesten Snapshot.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button
            onClick={runImport}
            disabled={!file}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Import starten
          </button>
        </div>

        {log ? <pre className="rounded-2xl border bg-slate-50 p-4 text-xs overflow-auto">{log}</pre> : null}
      </div>
    </RequireRole>
  );
}
