"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextPath = useMemo(() => {
    const n = sp?.get("next");
    return n && n.startsWith("/app") ? n : "/app";
  }, [sp]);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // optional: wenn du schon eingeloggt bist, direkt weiter
  useEffect(() => {
    // kein harter Check hier – der Guard passiert serverseitig im /app Layout
    // (damit es nicht wieder looped)
  }, []);

  async function onLogin() {
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ email, password: pw }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        setMsg(json?.error ?? "Login fehlgeschlagen.");
        setLoading(false);
        return;
      }

      // WICHTIG: harte Navigation, damit Cookies sicher greifen
      window.location.href = nextPath;
    } catch (e: any) {
      setMsg(e?.message ?? "Login fehlgeschlagen.");
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Login</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label>E-Mail</label>
          <input
            className="input"
            placeholder="name@firma.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div>
          <label>Passwort</label>
          <input
            className="input"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="btn" onClick={onLogin} disabled={loading}>
          {loading ? "…" : "Einloggen"}
        </button>

        <a className="btn secondary" href="/app">
          Dashboard
        </a>
      </div>

      {msg && (
        <div style={{ marginTop: 10 }}>
          <small style={{ color: "crimson" }}>{msg}</small>
        </div>
      )}
    </div>
  );
}
