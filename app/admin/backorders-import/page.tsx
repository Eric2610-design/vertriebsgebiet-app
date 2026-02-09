"use client";

import { useState } from "react";
import RequireRole from "@/components/RequireRole";
import { Card, CardContent, Button } from "@/components/ui";

export default function BackordersImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport() {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/api/admin/backorders-import", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 403) {
        setError("Keine Berechtigung");
      } else {
        setError(`${json?.error ?? res.statusText}${json?.run_id ? ` (run_id: ${json.run_id})` : ""}`);
      }
      setStatus("error");
      return;
    }

    setResult(json);
    setStatus("done");
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
              <Button onClick={runImport} disabled={!file || status === "uploading"}>
                {status === "uploading" ? "Import läuft…" : "Import starten"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {status === "uploading" ? (
          <div className="text-sm text-neutral-600">Upload läuft…</div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        ) : null}

        {result ? (
          <pre className="rounded-2xl border bg-neutral-50 p-4 text-xs overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </div>
    </RequireRole>
  );
}
