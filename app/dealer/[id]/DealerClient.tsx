"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Input, Textarea, Badge } from "@/components/ui";

export default function DealerClient({ id }: { id: string }) {
  const [dealer, setDealer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [visitNote, setVisitNote] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/dealers/${id}`);
    const js = await res.json();
    setDealer(js);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/dealers/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dealer }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Speichern fehlgeschlagen");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function addVisit() {
    if (!visitNote.trim()) return;
    const res = await fetch(`/api/dealers/${id}/visits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: visitNote }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Besuch konnte nicht gespeichert werden");
    setVisitNote("");
    await load();
  }

  async function removeManufacturer(key: string) {
    if (!confirm(`Hersteller "${key}" wirklich entfernen?`)) return;
    const res = await fetch(`/api/dealers/${id}/manufacturers/${key}`, { method: "DELETE" });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Löschen fehlgeschlagen");
    await load();
  }

  async function deleteDealer() {
    if (!confirm("Händler wirklich löschen? (inkl. Besuche & Zuordnungen)")) return;
    const res = await fetch(`/api/dealers/${id}`, { method: "DELETE" });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Löschen fehlgeschlagen");
    window.location.href = "/map";
  }

  if (loading) return <div className="p-6 text-sm text-slate-600">Lade...</div>;
  if (!dealer?.dealer) return <div className="p-6 text-sm text-rose-600">Nicht gefunden</div>;

  const d = dealer.dealer;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{d.name}</h1>
          <p className="text-sm text-slate-600">{[d.street, `${d.zip ?? ""} ${d.city ?? ""}`].filter(Boolean).join(", ")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/map"><Button variant="secondary">Zur Karte</Button></Link>
          <Button variant="danger" onClick={deleteDealer}>Händler löschen</Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="text-sm font-semibold">Stammdaten (editierbar)</CardHeader>
          <CardContent className="space-y-3">
            <label className="text-xs text-slate-500">Name</label>
            <Input value={d.name ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, name:e.target.value}}))} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Straße</label>
                <Input value={d.street ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, street:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">PLZ</label>
                <Input value={d.zip ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, zip:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Ort</label>
                <Input value={d.city ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, city:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Land</label>
                <Input value={d.country ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, country:e.target.value}}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Telefon</label>
                <Input value={d.phone ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, phone:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">E-Mail</label>
                <Input value={d.email ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, email:e.target.value}}))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500">Webseite</label>
              <Input value={d.website ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, website:e.target.value}}))} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Öffnungszeiten</label>
              <Textarea rows={4} value={d.opening_hours ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, opening_hours:e.target.value}}))} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Interne Notiz</label>
              <Textarea rows={3} value={d.notes ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, notes:e.target.value}}))} />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>{saving ? "Speichere..." : "Speichern"}</Button>
            </div>
            <div className="text-xs text-slate-500">
              Geo-Status: <span className="font-medium">{d.geocode_status}</span> · lat/lng: {d.lat ?? "-"}, {d.lng ?? "-"}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="text-sm font-semibold">Hersteller</CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(dealer.manufacturers ?? []).map((m: any) => (
                  <span key={m.key} className="flex items-center gap-2">
                    <Badge tone={m.key==="flyer" ? "blue" : "slate"}>{m.key}</Badge>
                    <button className="text-xs text-rose-600 hover:underline" onClick={()=>removeManufacturer(m.key)}>
                      entfernen
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500">Hersteller löschen entfernt die Zuordnung, nicht den Händler.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-sm font-semibold">Besuche dokumentieren</CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={3} placeholder="Kurznotiz zum Besuch…" value={visitNote} onChange={(e)=>setVisitNote(e.target.value)} />
              <Button onClick={addVisit}>Besuch speichern</Button>
              <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
                {(dealer.visits ?? []).length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">Noch keine Besuche.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {(dealer.visits ?? []).map((v: any) => (
                      <li key={v.id} className="p-3">
                        <div className="text-xs text-slate-500">{new Date(v.created_at).toLocaleString("de-DE")}</div>
                        <div className="text-sm">{v.note}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-sm font-semibold">Quellen</CardHeader>
            <CardContent className="space-y-2">
              <div className="text-xs text-slate-500">Rohdaten-Zuordnungen pro Herstellerdatei.</div>
              <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
                <ul className="divide-y divide-slate-100">
                  {(dealer.sources ?? []).map((s: any) => (
                    <li key={s.id} className="p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <Badge tone={s.source==="flyer" ? "blue" : "slate"}>{s.source}</Badge>
                        <span className="text-xs text-slate-500">{s.external_id ?? ""}</span>
                      </div>
                      {s.source_url ? (
                        <a className="mt-2 block text-xs text-blue-700 underline" href={s.source_url} target="_blank" rel="noreferrer">
                          Quelle öffnen
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
