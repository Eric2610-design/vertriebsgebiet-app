"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Input, Textarea, Badge } from "@/components/ui";

type ManufacturerItem = { key: string; label: string };

type Contact = {
  id: string;
  role: "Geschaeftsfuehrer" | "Verkauf" | "Werkstatt" | "Buchhaltung" | "Sonstiges";
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

const CONTACT_ROLES: Array<{ value: Contact["role"]; label: string }> = [
  { value: "Geschaeftsfuehrer", label: "Geschäftsführer" },
  { value: "Verkauf", label: "Verkauf" },
  { value: "Werkstatt", label: "Werkstatt" },
  { value: "Buchhaltung", label: "Buchhaltung" },
  { value: "Sonstiges", label: "Sonstiges" },
];

export default function DealerClient({ id }: { id: string }) {
  const [dealer, setDealer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [allManufacturers, setAllManufacturers] = useState<ManufacturerItem[]>([]);

  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [newLabel, setNewLabel] = useState<string>("");
  const [newKey, setNewKey] = useState<string>("");

  const [visitNote, setVisitNote] = useState("");

  // Branch / merge helpers
  const [parentDealer, setParentDealer] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [parentQuery, setParentQuery] = useState("");
  const [parentSuggestions, setParentSuggestions] = useState<any[]>([]);

  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeSuggestions, setMergeSuggestions] = useState<any[]>([]);
  const [mergeSelected, setMergeSelected] = useState<Record<string, boolean>>({});

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newContact, setNewContact] = useState<{
    role: Contact["role"];
    name: string;
    email: string;
    phone: string;
  }>({ role: "Geschaeftsfuehrer", name: "", email: "", phone: "" });

  async function loadDealer() {
    const res = await fetch(`/api/dealers/${id}`, { cache: "no-store" });
    const js = await res.json();
    setDealer(js);
    setContacts(js?.contacts ?? []);

    const pd = js?.dealer?.parent_dealer_id;
    if (pd) {
      try {
        const r = await fetch(`/api/dealers/${pd}`, { cache: "no-store" });
        const pj = await r.json();
        setParentDealer(pj?.dealer ?? null);
      } catch {
        setParentDealer(null);
      }
    } else {
      setParentDealer(null);
    }

    // branches for this dealer as parent
    try {
      const br = await fetch(`/api/dealers/branches?parent_id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const bj = await br.json();
      setBranches(bj?.items ?? []);
    } catch {
      setBranches([]);
    }
  }

  async function loadManufacturers() {
    const res = await fetch("/api/manufacturers/list", { cache: "no-store" });
    const js = await res.json();
    setAllManufacturers(js.items ?? []);
  }

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([loadDealer(), loadManufacturers()]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const q = parentQuery.trim();
    if (q.length < 2) {
      setParentSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/dealers/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const js = await res.json();
      setParentSuggestions((js.items ?? []).filter((x: any) => x.id !== id));
    }, 250);
    return () => clearTimeout(t);
  }, [parentQuery, id]);

  useEffect(() => {
    const q = mergeQuery.trim();
    if (q.length < 2) {
      setMergeSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/dealers/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const js = await res.json();
      setMergeSuggestions((js.items ?? []).filter((x: any) => x.id !== id));
    }, 250);
    return () => clearTimeout(t);
  }, [mergeQuery, id]);

  const manufacturerLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of allManufacturers) m.set(it.key, it.label);
    return m;
  }, [allManufacturers]);

  const existingKeys = useMemo(() => {
    return new Set((dealer?.manufacturers ?? []).map((m: any) => m.key));
  }, [dealer]);

  const availableExisting = useMemo(() => {
    return allManufacturers.filter((m) => !existingKeys.has(m.key));
  }, [allManufacturers, existingKeys]);

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
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function addVisit() {
    if (!visitNote.trim()) return;
    const res = await fetch(`/api/dealers/${id}/visits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: visitNote.trim() }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Besuch konnte nicht gespeichert werden");
    setVisitNote("");
    await loadDealer();
  }

  async function removeManufacturer(key: string) {
    if (!confirm(`Hersteller "${key}" wirklich entfernen?`)) return;
    const res = await fetch(`/api/dealers/${id}/manufacturers/${encodeURIComponent(key)}`, { method: "DELETE" });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Löschen fehlgeschlagen");
    await loadDealer();
  }

  async function addManufacturer() {
    if (addMode === "existing") {
      const key = selectedKey.trim();
      if (!key) return;
      const res = await fetch(`/api/dealers/${id}/manufacturers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Hinzufügen fehlgeschlagen");
      setSelectedKey("");
      await loadDealer();
      return;
    }

    // new
    if (!newLabel.trim()) return alert("Bitte Hersteller-Name eingeben");
    const res = await fetch(`/api/dealers/${id}/manufacturers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: newKey.trim() || "__new__", label: newLabel.trim() }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Anlegen fehlgeschlagen");
    setNewLabel("");
    setNewKey("");
    await loadAll();
  }

  async function deleteDealer() {
    if (!confirm("Händler wirklich löschen? (inkl. Besuche & Zuordnungen)")) return;
    const res = await fetch(`/api/dealers/${id}`, { method: "DELETE" });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Löschen fehlgeschlagen");
    window.location.href = "/map";
  }

  async function setAsBranch(parentId: string | null) {
    // attach this dealer as a branch of parentId (or remove branch)
    setSaving(true);
    try {
      const res = await fetch(`/api/dealers/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dealer: {
            ...dealer.dealer,
            parent_dealer_id: parentId,
          },
        }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Speichern fehlgeschlagen");
      setParentQuery("");
      setParentSuggestions([]);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function runMerge() {
    const ids = Object.entries(mergeSelected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) return alert("Bitte mindestens einen Händler auswählen");
    if (!confirm(`Diese ${ids.length} Händler in "${dealer.dealer.name}" zusammenführen?\n\nWichtig: Merge ist nur möglich, wenn die Adresse exakt gleich ist.`)) return;
    const reason = "manual_dealer_page";
    const res = await fetch(`/api/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ master_id: id, merge_ids: ids, reason }),
    });
    const js = await res.json();
    if (!res.ok) return alert(js?.error ?? "Merge fehlgeschlagen");
    setMergeSelected({});
    setMergeQuery("");
    setMergeSuggestions([]);
    await loadAll();
  }

  function updateContactLocal(contactId: string, patch: Partial<Contact>) {
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, ...patch } : c)));
  }

  async function addContact() {
    if (!newContact.name.trim()) return alert("Bitte Name eingeben");
    const res = await fetch(`/api/dealers/${id}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: newContact.role,
        name: newContact.name.trim(),
        email: newContact.email.trim(),
        phone: newContact.phone.trim(),
      }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Kontakt konnte nicht gespeichert werden");
    setNewContact({ role: "Geschaeftsfuehrer", name: "", email: "", phone: "" });
    await loadDealer();
  }

  async function saveContact(contact: Contact) {
    const res = await fetch(`/api/dealers/${id}/contacts/${encodeURIComponent(contact.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: contact.role,
        name: contact.name,
        email: contact.email ?? "",
        phone: contact.phone ?? "",
      }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Kontakt konnte nicht aktualisiert werden");
    await loadDealer();
  }

  async function deleteContact(contactId: string) {
    if (!confirm("Kontakt wirklich löschen?")) return;
    const res = await fetch(`/api/dealers/${id}/contacts/${encodeURIComponent(contactId)}`, { method: "DELETE" });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error ?? "Kontakt konnte nicht gelöscht werden");
    await loadDealer();
  }

  if (loading) return <div className="p-6 text-sm text-slate-600">Lade...</div>;
  if (!dealer?.dealer) return <div className="p-6 text-sm text-rose-600">Nicht gefunden</div>;

  const d = dealer.dealer;
  const hasFlyer = (dealer?.manufacturers ?? []).some((m: any) => m.key === "flyer");

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
          <CardHeader className="text-sm font-semibold">Unternehmen / Filialen</CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Status</div>
              {d.parent_dealer_id ? (
                <div>
                  <div className="font-medium">Filiale</div>
                  <div className="text-xs text-slate-600">
                    Hauptfirma: {parentDealer?.name ?? d.parent_dealer_id}
                    {parentDealer?.id ? (
                      <> · <Link className="underline" href={`/dealer/${parentDealer.id}`}>öffnen</Link></>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-medium">Hauptfirma</div>
                  <div className="text-xs text-slate-600">Filialen: {branches.length}</div>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-500">Filialname (optional)</label>
              <Input
                value={d.branch_label ?? ""}
                onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, branch_label:e.target.value}}))}
                placeholder="z. B. Innenstadt, Werkstatt, Speyer"
              />
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" disabled={saving} onClick={save}>Speichern</Button>
                {d.parent_dealer_id ? (
                  <Button variant="secondary" disabled={saving} onClick={()=>setAsBranch(null)}>Als Hauptfirma setzen</Button>
                ) : null}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500">Als Filiale zuordnen (Hauptfirma suchen)</label>
              <Input value={parentQuery} onChange={(e)=>setParentQuery(e.target.value)} placeholder="Name suchen…" />
              {parentSuggestions.length > 0 ? (
                <div className="mt-2 max-h-48 overflow-auto rounded-xl border bg-white">
                  {parentSuggestions.slice(0, 15).map((p: any) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      onClick={() => setAsBranch(p.id)}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{[p.street, `${p.zip ?? ""} ${p.city ?? ""}`].filter(Boolean).join(", ")}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {branches.length > 0 ? (
              <div>
                <div className="text-xs text-slate-500">Filialen</div>
                <div className="mt-1 space-y-1">
                  {branches.slice(0, 10).map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
                      <div>
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs text-slate-500">{[b.branch_label, b.street, `${b.zip ?? ""} ${b.city ?? ""}`].filter(Boolean).join(" · ")}</div>
                      </div>
                      <Link className="underline text-sm" href={`/dealer/${b.id}`}>öffnen</Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

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
              <div>
                <label className="text-xs text-slate-500">Telefon</label>
                <Input value={d.phone ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, phone:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">E-Mail</label>
                <Input value={d.email ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, email:e.target.value}}))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Website</label>
                <Input value={d.website ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, website:e.target.value}}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Öffnungszeiten</label>
                <Input value={d.opening_hours ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, opening_hours:e.target.value}}))} />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500">Notizen</label>
              <Textarea value={d.notes ?? ""} onChange={(e)=>setDealer((s:any)=>({...s, dealer:{...s.dealer, notes:e.target.value}}))} rows={4} />
            </div>

            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>{saving ? "Speichere..." : "Speichern"}</Button>
              <Button variant="secondary" onClick={loadAll}>Neu laden</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Hersteller</CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(dealer.manufacturers ?? []).length === 0 ? (
                <span className="text-sm text-slate-500">Keine Hersteller zugeordnet.</span>
              ) : (
                (dealer.manufacturers ?? []).map((m: any) => (
                  <span key={m.key} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm">
                    <span>{manufacturerLabel.get(m.key) ?? m.key}</span>
                    <button className="text-xs text-slate-500 hover:text-rose-700" onClick={() => removeManufacturer(m.key)}>entfernen</button>
                  </span>
                ))
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-500">Hinzufügen</label>
                <div className="ml-auto flex gap-2 text-xs">
                  <button className={addMode === "existing" ? "font-semibold" : "text-slate-500"} onClick={() => setAddMode("existing")}>Dropdown</button>
                  <button className={addMode === "new" ? "font-semibold" : "text-slate-500"} onClick={() => setAddMode("new")}>Neu</button>
                </div>
              </div>

              {addMode === "existing" ? (
                <div className="mt-2 flex gap-2">
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={selectedKey}
                    onChange={(e) => setSelectedKey(e.target.value)}
                  >
                    <option value="">Hersteller wählen…</option>
                    {availableExisting.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                  <Button onClick={addManufacturer}>Hinzufügen</Button>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <Input placeholder="Hersteller-Name (z.B. Cannondale)" value={newLabel} onChange={(e)=>setNewLabel(e.target.value)} />
                  <Input placeholder="Key optional (z.B. cannondale)" value={newKey} onChange={(e)=>setNewKey(e.target.value)} />
                  <Button onClick={addManufacturer}>Anlegen & zuordnen</Button>
                  <div className="text-xs text-slate-500">Neue Hersteller stehen danach automatisch überall im Dropdown zur Verfügung.</div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">FLYER Rückstände & Rechnungen</div>
                <Badge tone={hasFlyer ? "blue" : "slate"}>{hasFlyer ? "FLYER" : "Platzhalter"}</Badge>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Platzhalter – später wird dieser Bereich nur angezeigt, wenn wirklich FLYER-Rechnungen/Offene Aufträge vorhanden sind.
              </div>
              <div className="mt-3 grid gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-700">Offene Aufträge (Beispiel)</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                    <li>Auftrag #TEST-001 · 2× Uproc X · fällig 15.03.2026</li>
                    <li>Auftrag #TEST-002 · 1× Goroc · fällig 02.04.2026</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-700">Rechnungen (Beispiel)</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                    <li>Rechnung #TEST-INV-11 · 12.01.2026 · 4.980 €</li>
                    <li>Rechnung #TEST-INV-12 · 29.01.2026 · 1.245 €</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Filialen & Dubletten</CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-semibold">Filiale / Hauptfirma</div>
              <div className="mt-2 text-xs text-slate-500">
                Gleicher Name aber andere Adresse? Dann ist das meistens eine Filiale. Hier kannst du den Händler als Filiale einer Hauptfirma zuordnen.
              </div>

              <div className="mt-3">
                <div className="text-xs text-slate-500">Aktuell</div>
                {d.parent_dealer_id ? (
                  <div className="mt-1 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2">
                    <div className="text-sm">
                      <div className="font-semibold">{parentDealer?.name ?? "Hauptfirma"}</div>
                      <div className="text-xs text-slate-500">{parentDealer ? [parentDealer.street, `${parentDealer.zip ?? ""} ${parentDealer.city ?? ""}`].filter(Boolean).join(", ") : d.parent_dealer_id}</div>
                    </div>
                    <div className="flex gap-2">
                      {parentDealer?.id && <Link href={`/dealer/${parentDealer.id}`}><Button variant="secondary">Öffnen</Button></Link>}
                      <Button variant="secondary" onClick={() => setAsBranch(null)}>Entfernen</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-slate-600">Dieser Händler ist aktuell keine Filiale.</div>
                )}
              </div>

              <div className="mt-3">
                <div className="text-xs text-slate-500">Als Filiale zuordnen…</div>
                <Input className="mt-1" placeholder="Hauptfirma suchen (mind. 2 Buchstaben)…" value={parentQuery} onChange={(e)=>setParentQuery(e.target.value)} />
                {parentSuggestions.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white">
                    {parentSuggestions.slice(0, 12).map((x:any) => (
                      <button
                        key={x.id}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => setAsBranch(x.id)}
                      >
                        <div className="font-semibold">{x.name}</div>
                        <div className="text-xs text-slate-500">{[x.street, `${x.zip ?? ""} ${x.city ?? ""}`].filter(Boolean).join(", ")}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <div className="text-xs text-slate-500">Filialen dieser Hauptfirma</div>
                {branches.length === 0 ? (
                  <div className="mt-1 text-sm text-slate-600">Keine Filialen zugeordnet.</div>
                ) : (
                  <div className="mt-2 grid gap-2">
                    {branches.map((b:any) => (
                      <Link key={b.id} href={`/dealer/${b.id}`} className="rounded-xl border border-slate-200 bg-white p-2 hover:bg-slate-50">
                        <div className="text-sm font-semibold">{b.branch_label ? `${b.name} · ${b.branch_label}` : b.name}</div>
                        <div className="text-xs text-slate-500">{[b.street, `${b.zip ?? ""} ${b.city ?? ""}`].filter(Boolean).join(", ")}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-semibold">Dubletten zusammenführen (nur wenn Adresse identisch ist)</div>
              <div className="mt-2 text-xs text-slate-500">
                Wenn derselbe Händler mehrfach importiert wurde (z.B. „Fahrrad Weindel“), kannst du hier die Dubletten in diesen Händler mergen. Merge wird serverseitig nur erlaubt, wenn Straße/PLZ/Ort/Land exakt übereinstimmen.
              </div>
              <Input className="mt-3" placeholder="Händler suchen…" value={mergeQuery} onChange={(e)=>setMergeQuery(e.target.value)} />

              {mergeSuggestions.length > 0 && (
                <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white">
                  {mergeSuggestions.slice(0, 20).map((x:any) => (
                    <label key={x.id} className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!!mergeSelected[x.id]}
                        onChange={(e)=>setMergeSelected((s)=>({ ...s, [x.id]: e.target.checked }))}
                      />
                      <div>
                        <div className="text-sm font-semibold">{x.name}</div>
                        <div className="text-xs text-slate-500">{[x.street, `${x.zip ?? ""} ${x.city ?? ""}`].filter(Boolean).join(", ")}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <Button onClick={runMerge}>In diesen Händler mergen</Button>
                <Button variant="secondary" onClick={()=>setMergeSelected({})}>Auswahl löschen</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Kontaktpersonen</CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">Rolle</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={newContact.role}
                    onChange={(e) => setNewContact((s) => ({ ...s, role: e.target.value as any }))}
                  >
                    {CONTACT_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Name</label>
                  <Input className="mt-1" value={newContact.name} onChange={(e) => setNewContact((s) => ({ ...s, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">E-Mail (optional)</label>
                  <Input className="mt-1" value={newContact.email} onChange={(e) => setNewContact((s) => ({ ...s, email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Telefon (optional)</label>
                  <Input className="mt-1" value={newContact.phone} onChange={(e) => setNewContact((s) => ({ ...s, phone: e.target.value }))} />
                </div>
              </div>
              <div className="mt-3">
                <Button onClick={addContact}>Kontakt hinzufügen</Button>
              </div>
            </div>

            <div className="max-h-[44vh] overflow-auto rounded-xl border border-slate-200 bg-white">
              {contacts.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">Noch keine Kontaktpersonen hinterlegt.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {contacts.map((c) => (
                    <li key={c.id} className="p-3">
                      <div className="grid gap-2 md:grid-cols-[160px_1fr_1fr_140px]">
                        <div>
                          <label className="text-xs text-slate-500">Rolle</label>
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            value={c.role}
                            onChange={(e) => updateContactLocal(c.id, { role: e.target.value as any })}
                          >
                            {CONTACT_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Name</label>
                          <Input className="mt-1" value={c.name} onChange={(e) => updateContactLocal(c.id, { name: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-slate-500">E-Mail</label>
                            <Input className="mt-1" value={c.email ?? ""} onChange={(e) => updateContactLocal(c.id, { email: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Telefon</label>
                            <Input className="mt-1" value={c.phone ?? ""} onChange={(e) => updateContactLocal(c.id, { phone: e.target.value })} />
                          </div>
                        </div>
                        <div className="flex items-end gap-2">
                          <Button variant="secondary" onClick={() => saveContact(c)}>Speichern</Button>
                          <Button variant="danger" onClick={() => deleteContact(c.id)}>Löschen</Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">Besuche</CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Textarea value={visitNote} onChange={(e)=>setVisitNote(e.target.value)} placeholder="Besuchsnotiz…" rows={3} />
              <Button onClick={addVisit}>Hinzufügen</Button>
            </div>

            <div className="max-h-[44vh] overflow-auto rounded-xl border border-slate-200 bg-white">
              {(dealer.visits ?? []).length === 0 ? (
                <div className="p-3 text-sm text-slate-500">Noch keine Besuche.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(dealer.visits ?? []).slice(0, 2000).map((v: any) => (
                    <li key={v.id} className="p-3">
                      <div className="text-xs text-slate-500">{new Date(v.created_at).toLocaleString("de-DE")}</div>
                      <div className="mt-1 text-sm">{v.note}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader className="text-sm font-semibold">Händler zusammenführen (nur bei identischer Adresse)</CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              Merge ist nur erlaubt, wenn Straße/PLZ/Ort/Land exakt gleich sind. Gleicher Name mit anderer Adresse ist i. d. R. eine Filiale.
            </div>
            <Input value={mergeQuery} onChange={(e)=>setMergeQuery(e.target.value)} placeholder="Händler suchen…" />
            {mergeSuggestions.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded-xl border bg-white">
                {mergeSuggestions.slice(0, 25).map((p: any) => (
                  <label key={p.id} className="flex items-start gap-2 px-3 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!mergeSelected[p.id]}
                      onChange={(e)=>setMergeSelected((s)=>({ ...s, [p.id]: e.target.checked }))}
                    />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{[p.street, `${p.zip ?? ""} ${p.city ?? ""}`].filter(Boolean).join(", ")}</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button onClick={runMerge}>In diesen Händler mergen</Button>
              <Button variant="secondary" onClick={() => { setMergeSelected({}); setMergeQuery(""); setMergeSuggestions([]); }}>Zurücksetzen</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
