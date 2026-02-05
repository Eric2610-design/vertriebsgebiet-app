"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardHeader, Input, Badge } from "@/components/ui";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const next = searchParams?.next ?? "/map";

  async function submit() {
    setErr(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const t = await res.text();
      setErr(t || "Login fehlgeschlagen");
      return;
    }
    window.location.href = next;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader title="Login" subtitle="Bitte anmelden, um die Händlerdaten zu sehen." />
        <CardContent>
          <div className="grid gap-3">
            <div>
              <div className="text-sm font-medium mb-1">E‑Mail</div>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" />
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Passwort</div>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {err ? <Badge tone="rose">{err}</Badge> : null}
            <Button onClick={submit}>Anmelden</Button>
            <div className="text-xs text-slate-500">
              Hinweis: Admin setzt Zugangsdaten über Umgebungsvariablen. (VT_USER_1_EMAIL / VT_USER_1_PASSWORD / …)
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
