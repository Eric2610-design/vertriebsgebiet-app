"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Badge, Input, Textarea } from "@/components/ui";

type Summary = {
  profile: { display_name: string; email: string; role: string } | null;
  territories: Array<{ country: string; plz2_from: number; plz2_to: number }>;
  dealers: Array<{ id: string; name: string; zip: string | null; city: string | null; last_visit_at: string | null }>;
  timeline: Array<{ id: string; created_at: string; note: string; dealer: { id: string; name: string; zip: string | null; city: string | null } | null }>;
};

type DemoBike = {
  id: string;
  model: string;
  serial: string | null;
  status: "available" | "in_use" | "service" | "lost";
  location_type: "dealer" | "warehouse";
  dealer_id: string | null;
  warehouse_name: string | null;
  notes: string | null;
  updated_at: string;
  dealer?: { name: string; zip: string | null; city: string | null } | null;
};

type Appointment = {
  id: string;
  dealer_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  with_whom: string | null;
  notes: string | null;
  status: "open" | "done" | "canceled";
  report: string | null;
  done_at: string | null;
  dealer?: { name: string; zip: string | null; city: string | null } | null;
};

function fmtRange(r: any) {
  return `${r.country} ${String(r.plz2_from).padStart(2, "0")}-${String(r.plz2_to).padStart(2, "0")}`;
}

function toDatetimeLocal(iso: string) {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return "";
  }
}

