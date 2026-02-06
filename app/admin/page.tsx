"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";

type SettingRow = { key: string; value: any; updated_at?: string };

export default function AdminPage() {
  const [months, setMonths] = useState<string>("18");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/settings?key=flyer_active_threshold_months`, { cache: "no-store" });
        const j = await res.json();
        if (!alive) return;
        const row: SettingRow | null = j?.setting ?? null;
        const v = row?.value;
        if (typeof v === "number") setMonths(String(v));
        else if (typeof v === "string") setMonths(v);
        else if (v?.value !== undefined) setMonths(String(v.value));
      } catch {
        // ignore
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const monthsNum = useMemo(() => {
    const n = parseInt(months, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [months]);

  async function save() {
    setMsg("");
    if (!Number.isFinite(monthsNum) || monthsNum < 1 || monthsNum > 120) {
      setMsg("Bitte eine Zahl zwischen 1 und 120 eingeben.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "flyer_active_threshold_months", value: monthsNum }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Speichern fehlgeschlagen");
      setMsg("Gespeichert.");
    } catch (e: any) {
      setMsg(e?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Admin</h1>
          <p className="text-slate-600 text-sm">Einstellungen für Import-Logik und Anzeige.</p>
        </div>
        <Link href="/map" className="text-sm text-blue-600 hover:underline">
          Zur Karte
        </Link>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="font-medium">Flyer-Status: Aktiv-Schwelle</div>
            <div className="text-sm text-slate-600">
              Wenn ein Händler nur Rechnungen hat, wird bei der Klärliste „aktiv“ vorgeschlagen, wenn die letzte Rechnung jünger als diese Monate ist.
            </div>
          </div>
          <Badge className="ml-3">{loading ? "lädt…" : "bereit"}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="w-40">
              <label className="text-sm text-slate-700">Monate</label>
              <Input value={months} onChange={(e) => setMonths(e.target.value)} placeholder="18" />
            </div>
            <Button onClick={save} disabled={saving || loading}>
              {saving ? "Speichert…" : "Speichern"}
            </Button>
          </div>
          {msg ? <div className="text-sm text-slate-700">{msg}</div> : null}

          <div className="text-xs text-slate-500">
            Hinweis: Diese Einstellung beeinflusst nur den Vorschlag in der Import-Klärliste. Du kannst jeden Händler dort trotzdem manuell auf aktiv/ehemalig/ignorieren setzen.
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
