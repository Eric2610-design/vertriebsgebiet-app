"use client";

import React, { useMemo, useState } from "react";
import { createSupabaseBrowser } from "../../lib/supabase/browser";

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
if (!supabase) {
  return (
    <div className="card">
      <h2 style={{marginTop:0}}>Konfiguration fehlt</h2>
      <p><small>
        In Vercel fehlen NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY (oft nur im Preview-Environment).
      </small></p>
    </div>
  );
}

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/app";
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/app` }
        });
        if (error) throw error;
        setMsg("Magic-Link wurde verschickt. Öffne die Mail auf demselben Gerät/Browser.");
      }
    } catch (err: any) {
      setMsg(err?.message ?? "Login fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{marginTop:0}}>Login</h2>
      <form onSubmit={onLogin}>
        <div className="row">
          <div style={{flex:"1 1 280px"}}>
            <label>E-Mail</label>
            <input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="name@firma.de" />
          </div>
          {mode === "password" && (
            <div style={{flex:"1 1 280px"}}>
              <label>Passwort</label>
              <input className="input" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
            </div>
          )}
        </div>

        <div style={{display:"flex", gap:10, marginTop:12, alignItems:"center", flexWrap:"wrap"}}>
          <button className="btn" disabled={busy || !email || (mode==="password" && !password)}>
            {busy ? "Bitte warten…" : (mode==="password" ? "Einloggen" : "Magic-Link senden")}
          </button>

          <button
            type="button"
            className="btn secondary"
            onClick={() => setMode(mode === "password" ? "magic" : "password")}
            disabled={busy}
          >
            Wechsel: {mode === "password" ? "Magic-Link" : "Passwort"}
          </button>
        </div>

        {msg && <p style={{marginBottom:0, marginTop:12}}><small>{msg}</small></p>}
      </form>
    </div>
  );
}
