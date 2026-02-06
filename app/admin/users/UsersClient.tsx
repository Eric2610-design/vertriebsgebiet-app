"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardContent, CardHeader, Input } from "@/components/ui";

type Profile = { id: string; email: string; role: string; display_name: string };

export default function UsersClient() {
  const [items, setItems] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [display, setDisplay] = useState("");
  const [role, setRole] = useState("aussendienst");

  async function reload() {
    const res = await fetch("/api/admin/users/list", { cache: "no-store" });
    const js = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(js?.error || "Fehler");
    setItems(js.items || []);
  }

  useEffect(() => {
    reload().catch((e) => setErr(e?.message || "Fehler"));
  }, []);

  async function invite() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, display_name: display, role }),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || "Invite fehlgeschlagen");
      setEmail("");
      setDisplay("");
      await reload();
    } catch (e: any) {
      setErr(e?.message || "Fehler");
    } finally {
      setBusy(false);
    }
  }

  const canInvite = useMemo(() => email.trim().length > 3 && display.trim().length > 0, [email, display]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Userverwaltung (nur SuperAdmin)</div>
          <div className="text-sm text-slate-600">User per Invite anlegen, Rollen verwalten.</div>
        </CardHeader>
        <CardContent className="space-y-3">
          {err ? <div className="text-sm text-rose-700">{err}</div> : null}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input placeholder="Anzeigename (z.B. Backhaus, Gero)" value={display} onChange={(e) => setDisplay(e.target.value)} />
            <select
              className="h-10 rounded border border-slate-300 bg-white px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="aussendienst">Aussendienst</option>
              <option value="admin">Admin</option>
            </select>
            <Button onClick={invite} disabled={!canInvite || busy}>
              {busy ? "Sende…" : "Invite senden"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="font-semibold">Vorhandene User</div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">E-Mail</th>
                  <th className="py-2 pr-3">Rolle</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="py-2 pr-3">{u.display_name}</td>
                    <td className="py-2 pr-3">{u.email}</td>
                    <td className="py-2 pr-3">{u.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