export default function RepClient({ email }: { email: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // placeholders
  const [lookbackDays, setLookbackDays] = useState<number>(90);

  // demo bikes
  const [bikes, setBikes] = useState<DemoBike[]>([]);
  const [bikesLoading, setBikesLoading] = useState(false);
  const [newBike, setNewBike] = useState({
    model: "",
    serial: "",
    status: "available" as DemoBike["status"],
    location_type: "warehouse" as DemoBike["location_type"],
    dealer_id: "",
    warehouse_name: "",
    notes: "",
  });

  // appointments
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [apptsLoading, setApptsLoading] = useState(false);
  const [newAppt, setNewAppt] = useState({
    dealer_id: "",
    title: "Termin",
    starts_at: "",
    with_whom: "",
    notes: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/reps/${encodeURIComponent(email)}/summary`, { cache: "no-store" });
        const js = await res.json();
        if (cancelled) return;
        setData(js);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function loadBikes() {
    setBikesLoading(true);
    try {
      const res = await fetch(`/api/reps/${encodeURIComponent(email)}/demo-bikes`, { cache: "no-store" });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Demo-Räder konnten nicht geladen werden");
      setBikes(js.items ?? []);
    } finally {
      setBikesLoading(false);
    }
  }

  async function loadAppointments() {
    setApptsLoading(true);
    try {
      const res = await fetch(`/api/reps/${encodeURIComponent(email)}/appointments`, { cache: "no-store" });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Termine konnten nicht geladen werden");
      setAppts(js.items ?? []);
    } finally {
      setApptsLoading(false);
    }
  }

  useEffect(() => {
    // load extra modules after summary exists (prevents requests for missing reps)
    if (!data?.profile) return;
    loadBikes();
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.profile?.email]);

  const dealersFiltered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = data?.dealers ?? [];
    if (!query) return list;
    return list.filter((d) => `${d.name} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase().includes(query));
  }, [data, q]);

  const territoryText = useMemo(() => {
    const ranges = data?.territories ?? [];
    if (!ranges.length) return "Keine Gebiete hinterlegt.";
    return ranges.map(fmtRange).join(" · ");
  }, [data]);

  const dealerOptions = useMemo(() => {
    const list = (data?.dealers ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [data]);

  async function addBike() {
    if (!newBike.model.trim()) return alert("Bitte Modell eingeben");
    const res = await fetch(`/api/reps/${encodeURIComponent(email)}/demo-bikes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: newBike.model.trim(),
        serial: newBike.serial.trim(),
        status: newBike.status,
        location_type: newBike.location_type,
        dealer_id: newBike.location_type === "dealer" ? (newBike.dealer_id || null) : null,
        warehouse_name: newBike.location_type === "warehouse" ? newBike.warehouse_name.trim() : "",
        notes: newBike.notes.trim(),
      }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Speichern fehlgeschlagen");
    setNewBike({ model: "", serial: "", status: "available", location_type: "warehouse", dealer_id: "", warehouse_name: "", notes: "" });
    await loadBikes();
  }

  async function updateBike(id: string, patch: Partial<DemoBike>) {
    const res = await fetch(`/api/reps/${encodeURIComponent(email)}/demo-bikes/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Update fehlgeschlagen");
    await loadBikes();
  }

  async function deleteBike(id: string) {
    if (!confirm("Demo-Rad wirklich löschen?")) return;
    const res = await fetch(`/api/reps/${encodeURIComponent(email)}/demo-bikes/${encodeURIComponent(id)}`, { method: "DELETE" });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Löschen fehlgeschlagen");
    await loadBikes();
  }

  async function addAppointment() {
    if (!newAppt.starts_at) return alert("Bitte Datum/Uhrzeit wählen");
    const res = await fetch(`/api/reps/${encodeURIComponent(email)}/appointments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dealer_id: newAppt.dealer_id || null,
        title: newAppt.title.trim() || "Termin",
        starts_at: newAppt.starts_at,
        with_whom: newAppt.with_whom.trim(),
        notes: newAppt.notes.trim(),
      }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Termin konnte nicht gespeichert werden");
    setNewAppt({ dealer_id: "", title: "Termin", starts_at: "", with_whom: "", notes: "" });
    await loadAppointments();
  }

  function patchApptLocal(id: string, patch: Partial<Appointment>) {
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function saveAppointment(appt: Appointment, status: "done" | "open") {
    const res = await fetch(`/api/reps/${encodeURIComponent(email)}/appointments/${encodeURIComponent(appt.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        report: appt.report ?? "",
        status,
      }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Speichern fehlgeschlagen");
    await loadAppointments();
  }

  async function deleteAppointment(id: string) {
    if (!confirm("Termin wirklich löschen?")) return;
    const res = await fetch(`/api/reps/${encodeURIComponent(email)}/appointments/${encodeURIComponent(id)}`, { method: "DELETE" });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Löschen fehlgeschlagen");
    await loadAppointments();
  }

  const upcoming = useMemo(() => {
    const now = Date.now();
    return (appts ?? [])
      .filter((a) => a.status !== "canceled")
      .slice()
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
      .filter((a) => new Date(a.starts_at).getTime() >= now - 1000 * 60 * 60 * 24 * 14) // show last 14d + upcoming
      .slice(0, 200);
  }, [appts]);

  if (loading) return <div className="p-6 text-sm text-slate-600">Lade...</div>;

  if (data?.profile == null) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="text-sm text-rose-600">Profil nicht gefunden.</div>
        <div className="mt-3"><Link href="/ad" className="text-blue-700 underline">Zurück</Link></div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.profile.display_name}</h1>
          <p className="text-sm text-slate-600">{email}</p>
          <p className="mt-1 text-xs text-slate-500">{territoryText}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ad"><Button variant="secondary">Zurück</Button></Link>
          <Link href="/map"><Button variant="secondary">Karte</Button></Link>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex items-start justify-between gap-2">
            <div className="text-sm font-semibold">Händler im Gebiet</div>
            <Badge tone={data.profile.role === "admin" ? "amber" : "slate"}>
              {data.profile.role === "admin" ? "Admin" : "AD"}
            </Badge>
          </CardHeader>
          <CardContent>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Händler suchen…" />
            <div className="mt-2 text-xs text-slate-500">Treffer: {dealersFiltered.length}</div>
            <div className="mt-2 max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-white">
              {dealersFiltered.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">Keine Händler.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {dealersFiltered.slice(0, 800).map((d) => (
                    <li key={d.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{d.name}</div>
                          <div className="text-xs text-slate-600">{`${d.zip ?? ""} ${d.city ?? ""}`.trim()}</div>
                          {d.last_visit_at ? (
                            <div className="mt-1 text-xs text-slate-500">Letzter Besuch: {new Date(d.last_visit_at).toLocaleDateString("de-DE")}</div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-500">Noch kein Besuch</div>
                          )}
                        </div>
                        <Link href={`/dealer/${d.id}`} className="text-xs text-blue-700 underline">Öffnen</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {dealersFiltered.length > 800 ? <div className="mt-2 text-xs text-slate-500">Liste gekürzt auf 800.</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Besuche (chronologisch)</CardHeader>
          <CardContent>
            <div className="text-xs text-slate-500">
              Besuche werden über Händler im Gebiet aggregiert (vorbereitet für spätere Login-Zuordnung).
            </div>
            <div className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-white">
              {(data.timeline ?? []).length === 0 ? (
                <div className="p-3 text-sm text-slate-500">Noch keine Besuche.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.timeline.slice(0, 1200).map((v) => (
                    <li key={v.id} className="p-3">
                      <div className="text-xs text-slate-500">{new Date(v.created_at).toLocaleString("de-DE")}</div>
                      {v.dealer ? (
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">{v.dealer.name}</div>
                          <Link href={`/dealer/${v.dealer.id}`} className="text-xs text-blue-700 underline">Details</Link>
                        </div>
                      ) : null}
                      <div className="mt-1 text-sm">{v.note}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {(data.timeline ?? []).length > 1200 ? <div className="mt-2 text-xs text-slate-500">Liste gekürzt auf 1200.</div> : null}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="text-sm font-semibold">Offene Aufträge & Rechnungen (Platzhalter)</CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="text-sm text-slate-700">
                Zeitraum:
                <select
                  className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={lookbackDays}
                  onChange={(e) => setLookbackDays(parseInt(e.target.value, 10))}
                >
                  <option value={30}>30 Tage</option>
                  <option value={90}>90 Tage</option>
                  <option value={180}>180 Tage</option>
                  <option value={365}>365 Tage</option>
                </select>
              </div>
              <div className="text-xs text-slate-500">
                Platzhalter – später werden hier echte FLYER-Aufträge & Rechnungen aus Upload-Dateien aggregiert.
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-700">Offene Aufträge (Beispiel)</div>
                <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                  <li>Gesamt offen (Demo): 14 · Zeitraum: letzte {lookbackDays} Tage</li>
                  <li>Kritisch (Demo): 3</li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-700">Rechnungen (Beispiel)</div>
                <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                  <li>Rechnungen (Demo): 52 · Zeitraum: letzte {lookbackDays} Tage</li>
                  <li>Summe (Demo): 128.450 €</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="text-sm font-semibold">Demo-Räder</CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <label className="text-xs text-slate-500">Modell</label>
                  <Input className="mt-1" value={newBike.model} onChange={(e) => setNewBike((s) => ({ ...s, model: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Rahmennr. (optional)</label>
                  <Input className="mt-1" value={newBike.serial} onChange={(e) => setNewBike((s) => ({ ...s, serial: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Status</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={newBike.status}
                    onChange={(e) => setNewBike((s) => ({ ...s, status: e.target.value as any }))}
                  >
                    <option value="available">verfügbar</option>
                    <option value="in_use">im Einsatz</option>
                    <option value="service">Service</option>
                    <option value="lost">verloren</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-500">Ort</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={newBike.location_type}
                    onChange={(e) => setNewBike((s) => ({ ...s, location_type: e.target.value as any }))}
                  >
                    <option value="warehouse">Eigenes Lager</option>
                    <option value="dealer">Händler</option>
                  </select>
                </div>

                {newBike.location_type === "dealer" ? (
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-500">Händler</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={newBike.dealer_id}
                      onChange={(e) => setNewBike((s) => ({ ...s, dealer_id: e.target.value }))}
                    >
                      <option value="">Bitte wählen…</option>
                      {dealerOptions.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-500">Lager (Bezeichnung)</label>
                    <Input className="mt-1" value={newBike.warehouse_name} onChange={(e) => setNewBike((s) => ({ ...s, warehouse_name: e.target.value }))} />
                  </div>
                )}

                <div className="md:col-span-3">
                  <label className="text-xs text-slate-500">Notiz (optional)</label>
                  <Input className="mt-1" value={newBike.notes} onChange={(e) => setNewBike((s) => ({ ...s, notes: e.target.value }))} />
                </div>
              </div>
              <div className="mt-3">
                <Button onClick={addBike}>Demo-Rad hinzufügen</Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              {bikesLoading ? (
                <div className="p-3 text-sm text-slate-500">Lade…</div>
              ) : bikes.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">Noch keine Demo-Räder.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {bikes.map((b) => (
                    <li key={b.id} className="p-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-semibold">{b.model} {b.serial ? <span className="text-xs text-slate-500">· {b.serial}</span> : null}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge tone={b.status === "available" ? "blue" : b.status === "in_use" ? "amber" : "slate"}>
                              {b.status === "available" ? "verfügbar" : b.status === "in_use" ? "im Einsatz" : b.status}
                            </Badge>
                            <Badge tone="slate">
                              {b.location_type === "dealer"
                                ? `bei Händler: ${b.dealer?.name ?? "(unbekannt)"}`
                                : `Lager: ${b.warehouse_name ?? "(ohne)"}`}
                            </Badge>
                          </div>
                          {b.notes ? <div className="mt-1 text-sm text-slate-700">{b.notes}</div> : null}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" onClick={() => updateBike(b.id, { status: b.status === "available" ? "in_use" : "available" })}>
                            Toggle Status
                          </Button>
                          <Button variant="danger" onClick={() => deleteBike(b.id)}>Löschen</Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="text-sm font-semibold">Termine</CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">Händler</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={newAppt.dealer_id}
                    onChange={(e) => setNewAppt((s) => ({ ...s, dealer_id: e.target.value }))}
                  >
                    <option value="">(optional) – ohne Händler</option>
                    {dealerOptions.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Wann</label>
                  <Input className="mt-1" type="datetime-local" value={newAppt.starts_at} onChange={(e) => setNewAppt((s) => ({ ...s, starts_at: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Mit wem (optional)</label>
                  <Input className="mt-1" value={newAppt.with_whom} onChange={(e) => setNewAppt((s) => ({ ...s, with_whom: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Titel</label>
                  <Input className="mt-1" value={newAppt.title} onChange={(e) => setNewAppt((s) => ({ ...s, title: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Notiz (optional)</label>
                  <Input className="mt-1" value={newAppt.notes} onChange={(e) => setNewAppt((s) => ({ ...s, notes: e.target.value }))} />
                </div>
              </div>
              <div className="mt-3">
                <Button onClick={addAppointment}>Termin anlegen</Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              {apptsLoading ? (
                <div className="p-3 text-sm text-slate-500">Lade…</div>
              ) : upcoming.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">Noch keine Termine.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {upcoming.map((a) => (
                    <li key={a.id} className="p-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="flex-1">
                          <div className="text-xs text-slate-500">{new Date(a.starts_at).toLocaleString("de-DE")}</div>
                          <div className="mt-1 text-sm font-semibold">
                            {a.title}
                            {a.dealer ? <span className="ml-2 text-xs text-slate-600">· {a.dealer.name}</span> : null}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge tone={a.status === "done" ? "blue" : a.status === "canceled" ? "slate" : "amber"}>
                              {a.status === "done" ? "erledigt" : a.status === "canceled" ? "abgesagt" : "offen"}
                            </Badge>
                            {a.with_whom ? <Badge tone="slate">{a.with_whom}</Badge> : null}
                          </div>

                          {a.notes ? <div className="mt-2 text-sm text-slate-700">{a.notes}</div> : null}

                          <div className="mt-3">
                            <label className="text-xs text-slate-500">Bericht</label>
                            <Textarea
                              className="mt-1"
                              rows={3}
                              value={a.report ?? ""}
                              onChange={(e) => patchApptLocal(a.id, { report: e.target.value })}
                              placeholder="Kurzbericht…"
                            />
                            <div className="mt-2 flex gap-2">
                              <Button
                                onClick={() => {
                                  const cur = appts.find((x) => x.id === a.id) ?? a;
                                  if (!cur.report || !cur.report.trim()) return alert("Bitte erst Bericht eintragen, dann abhaken.");
                                  saveAppointment({ ...a, report: cur.report }, "done");
                                }}
                              >
                                Bericht speichern & abhaken
                              </Button>
                              {a.status === "done" ? (
                                <Button variant="secondary" onClick={() => saveAppointment(a, "open")}>Wieder öffnen</Button>
                              ) : null}
                              <Button variant="danger" onClick={() => deleteAppointment(a.id)}>Löschen</Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
