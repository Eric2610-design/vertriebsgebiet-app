"use client";

import { useState } from "react";
import RequireRole from "@/components/RequireRole";
import { Card, CardContent, Button } from "@/components/ui";

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
      setLog(`❌ Fehler: ${json?.error ?? res.statusText}\n${json?.run_id ? "run_id: " + json.run_id : ""}`);
      return;
    }

    setLog(`✅ OK\nrun_id: ${json.run_id}\n${JSON.stringify(json.stats, null, 2)}`);
  }

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="mx-auto max-w-4xl p-4 md:p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Auftragsrückstand · Import</h1>
          <p className="text-sm text-neutral-600">
            Admin lädt die Excel „Auftragsbestandsposten…“ hoch. Außendienst sieht danach die Rückstandsliste.
          </p>
        </div>

        <Card>
          <CardContent>
            <div className="space-y-3">
              <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Button onClick={runImport} disabled={!file}>
                Import starten
              </Button>
            </div>
          </CardContent>
        </Card>

        {log ? <pre className="rounded-2xl border bg-neutral-50 p-4 text-xs overflow-auto">{log}</pre> : null}
      </div>
    </RequireRole>
  );
}
