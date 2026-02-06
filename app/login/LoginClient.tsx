"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, CardContent, CardHeader, Input, Badge } from "@/components/ui";

export default function LoginClient() {
  const sp = useSearchParams();
  const next = sp.get("next") || "/map";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canSubmit = useMemo(() => email.trim().length > 3 && password.trim().length > 0, [email, password]);

  async function submit() {
    if (!canSubmit) return;
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, next }),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || "Login fehlgeschlagen");
      window.location.href = js?.next || next;
    } catch (e: any) {
      setErr(e?.message || "Login fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Login</div>
            <div className="text-sm text-slate-600">E-Mail & Passwort (Supabase)</div>
          </div>
          <Badge tone="slate">{busy ? "…" : "bereit"}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {err ? <div className="text-sm text-rose-700">{err}</div> : null}

          <div>
            <label className="text-sm text-slate-700">E-Mail</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="z.B. g.backhaus@flyer.ch" autoComplete="username" />
          </div>

          <div>
            <label className="text-sm text-slate-700">Passwort</label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort"
              type="password"
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>

          <Button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? "Login…" : "Login"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
