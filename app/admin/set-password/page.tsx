"use client";

import React, { useState } from "react";

export default function SetPasswordPage() {
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [out, setOut] = useState<string>("");

  async function run() {
    setOut("Sende Anfrage...");
    try {
      const res = await fetch("/api/admin/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, userId, newPassword }),
      });
      const j = await res.json();
      if (!res.ok) {
        setOut(`Fehler (${res.status}): ${j?.error ?? "unknown error"}`);
        return;
      }
      setOut(`OK ✅ Passwort gesetzt für: ${j.user?.email ?? "(unknown)"}`);
    } catch (e: any) {
      setOut(`Fehler: ${e?.message ?? "unknown"}`);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>Admin: Passwort setzen</h2>
      <p>
        <small>
          Nutze das nur einmal, solange E-Mail Rate-Limit aktiv ist. Danach Seite wieder löschen oder Token ändern.
        </small>
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label>ADMIN_SETUP_TOKEN</label>
          <input
            className="input"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="aus Vercel Env Var"
          />
        </div>

        <div>
          <label>User UUID (Supabase → Auth → Users → ID)</label>
          <input
            className="input"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </div>

        <div>
          <label>Neues Passwort (min. 10 Zeichen)</label>
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="z.B. EinSehrSicheresPasswort123!"
          />
        </div>

        <button
          className="btn"
          onClick={run}
          disabled={!token || !userId || newPassword.length < 10}
        >
          Passwort setzen
        </button>

        {out && (
          <div style={{ marginTop: 6 }}>
            <small>{out}</small>
          </div>
        )}
      </div>
    </div>
  );
}
