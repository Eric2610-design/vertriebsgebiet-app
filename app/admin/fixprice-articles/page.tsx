"use client";

import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";

type FixMap = Record<string, { motor?: string; isFixprice: boolean }>;

export default function FixpriceArticlesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [byArticleNo, setByArticleNo] = useState<FixMap>({});
  const [stats, setStats] = useState<any>(null);

  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/settings?key=fixprice_articles", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        const v = j?.setting?.value ?? null;
        if (!alive) return;
        setByArticleNo((v?.byArticleNo ?? {}) as FixMap);
        setStats(v?.source ?? null);
      } catch {
        if (!alive) return;
        setByArticleNo({});
        setStats(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const items = useMemo(() => {
    const entries = Object.entries(byArticleNo || {});
    const q = search.trim();
    const filtered = q ? entries.filter(([k, v]) => k.includes(q) || String(v?.motor ?? "").toUpperCase().includes(q.toUpperCase())) : entries;
    return filtered
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 500); // UI guard
  }, [byArticleNo, search]);

  function setOne(art: string, patch: Partial<{ motor?: string; isFixprice: boolean }>) {
    setByArticleNo((prev) => ({
      ...prev,
      [art]: { ...(prev[art] ?? { isFixprice: false }), ...patch },
    }));
  }

  function remove(art: string) {
    setByArticleNo((prev) => {
      const copy: any = { ...prev };
      delete copy[art];
      return copy;
    });
  }

  function addEmpty() {
    const art = prompt("Artikelnummer (nur Ziffern):");
    if (!art) return;
    const a = art.trim();
    if (!/^\d+$/.test(a)) {
      setMsg("Artikelnummer muss nur aus Ziffern bestehen.");
      return;
    }
    setOne(a, { motor: "BOSCH", isFixprice: true });
    setMsg("Hinzugefügt (noch nicht gespeichert).");
  }

  async function saveManual() {
    setMsg("");
    setSaving(true);
    try {
      const payload = {
        version: 1,
        source: stats ?? { imported_at: null },
        byArticleNo,
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "fixprice_articles", value: payload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Speichern fehlgeschlagen");
      setMsg("Gespeichert.");
    } catch (e: any) {
      setMsg(e?.message ?? "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function importFromXlsx(file: File) {
    setMsg("");
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/fixprice/import", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Import fehlgeschlagen");

      const v = j?.setting?.value ?? null;
      setByArticleNo((v?.byArticleNo ?? {}) as FixMap);
      setStats(v?.source ?? null);
      setMsg(`Import OK: ${v?.source?.unique_articles ?? 0} Artikel.`);
    } catch (e: any) {
      setMsg(e?.message ?? "Fehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequireRole role="admin">
      <div className="mx-auto max-w-6xl p-4 md:p-8 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-2xl font-semibold">Fixpreise · Artikel</div>
            <div className="text-sm text-neutral-600">
              Fixpreis-Regel: Spalte E (Preisart) in der Tabelle EK_Schwellen/EK_Stammdaten ist <Badge>nicht leer</Badge> ⇒ Fixpreis/Sonderpreis. Leer ⇒ Normalpreis.
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={addEmpty}>+ Artikel</Button>
            <Button onClick={saveManual} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</Button>
          </div>
        </div>

        {msg ? (
          <Card>
            <CardContent className="py-3 text-sm">{msg}</CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Import aus Regeln und Schwellen.xlsx" />
          <CardContent className="flex flex-wrap gap-3 items-center">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFromXlsx(f);
              }}
            />
            <div className="text-sm text-neutral-600">
              Import schreibt nach <Badge>app_settings.fixprice_articles</Badge>.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Status" />
          <CardContent className="text-sm text-neutral-700 space-y-1">
            {loading ? (
              <div className="text-neutral-600">Lade…</div>
            ) : (
              <>
                <div>Artikel im Mapping: <Badge>{Object.keys(byArticleNo ?? {}).length}</Badge></div>
                {stats ? (
                  <div className="text-neutral-600">
                    Letzter Import: {stats.imported_at ? String(stats.imported_at) : "—"} · Sheet: {stats.sheet ?? "—"} · Datei: {stats.filename ?? "—"}
                  </div>
                ) : (
                  <div className="text-neutral-600">Noch kein Import.</div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Suche & Bearbeiten" />
          <CardContent className="space-y-3">
            <div className="flex gap-2 items-center">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Artikelnummer oder Motor (Bosch/Panasonic)..." className="max-w-sm" />
              <div className="text-xs text-neutral-500">(zeigt max. 500 Zeilen)</div>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="py-2 pr-2">Artikel</th>
                    <th className="py-2 pr-2">Motor</th>
                    <th className="py-2 pr-2">Fixpreis?</th>
                    <th className="py-2 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(([art, v]) => (
                    <tr key={art} className="border-t">
                      <td className="py-2 pr-2 font-mono">{art}</td>
                      <td className="py-2 pr-2">
                        <select
                          className="rounded-lg border px-2 py-1"
                          value={String(v?.motor ?? "")}
                          onChange={(e) => setOne(art, { motor: e.target.value })}
                        >
                          <option value="">—</option>
                          <option value="BOSCH">Bosch</option>
                          <option value="PANASONIC">Panasonic</option>
                          <option value="PINION">Pinion</option>
                          <option value="UNKNOWN">Unknown</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={!!v?.isFixprice}
                          onChange={(e) => setOne(art, { isFixprice: e.target.checked })}
                        />
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <Button variant="secondary" onClick={() => remove(art)}>Löschen</Button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 ? (
                    <tr>
                      <td className="py-4 text-sm text-neutral-600" colSpan={4}>Keine Treffer.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}
