"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardHeader, Input } from "@/components/ui";

export default function SetPasswordPage() {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setMsg(null);
    if (p1.length < 8) {
      setMsg("Passwort muss mindestens 8 Zeichen haben");
      return;
    }
    if (p1 !== p2) {
      setMsg("Passwörter stimmen nicht überein");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: p1 }),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || "Fehler beim Speichern");
      window.location.replace("/map");
    } catch (e: any) {
      setMsg(e?.message || "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Passwort festlegen</div>
          <div className="text-sm text-slate-600">Bitte setze ein neues Passwort für deinen Account.</div>
        </CardHeader>
        <CardContent className="space-y-3">
          {msg ? <div className="text-sm text-rose-700">{msg}</div> : null}
          <div>
            <label className="text-sm text-slate-700">Neues Passwort</label>
            <Input type="password" value={p1} onChange={(e) => setP1(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-slate-700">Neues Passwort (Wiederholen)</label>
            <Input type="password" value={p2} onChange={(e) => setP2(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Speichern…" : "Passwort speichern"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
