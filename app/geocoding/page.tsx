"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Progress = {
  ok: boolean;
  batchId: string;
  total: number;
  done: number;
  breakdown: {
    queued: number;
    ok: number;
    not_found: number;
    error: number;
  };
};

export default function GeocodingPage() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const stopRef = useRef(false);

  async function startAll() {
    stopRef.current = false;
    setRunning(true);
    setMsg("Starte Batch …");
    setProgress(null);

    const res = await fetch("/api/geocode/start", { method: "POST" });
    const json = await res.json();

    if (!json.ok) {
      setRunning(false);
      setMsg(`❌ Start Fehler: ${json.error ?? "unknown"}`);
      return;
    }

    setBatchId(json.batchId);
    setMsg(`✅ Batch gestartet: ${json.batchId}`);
  }

  async function fetchProgress(id: string) {
    const res = await fetch(`/api/geocode/progress?batchId=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    return (await res.json()) as Progress;
  }

  async function runWorker(id: string) {
    const res = await fetch("/api/geocode/worker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: id, limit: 80, delayMs: 1100 }),
    });
    return await res.json();
  }

  useEffect(() => {
    if (!batchId) return;

    const tick = async () => {
      if (stopRef.current) return;

      try {
        // 1) Progress holen
        const p = await fetchProgress(batchId);
        if (!p.ok) {
          setMsg(`❌ Progress Fehler`);
          setRunning(false);
          return;
        }
        setProgress(p);

        // fertig?
        if (p.total > 0 && p.done >= p.total) {
          setMsg("🎉 Fertig! Geocoding abgeschlossen.");
          setRunning(false);
          return;
        }

        // 2) Worker nur anstoßen, wenn noch queued vorhanden
        if (p.breakdown.queued > 0) {
          const w = await runWorker(batchId);
          if (!w.ok) {
            setMsg(`❌ Worker Fehler: ${w.error ?? "unknown"}`);
            setRunning(false);
            return;
          }
          if (w.processed === 0) {
            // keine queued mehr (oder schon fertig)
            // warten wir einfach auf progress final
          } else {
            setMsg(
              `Batch verarbeitet: processed=${w.processed}, ok=${w.success}, not_found=${w.notFound}, error=${w.failed}`
            );
          }
        } else {
          // nichts mehr queued, warten bis progress done==total
          setMsg("ℹ️ Keine queued mehr – finalisiere …");
        }
      } catch (e: any) {
        setMsg(`❌ ${e?.message ?? String(e)}`);
        setRunning(false);
      }
    };

    // sofort 1x laufen lassen + dann alle 2.5s
    tick();
    const interval = setInterval(tick, 2500);
    return () => clearInterval(interval);
  }, [batchId]);

  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function stop() {
    stopRef.current = true;
    setRunning(false);
    setMsg("⏸️ Stop gedrückt. (Du kannst später wieder starten.)");
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Geocoding</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/">→ Karte</Link>
          <Link href="/upload">→ Upload</Link>
          <Link href="/admin/dealers">→ Dubletten</Link>
        </nav>
      </div>

      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Ein Klick startet einen Batch und verarbeitet automatisch weiter (rate-limited).
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={startAll} disabled={running}>
          {running ? "Läuft…" : "GEOCODE ALL starten"}
        </button>
        <button onClick={stop} disabled={!running}>
          Stop
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 12, padding: 10, border: "1px solid #ddd", borderRadius: 10 }}>
          {msg}
        </div>
      )}

      <div style={{ marginTop: 16, padding: 14, border: "1px solid #ddd", borderRadius: 10 }}>
        <h3 style={{ marginTop: 0 }}>Fortschritt</h3>

        {progress ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{done}</strong> / {total} ({pct}%)
              </div>
              <div style={{ opacity: 0.8 }}>
                queued: {progress.breakdown.queued} · ok: {progress.breakdown.ok} · not_found:{" "}
                {progress.breakdown.not_found} · error: {progress.breakdown.error}
              </div>
            </div>

            <div style={{ height: 12, background: "#eee", borderRadius: 999, overflow: "hidden", marginTop: 10 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#4caf50", transition: "width 0.25s" }} />
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
              Batch: {progress.batchId}
            </div>
          </>
        ) : (
          <div style={{ opacity: 0.7 }}>Noch nicht gestartet.</div>
        )}
      </div>
    </main>
  );
}
