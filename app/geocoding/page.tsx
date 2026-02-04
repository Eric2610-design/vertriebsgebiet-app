"use client";

import { useEffect, useState } from "react";

export default function GeocodingPage() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null);
  const [running, setRunning] = useState(false);

  async function start() {
    setRunning(true);
    setProgress(null);

    const res = await fetch("/api/geocode/start", { method: "POST" });
    const json = await res.json();
    setBatchId(json.batchId);
  }

  // poll progress + trigger worker
  useEffect(() => {
    if (!batchId) return;

    const t = setInterval(async () => {
      // worker anstoßen
      await fetch("/api/geocode/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });

      // progress abfragen
      const res = await fetch(`/api/geocode/progress?batchId=${batchId}`);
      const p = await res.json();
      setProgress({ total: p.total, done: p.done });

      if (p.total > 0 && p.done >= p.total) {
        clearInterval(t);
        setRunning(false);
      }
    }, 2500);

    return () => clearInterval(t);
  }, [batchId]);

  const percent =
    progress && progress.total
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <main style={{ padding: 32, maxWidth: 700 }}>
      <h1>Geocoding</h1>

      <button onClick={start} disabled={running}>
        {running ? "Geocoding läuft…" : "ALLE Händler geocoden"}
      </button>

      {progress && (
        <div style={{ marginTop: 20 }}>
          <div>
            {progress.done} / {progress.total} ({percent}%)
          </div>
          <div
            style={{
              height: 12,
              background: "#eee",
              borderRadius: 6,
              overflow: "hidden",
              marginTop: 6,
            }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: "100%",
                background: "#4caf50",
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
