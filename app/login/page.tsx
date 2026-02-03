// app/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // optional: wenn Session schon da ist, direkt weiter
    const supabase = createSupabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/app");
    });
  }, [router]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);

    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErr(error.message);
        setBusy(false);
        return;
      }

      // super wichtig: UI aktualisieren + middleware cookie refresh greifen lassen
      router.replace(next);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Login</h2>

      <form onSubmit={onLogin} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label>E-Mail</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Passwort</label>
          <input
            value={password}
            type="password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {err && <div style={{ color: "crimson" }}>{err}</div>}

        <button className="btn" disabled={busy}>
          {busy ? "…" : "Einloggen"}
        </button>
      </form>
    </div>
  );
}
