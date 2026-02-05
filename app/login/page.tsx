"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextPath = useMemo(() => sp.get("next") || "/map", [sp]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // optional: prefill last email
    const last = typeof window !== "undefined" ? window.localStorage.getItem("vt_last_email") : null;
    if (last) setEmail(last);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (typeof window !== "undefined") window.localStorage.setItem("vt_last_email", email);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const txt = await res.text();
      let payload: any = null;
      try {
        payload = JSON.parse(txt);
      } catch {
        payload = { ok: res.ok, message: txt };
      }

      if (!res.ok || !payload?.ok) {
        setErr(payload?.message || `Login fehlgeschlagen (${res.status})`);
        return;
      }

      router.replace(nextPath);
    } catch (e: any) {
      setErr(e?.message || "Login fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "#f6f7fb" }}>
      <div style={{ width: "min(420px, 100%)", background: "white", borderRadius: 16, padding: 20, boxShadow: "0 10px 30px rgba(0,0,0,.08)" }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Login</div>
          <div style={{ fontSize: 13, color: "#556" }}>Bitte mit Firmen-E-Mail einloggen.</div>
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#334" }}>E-Mail</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              required
              placeholder="E.fuhrmann@flyer-bikes.com"
              style={{ height: 42, borderRadius: 10, border: "1px solid #d8dbe6", padding: "0 12px", outline: "none" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#334" }}>Passwort</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              style={{ height: 42, borderRadius: 10, border: "1px solid #d8dbe6", padding: "0 12px", outline: "none" }}
            />
          </label>

          {err ? (
            <div style={{ background: "#fff1f2", color: "#9f1239", border: "1px solid #fecdd3", padding: 10, borderRadius: 12, fontSize: 13 }}>
              {err}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            style={{
              height: 44,
              borderRadius: 12,
              border: "1px solid #1d4ed8",
              background: busy ? "#93c5fd" : "#2563eb",
              color: "white",
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Bitte warten…" : "Einloggen"}
          </button>

          <div style={{ fontSize: 12, color: "#667", marginTop: 4 }}>
            Weiterleitung nach: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{nextPath}</span>
          </div>
        </form>
      </div>
    </main>
  );
}
