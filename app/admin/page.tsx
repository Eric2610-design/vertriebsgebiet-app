"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";
import { Pictogram } from "@/components/Pictogram";
import RequireRole from "@/components/RequireRole";

type SettingRow = { key: string; value: any; updated_at?: string };

export default function AdminPage() {
  const [months, setMonths] = useState<string>("18");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [manus, setManus] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await fetch("/api/auth/me", { cache: "no-store" });
        const mj = await me.json().catch(() => ({}));
        if (alive) setIsAdmin(!!mj?.is_admin);

        const res = await fetch(`/api/settings?key=flyer_active_threshold_months`, { cache: "no-store" });
        const j = await res.json();
        if (!alive) return;
        const row: SettingRow | null = j?.setting ?? null;
        const v = row?.value;
        if (typeof v === "number") setMonths(String(v));
        else if (typeof v === "string") setMonths(v);
        else if (v?.value !== undefined) setMonths(String(v.value));

        // Pictograms overview
        const [mRes, gRes] = await Promise.all([
          fetch("/api/manufacturers/list", { cache: "no-store" }),
          fetch("/api/buying-groups/list", { cache: "no-store" }),
        ]);
        const mJ = await mRes.json().catch(() => ({}));
        const gJ = await gRes.json().catch(() => ({}));
        if (alive) {
          setManus(mJ?.items ?? []);
          setGroups(gJ?.items ?? []);
        }
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

  async function loadPictograms() {
    try {
      const [mRes, gRes] = await Promise.all([
        fetch("/api/manufacturers/list", { cache: "no-store" }),
        fetch("/api/buying-groups/list", { cache: "no-store" }),
      ]);
      const mJ = await mRes.json();
      const gJ = await gRes.json();
      setManus(mJ.items || []);
      setGroups(gJ.items || []);
    } catch {
      setManus([]);
      setGroups([]);
    }
  }

  async function upload(kind: "manufacturer" | "buying_group", key: string, file: File) {
    const reader = new FileReader();
    const dataUrl: string = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Lesen fehlgeschlagen"));
      reader.readAsDataURL(file);
    });

    const res = await fetch("/api/pictograms/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, key, data_url: dataUrl }),
    });
    const js = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(js?.error || "Upload fehlgeschlagen");
    await loadPictograms();
  }

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
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-semibold">Admin</h1>
            <p className="text-slate-600 text-sm">Zentrale Verwaltung & Einstellungen.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold">Import</div>
              <div className="text-xs text-slate-600 mt-1">Dateien hochladen & Daten aktualisieren.</div>
              <Link href="/import"><Button className="mt-3" variant="secondary">Öffnen</Button></Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold">Cleanup</div>
              <div className="text-xs text-slate-600 mt-1">Duplikate prüfen & zusammenführen.</div>
              <Link href="/admin/cleanup"><Button className="mt-3" variant="secondary">Öffnen</Button></Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold">Einkaufsverbände</div>
              <div className="text-xs text-slate-600 mt-1">Anlegen, löschen, Händler zuordnen.</div>
              <Link href="/admin/buying-groups"><Button className="mt-3" variant="secondary">Öffnen</Button></Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold">Ohne Geodaten</div>
              <div className="text-xs text-slate-600 mt-1">PLZ-sortiert · Vorschläge · Merge wie Einkaufsverband.</div>
              <Link href="/admin/geo-merge"><Button className="mt-3" variant="secondary">Öffnen</Button></Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold">Geo-Merge Übersicht</div>
              <div className="text-xs text-slate-600 mt-1">Wie viele Merges · normal vs. force · Liste.</div>
              <Link href="/admin/geo-merge/overview"><Button className="mt-3" variant="secondary">Öffnen</Button></Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold">Ordertool · Einstellungen</div>
              <div className="text-xs text-slate-600 mt-1">Globale Bestellmengen & Quellen-Spalten.</div>
              <Link href="/admin/ordertool-settings"><Button className="mt-3" variant="secondary">Öffnen</Button></Link>
            </CardContent>
          </Card>
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

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Hersteller-Pictogramme</div>
              <div className="text-sm text-slate-600">Fehlende Icons hochladen (nur Admin).</div>
            </div>
            <Badge>{manus.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {manus.length ? (
              manus.map((m) => (
                <div key={m.key} className="flex items-center justify-between gap-3 rounded-xl border p-2">
                  <div className="flex items-center gap-2">
                    <Pictogram kind="manufacturer" k={m.key} label={m.label} dataUrl={m.icon_data_url} size={22} />
                    <div>
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-xs text-slate-600">Key: {m.key}</div>
                    </div>
                  </div>
                  {isAdmin ? (
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          await upload("manufacturer", m.key, f);
                        } catch (err: any) {
                          alert(err?.message || "Upload fehlgeschlagen");
                        } finally {
                          e.target.value = "";
                        }
                      }}
                    />
                  ) : null}
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-600">Keine Hersteller vorhanden.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Einkaufsverbände-Pictogramme</div>
              <div className="text-sm text-slate-600">Fehlende Icons hochladen (nur Admin).</div>
            </div>
            <Badge>{groups.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {groups.length ? (
              groups.map((g) => (
                <div key={g.key} className="flex items-center justify-between gap-3 rounded-xl border p-2">
                  <div className="flex items-center gap-2">
                    <Pictogram kind="buying_group" k={g.key} label={g.label} dataUrl={g.icon_data_url} size={22} />
                    <div>
                      <div className="text-sm font-medium">{g.label}</div>
                      <div className="text-xs text-slate-600">Key: {g.key}</div>
                    </div>
                  </div>
                  {isAdmin ? (
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          await upload("buying_group", g.key, f);
                        } catch (err: any) {
                          alert(err?.message || "Upload fehlgeschlagen");
                        } finally {
                          e.target.value = "";
                        }
                      }}
                    />
                  ) : null}
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-600">Keine Einkaufsverbände vorhanden.</div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </RequireRole>
  );
}
