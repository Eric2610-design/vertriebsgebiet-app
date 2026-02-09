"use client";

import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";
import { Card, CardContent, CardHeader, Badge, Button, Input, Select } from "@/components/ui";

type Profile = {
  id: string;
  display_name: string | null;
  email: string;
  role: string;
};

type Territory = {
  id?: string;
  profile_email: string;
  country: string;
  plz2_from: number;
  plz2_to: number;
};

type ApiPayload = {
  profiles: Profile[];
  territories: Territory[];
};

const COUNTRIES = ["DE", "AT", "CH"] as const;

function clampPlz2(v: string): number {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, n));
}

function sortRanges(r: Territory[]) {
  return [...r].sort((a, b) => {
    if (a.country !== b.country) return a.country.localeCompare(b.country);
    if (a.plz2_from !== b.plz2_from) return a.plz2_from - b.plz2_from;
    return a.plz2_to - b.plz2_to;
  });
}

export default function TerritoriesPage() {
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [openEmail, setOpenEmail] = useState<string | null>(null);

  const territoriesByEmail = useMemo(() => {
    const map = new Map<string, Territory[]>();
    for (const t of territories) {
      const arr = map.get(t.profile_email) ?? [];
      arr.push(t);
      map.set(t.profile_email, arr);
    }
    for (const [k, v] of map.entries()) map.set(k, sortRanges(v));
    return map;
  }, [territories]);

  const reps = useMemo(() => {
    // Nur reps/admin/superadmin anzeigen, aber Admins dürfen auch Gebiete haben.
    return [...profiles]
      .filter((p) => !!p.email)
      .sort((a, b) => (a.display_name ?? a.email).localeCompare(b.display_name ?? b.email));
  }, [profiles]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/reps/list", { cache: "no-store" });
        const j = (await res.json()) as ApiPayload & { error?: string };
        if (!res.ok) throw new Error(j?.error ?? "Konnte AD-Liste nicht laden.");
        setProfiles(j.profiles ?? []);
        setTerritories(j.territories ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Fehler beim Laden.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function updateRange(email: string, idx: number, patch: Partial<Territory>) {
    setTerritories((prev) => {
      const next = [...prev];
      const indexes = next
        .map((t, i) => ({ t, i }))
        .filter((x) => x.t.profile_email === email)
        .map((x) => x.i);

      const targetIndex = indexes[idx];
      if (targetIndex == null) return prev;

      next[targetIndex] = { ...next[targetIndex], ...patch };
      return next;
    });
  }

  function addRange(email: string) {
    setTerritories((prev) => [
      ...prev,
      {
        profile_email: email,
        country: "DE",
        plz2_from: 0,
        plz2_to: 99,
      },
    ]);
    setOpenEmail(email);
  }

  function removeRange(email: string, idx: number) {
    setTerritories((prev) => {
      const next = [...prev];
      const indexes = next
        .map((t, i) => ({ t, i }))
        .filter((x) => x.t.profile_email === email)
        .map((x) => x.i);

      const targetIndex = indexes[idx];
      if (targetIndex == null) return prev;
      next.splice(targetIndex, 1);
      return next;
    });
  }

  async function saveEmail(email: string) {
    try {
      setSavingEmail(email);
      setError(null);

      const current = (territoriesByEmail.get(email) ?? []).map((t) => ({
        profile_email: email,
        country: COUNTRIES.includes(t.country as any) ? t.country : "DE",
        plz2_from: Math.max(0, Math.min(99, Number(t.plz2_from) || 0)),
        plz2_to: Math.max(0, Math.min(99, Number(t.plz2_to) || 0)),
      }));

      // leichte Validierung
      for (const t of current) {
        if (t.plz2_from > t.plz2_to) {
          throw new Error(`Ungültiger Bereich ${t.country} ${t.plz2_from}–${t.plz2_to} (von > bis).`);
        }
      }

      const res = await fetch("/api/reps/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ territories: current }),
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Speichern fehlgeschlagen.");

      // nach dem Speichern neu laden, damit DB-Quelle maßgeblich ist
      const reload = await fetch("/api/reps/list", { cache: "no-store" });
      const rj = await reload.json();
      if (reload.ok) {
        setProfiles(rj.profiles ?? []);
        setTerritories(rj.territories ?? []);
      }
    } catch (e: any) {
      setError(e?.message ?? "Fehler beim Speichern.");
    } finally {
      setSavingEmail(null);
    }
  }

  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Vertriebsgebiete</h1>
            <p className="text-slate-600 text-sm">
              PLZ-2 Bereiche (00–99) pro Außendienstler pflegen. Änderungen wirken sofort in „Mein Gebiet“.
            </p>
          </div>
          <Badge tone="blue">{reps.length} Nutzer</Badge>
        </div>

        {error ? (
          <Card className="border-rose-200">
            <CardHeader>
              <div className="font-medium text-rose-700">Fehler</div>
            </CardHeader>
            <CardContent className="text-sm text-rose-700">{error}</CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="font-medium">Außendienstler & Gebiete</div>
              <div className="text-sm text-slate-600">Klick auf einen AD öffnet die Detailansicht (Accordion).</div>
            </div>
            {loading ? <Badge>lädt…</Badge> : <Badge tone="emerald">bereit</Badge>}
          </CardHeader>

          <CardContent className="space-y-3">
            {reps.map((p) => {
              const email = p.email;
              const ranges = territoriesByEmail.get(email) ?? [];
              const isOpen = openEmail === email;
              const label = p.display_name?.trim() ? `${p.display_name}` : email;
              const sub = `${email} • ${p.role ?? "rep"} • ${ranges.length} Bereiche`;

              return (
                <div key={email} className="border border-slate-100 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenEmail((cur) => (cur === email ? null : email))}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-slate-50"
                  >
                    <div className="text-left">
                      <div className="font-medium">{label}</div>
                      <div className="text-xs text-slate-600">{sub}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {ranges.length ? <Badge tone="slate">{ranges.length}</Badge> : <Badge tone="amber">kein Gebiet</Badge>}
                      <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="px-4 pb-4 bg-white">
                      <div className="flex items-center justify-between gap-2 mt-2 mb-3">
                        <Button type="button" variant="secondary" onClick={() => addRange(email)}>
                          + Bereich
                        </Button>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => saveEmail(email)}
                            disabled={savingEmail === email}
                          >
                            {savingEmail === email ? "Speichert…" : "Speichern"}
                          </Button>
                        </div>
                      </div>

                      {ranges.length ? (
                        <div className="space-y-2">
                          {ranges.map((t, idx) => (
                            <div key={`${email}-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-slate-100 rounded-xl p-3">
                              <div className="md:col-span-3">
                                <div className="text-xs text-slate-600 mb-1">Land</div>
                                <Select
                                  value={t.country}
                                  onChange={(e) => updateRange(email, idx, { country: e.target.value })}
                                >
                                  {COUNTRIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </Select>
                              </div>

                              <div className="md:col-span-3">
                                <div className="text-xs text-slate-600 mb-1">PLZ-2 von</div>
                                <Input
                                  type="number"
                                  min={0}
                                  max={99}
                                  value={t.plz2_from}
                                  onChange={(e) => updateRange(email, idx, { plz2_from: clampPlz2(e.target.value) })}
                                />
                              </div>

                              <div className="md:col-span-3">
                                <div className="text-xs text-slate-600 mb-1">PLZ-2 bis</div>
                                <Input
                                  type="number"
                                  min={0}
                                  max={99}
                                  value={t.plz2_to}
                                  onChange={(e) => updateRange(email, idx, { plz2_to: clampPlz2(e.target.value) })}
                                />
                              </div>

                              <div className="md:col-span-3 flex items-center justify-end gap-2">
                                <Button type="button" variant="danger" onClick={() => removeRange(email, idx)}>
                                  Entfernen
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-600 border border-slate-100 rounded-xl p-3">
                          Noch keine Gebiete. Klick „+ Bereich“ und speichere anschließend.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </main>
    </RequireRole>
  );
}
