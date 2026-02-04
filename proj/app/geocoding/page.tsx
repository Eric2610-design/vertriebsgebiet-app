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

export const dynamic = "force-dynamic";

export default function GeocodingPage() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [onlyMaster, setOnlyMaster] = useState(true);

  const stopRef = useRef(false);

  async function startAll() {
    stopRef.current = false;
    setRunning(true);
    setProgress(null);
    setMsg("Starte Geocoding-Batch …");

    const res = await fetch("/api/geocode/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlyMaster }),
    });
    const json = await res.json();

    if (!json.ok) {
      setRunning(false);
      setMsg(`❌ Start Fehler: ${json.error ?? "unknown"}`);
      return;
    }

    setBatchId(json.batchId);
    setMsg(`✅ Batch gestartet (${onlyMaster ? "nur Master" : "alle"}): ${json.batchId}`);
  }

  async function fetchProgress(id: string) {
    const res = await fetch(`/api/geocode/progress?batchId=${encodeURIComponent(id)}`, { cache: "no-store" });
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
        const p = await fetchProgress(batchId);
        if (!p.ok) {
          setMsg("❌ Progress Fehler");
          setRunning(false);
          return;
        }
        setProgress(p);

        if (p.total > 0 && p.done >= p.total) {
          setMsg("🎉 Fertig! Geocoding abgeschlossen.");
          setRunning(false);
          return;
        }

        if (p.breakdown.queued > 0) {
          const w = await runWorker(batchId);
          if (!w.ok) {
            setMsg(`❌ Worker Fehler: ${w.error ?? "unknown"}`);
            setRunning(false);
            return;
          }
          if (w.processed > 0) {
            setMsg(`Batch: processed=${w.processed}, ok=${w.success}, not_found=${w.notFound}, error=${w.failed}`);
          }
        } else {
          setMsg("ℹ️ Keine queued mehr – finalisiere …");
        }
      } catch (e: any) {
        setMsg(`❌ ${e?.message ?? String(e)}`);
        setRunning(false);
      }
    };

    tick();
    const interval = setInterval(tick, 2500);
    return () => clearInterval(interval);
  }, [batchId]);

  function stop() {
    stopRef.current = true;
    setRunning(false);
    setMsg("⏸️ Stop gedrückt. (Du kannst später wieder starten.)");
  }

  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="cardHeader">
          <div>
            <h3 className="cardTitle">Geocoding</h3>
            <p className="cardSub">Ein Klick – dann läuft’s automatisch weiter (rate-limited). Danach sind Marker auf der Karte sichtbar.</p>
          </div>
          <div className="row">
            <Link className="pill" href="/">← Dashboard</Link>
            <Link className="pill" href="/admin/dealers">Dubletten</Link>
          </div>
        </div>
        <div className="cardBody">
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="pill" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={onlyMaster} onChange={(e) => setOnlyMaster(e.target.checked)} />
              Nur Master geocoden
            </label>
            <button className="btnPrimary" onClick={startAll} disabled={running}>
              {running ? "Läuft…" : "GEOCODE ALL starten"}
            </button>
            <button onClick={stop} disabled={!running}>
              Stop
            </button>
            {batchId ? <span className="badge">Batch: <span className="mono">{batchId.slice(0, 8)}…</span></span> : null}
          </div>

          {msg ? <div className={msg.startsWith("✅") || msg.startsWith("🎉") || msg.startsWith("ℹ️") ? "badge" : "badge danger"}>{msg}</div> : null}

          <div style={{ marginTop: 14 }}>
            {progress ? (
              <>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <strong>{done}</strong> / {total} ({pct}%)
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="badge">queued {progress.breakdown.queued}</span>
                    <span className="badge ok">ok {progress.breakdown.ok}</span>
                    <span className="badge warn">not_found {progress.breakdown.not_found}</span>
                    <span className="badge danger">error {progress.breakdown.error}</span>
                  </div>
                </div>

                <div className="progressBar" style={{ marginTop: 10 }}>
                  <div style={{ width: `${pct}%` }} />
                </div>

                <div className="small" style={{ marginTop: 10 }}>
                  Tipp: Erst Dubletten mergen → dann nur Master geocoden. Dadurch wird die Karte deutlich sauberer.
                </div>
              </>
            ) : (
              <div className="small" style={{ opacity: 0.8 }}>Noch nicht gestartet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardBody" style={{ opacity: 0.9 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 800 }}>Nächste Schritte</div>
              <div className="small">Wenn Geocoding fertig ist: Karte prüfen, dann ggf. „not_found/error“ nacharbeiten.</div>
            </div>
            <div className="row">
              <Link className="pill active" href="/">Zur Karte →</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
