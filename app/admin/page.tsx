"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";
import { Pictogram } from "@/components/Pictogram";
import RequireRole from "@/components/RequireRole";

type SettingRow = { key: string; value: any; updated_at?: string };
type AttributeRule = {
  attribute: string;
  match: string;
  minQty: number;
  factor: number;
  active: boolean;
};
type AttributeRuleSettings = {
  version: number;
  rules: AttributeRule[];
};


export default function AdminPage() {
  const [months, setMonths] = useState<string>("18");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [manus, setManus] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [attributes, setAttributes] = useState<Record<string, string[]>>({});
  const [attributeRules, setAttributeRules] = useState<AttributeRule[]>([]);
  const [rulesMsg, setRulesMsg] = useState<string>("");
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);

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

        if (alive) setRulesLoading(true);
        const rulesRes = await fetch("/api/ordertool/data", { cache: "no-store" });
        const rulesJson = await rulesRes.json().catch(() => ({}));
        if (alive) {
          setAttributes(rulesJson?.attributes ?? {});
          setAttributeRules(rulesJson?.rules ?? []);
          setRulesLoading(false);
        }
      } catch {
        // ignore
      } finally {
        if (alive) {
          setLoading(false);
          setRulesLoading(false);
        }
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

  function updateRule(idx: number, patch: Partial<AttributeRule>) {
    setAttributeRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRule(idx: number) {
    setAttributeRules((prev) => prev.filter((_, i) => i !== idx));
  }

  function addRule() {
    const nextAttribute = Object.keys(attributes)[0] ?? "motor";
    const nextMatch = attributes[nextAttribute]?.[0] ?? "";
    setAttributeRules((prev) => [
      ...prev,
      { attribute: nextAttribute, match: nextMatch, minQty: 10, factor: 2.5, active: true },
    ]);
  }

  async function saveRules() {
    setRulesMsg("");
    setRulesSaving(true);
    try {
      const payload: AttributeRuleSettings = {
        version: 1,
        rules: attributeRules.map((r) => ({
          ...r,
          minQty: Number.isFinite(Number(r.minQty)) ? Math.max(1, Math.floor(Number(r.minQty))) : 1,
          factor: Number.isFinite(Number(r.factor)) ? Number(r.factor) : 1,
          active: !!r.active,
        })),
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "ordertool_attribute_rules_v1", value: payload }),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen.");
      setRulesMsg("Gespeichert.");
    } catch (e: any) {
      setRulesMsg(e?.message ?? "Speichern fehlgeschlagen.");
    } finally {
      setRulesSaving(false);
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

      <Card className="mt-6">
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="font-medium">Ordertool: Attribut-Regeln</div>
            <div className="text-sm text-slate-600">
              Wenn Attribut X = Y, dann gelten Schwellen/Kalkulationen Z.
            </div>
          </div>
          <Badge className="ml-3">{rulesLoading ? "lädt…" : "bereit"}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={addRule}>
              + Regel
            </Button>
            <Button onClick={saveRules} disabled={rulesSaving}>
              {rulesSaving ? "Speichert…" : "Speichern"}
            </Button>
          </div>

          <div className="space-y-2">
            {attributeRules.length ? (
              attributeRules.map((rule, idx) => {
                const values = attributes[rule.attribute] ?? [];
                return (
                  <div key={`${rule.attribute}-${idx}`} className="rounded-xl border p-3 space-y-2">
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="min-w-[160px]">
                        <label className="text-xs text-slate-500">Attribut</label>
                        <Select
                          value={rule.attribute}
                          onChange={(e) =>
                            updateRule(idx, {
                              attribute: e.target.value,
                              match: attributes[e.target.value]?.[0] ?? "",
                            })
                          }
                        >
                          {Object.keys(attributes).map((attr) => (
                            <option key={attr} value={attr}>
                              {attr}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="min-w-[200px]">
                        <label className="text-xs text-slate-500">Wert</label>
                        <Select value={rule.match} onChange={(e) => updateRule(idx, { match: e.target.value })}>
                          <option value="">Wert wählen…</option>
                          {values.map((val) => (
                            <option key={val} value={val}>
                              {val}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="w-32">
                        <label className="text-xs text-slate-500">Mindestmenge</label>
                        <Input
                          type="number"
                          min={1}
                          value={rule.minQty}
                          onChange={(e) => updateRule(idx, { minQty: Number(e.target.value) })}
                        />
                      </div>

                      <div className="w-32">
                        <label className="text-xs text-slate-500">Kalkulation</label>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          value={rule.factor}
                          onChange={(e) => updateRule(idx, { factor: Number(e.target.value) })}
                        />
                      </div>

                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={rule.active}
                          onChange={(e) => updateRule(idx, { active: e.target.checked })}
                        />
                        aktiv
                      </label>

                      <Button variant="secondary" onClick={() => removeRule(idx)}>
                        Entfernen
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-slate-600">Noch keine Regeln vorhanden.</div>
            )}
          </div>

          {rulesMsg ? <div className="text-sm text-slate-700">{rulesMsg}</div> : null}
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
