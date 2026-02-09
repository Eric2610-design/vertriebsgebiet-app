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
          <div className="rounded-2xl border bg-neutral-50 p-4 text-sm space-y-3">
            <div>
              <div className="text-xs uppercase text-neutral-500">Run</div>
              <div className="font-mono text-xs">{result?.run_id ?? "-"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">Stats</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(result?.stats ?? {}).map(([key, value]) => (
                  <div key={key} className="rounded-xl border bg-white p-3">
                    <div className="text-xs uppercase text-neutral-500">{key}</div>
                    <div className="text-base font-semibold">{String(value ?? "-")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </RequireRole>
  );
}
