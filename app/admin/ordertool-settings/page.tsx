"use client";

import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";
import { Button, Card, CardContent, CardHeader, Input } from "@/components/ui";

type SettingRow = { key: string; value: any; updated_at?: string };

export default function OrdertoolSettingsPage() {
  const [maxQty, setMaxQty] = useState<string>("20");
  const [freeStockColumn, setFreeStockColumn] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [stockMsg, setStockMsg] = useState<string | null>(null);
  const [stockUploading, setStockUploading] = useState(false);
  const [lastStockUpdate, setLastStockUpdate] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [maxRes, freeRes] = await Promise.all([
          fetch("/api/settings?key=ordertool_max_qty", { cache: "no-store" }),
          fetch("/api/settings?key=ordertool_free_stock_column", { cache: "no-store" }),
        ]);
        const maxJson = await maxRes.json().catch(() => ({}));
        const freeJson = await freeRes.json().catch(() => ({}));
        if (!alive) return;
        const maxRow: SettingRow | null = maxJson?.setting ?? null;
        const freeRow: SettingRow | null = freeJson?.setting ?? null;
        const maxVal = maxRow?.value;
        if (typeof maxVal === "number") setMaxQty(String(maxVal));
        else if (typeof maxVal === "string" && maxVal.trim()) setMaxQty(maxVal.trim());
        const freeVal = freeRow?.value;
        if (typeof freeVal === "string") setFreeStockColumn(freeVal);

        const stockRes = await fetch("/api/ordertool/data?market=DE_AT", { cache: "no-store" });
        const stockJson = await stockRes.json().catch(() => ({}));
        if (alive && stockJson?.updatedAt) setLastStockUpdate(stockJson.updatedAt);
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

  const maxQtyNum = useMemo(() => {
    const n = parseInt(maxQty, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [maxQty]);

  async function save() {
    setMsg(null);
    if (!Number.isFinite(maxQtyNum) || maxQtyNum < 1 || maxQtyNum > 999) {
      setMsg("Bitte eine Zahl zwischen 1 und 999 eingeben.");
      return;
    }
    setSaving(true);
    try {
      const payloads = [
        { key: "ordertool_max_qty", value: maxQtyNum },
        { key: "ordertool_free_stock_column", value: freeStockColumn.trim() },
      ];
      const results = await Promise.all(payloads.map((payload) =>
        fetch("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      ));
      const failed = results.find((res) => !res.ok);
      if (failed) {
        const j = await failed.json().catch(() => ({}));
        throw new Error(j?.error ?? "Speichern fehlgeschlagen");
      }
      setMsg("Gespeichert.");
    } catch (e: any) {
      setMsg(e?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function uploadStock(file: File) {
    setStockUploading(true);
    setStockMsg(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/ordertool/stock", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Upload fehlgeschlagen");
      setLastStockUpdate(json?.updatedAt ?? null);
      setStockMsg("Lagerbestand aktualisiert.");
    } catch (e: any) {
      setStockMsg(e?.message ?? "Upload fehlgeschlagen");
    } finally {
      setStockUploading(false);
    }
  }

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <div className="mx-auto max-w-4xl p-4 md:p-8 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Ordertool · Einstellungen</h1>
          <p className="text-sm text-slate-600">
            Globale Vorgaben für die Bestellmengen und die Zuordnung der frei verfügbaren Bestände.
          </p>
        </div>

        <Card>
          <CardHeader className="text-sm font-semibold">Globale Menge je Artikel</CardHeader>
          <CardContent className="space-y-2">
            <label className="text-xs text-slate-500">Maximalmenge pro Artikelnummer</label>
            <div className="flex flex-wrap items-end gap-2">
              <Input
                className="w-40"
                value={maxQty}
                onChange={(e) => setMaxQty(e.target.value)}
                placeholder="20"
              />
              <Button onClick={save} disabled={saving || loading}>
                {saving ? "Speichert…" : "Speichern"}
              </Button>
            </div>
            <div className="text-xs text-slate-500">
              Diese Menge gilt global und begrenzt die Eingabe im Ordertool zusätzlich zur Verfügbarkeit inkl. Produktion.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Freier verfügbarer Bestand</CardHeader>
          <CardContent className="space-y-2">
            <label className="text-xs text-slate-500">Spaltenname in der Quelle</label>
            <Input
              value={freeStockColumn}
              onChange={(e) => setFreeStockColumn(e.target.value)}
              placeholder="Freier verfügbarer Bestand"
            />
            <div className="text-xs text-slate-500">
              Der Generator nutzt diese Spalte für den aktuell freien Bestand (leer lassen = automatische Erkennung).
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Lagerbestandsdatei (aktuell)</CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs text-slate-500">
              Zuletzt aktualisiert: {lastStockUpdate ? new Date(lastStockUpdate).toLocaleString() : "—"}
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.xlsm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadStock(f);
              }}
            />
            {stockMsg ? <div className="text-xs text-slate-700">{stockMsg}</div> : null}
            <Button disabled={stockUploading} onClick={save}>
              {stockUploading ? "Lade…" : "Einstellungen speichern"}
            </Button>
          </CardContent>
        </Card>

        {msg ? <div className="text-sm text-slate-700">{msg}</div> : null}
      </div>
    </RequireRole>
  );
}
