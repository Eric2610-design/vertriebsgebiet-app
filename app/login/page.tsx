"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "../../lib/supabase/browser";

export default function LoginPage() {
  const sp = useSearchParams();
  const nextUrl = useMemo(() => sp.get("next") || "/app", [sp]);

  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // HARTE Navigation -> Cookie ist sicher da, Server sieht User
        window.location.assign(nextUrl);
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}${nextUrl}`,
          },
        });
        if (error) throw error;

        setMsg("Magic-Link wurde gesendet. Bitte E-Mail öffnen.");
      }
    } catch (err: any) {
      setMsg(err?.message || "Login fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Login</h2>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label>E-Mail</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@firma.de"
            required
          />
        </div>

        {mode === "password" && (
          <div style={{ display: "grid", gap: 6 }}>
            <label>Passwort</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn primary" disabled={loading} type="submit">
            {loading ? "…" : "Einloggen"}
          </button>

          <button
            className="btn secondary"
            type="button"
            onClick={() => setMode(mode === "password" ? "magic" : "password")}
          >
            Wechsel: {mode === "password" ? "Magic-Link" : "Passwort"}
          </button>
        </div>

        {msg && <p style={{ color: "crimson", margin: 0 }}>{msg}</p>}
      </form>
    </div>
  );
}
