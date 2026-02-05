"use client";

import { useMemo, useState } from "react";

export default function DealerClient({ dealer, manufacturers, allManufacturers, contacts, visits, invoices, orders }: any) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    name: dealer?.name ?? "",
    street: dealer?.street ?? "",
    zip: dealer?.zip ?? "",
    city: dealer?.city ?? "",
    country: dealer?.country ?? "",
  });

  const manKeys = useMemo(() => new Set((manufacturers ?? []).map((m:any)=>m.manufacturer_key)), [manufacturers]);
  const hasFlyer = manKeys.has("flyer");

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/dealers/${dealer.id}`, { method:"PATCH", headers:{ "content-type":"application/json"}, body: JSON.stringify(form) });
    const js = await res.json();
    setSaving(false);
    if (!res.ok) return alert(js?.error ?? "Fehler");
    location.reload();
  }

  async function addMan(key: string) {
    if (!key) return;
    setSaving(true);
    const res = await fetch(`/api/dealers/${dealer.id}/manufacturers/${key}`, { method:"POST" });
    const js = await res.json();
    setSaving(false);
    if (!res.ok) return alert(js?.error ?? "Fehler");
    location.reload();
  }

  async function removeMan(key: string) {
    if (!confirm("Hersteller entfernen?")) return;
    setSaving(true);
    const res = await fetch(`/api/dealers/${dealer.id}/manufacturers/${key}`, { method:"DELETE" });
    const js = await res.json();
    setSaving(false);
    if (!res.ok) return alert(js?.error ?? "Fehler");
    location.reload();
  }

  async function addManufacturerNew(name: string) {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    const res = await fetch("/api/manufacturers", { method:"POST", headers:{ "content-type":"application/json"}, body: JSON.stringify({ name: n })});
    const js = await res.json();
    setSaving(false);
    if (!res.ok) return alert(js?.error ?? "Fehler");
    await addMan(js.key);
  }

  async function addContact(payload: any) {
    setSaving(true);
    const res = await fetch(`/api/dealers/${dealer.id}/contacts`, { method:"POST", headers:{ "content-type":"application/json"}, body: JSON.stringify(payload) });
    const js = await res.json();
    setSaving(false);
    if (!res.ok) return alert(js?.error ?? "Fehler");
    location.reload();
  }

  async function addVisit(payload: any) {
    setSaving(true);
    const res = await fetch(`/api/dealers/${dealer.id}/visits`, { method:"POST", headers:{ "content-type":"application/json"}, body: JSON.stringify(payload) });
    const js = await res.json();
    setSaving(false);
    if (!res.ok) return alert(js?.error ?? "Fehler");
    location.reload();
  }

  return (
    <div className="card" style={{padding:16}}>
      <div style={{display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap"}}>
        <div>
          <div className="h1">{dealer?.name ?? "Händler"}</div>
          <div className="small">{[dealer?.street, [dealer?.zip, dealer?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
          <div style={{marginTop:8, display:"flex", gap:8, flexWrap:"wrap"}}>
            {hasFlyer ? <span className="badge">Flyer</span> : null}
            {(manufacturers ?? []).map((m:any)=>(
              <span key={m.manufacturer_key} className="badge">
                {m.manufacturers?.name ?? m.manufacturer_key}
                <button className="btn danger" style={{marginLeft:8, padding:"2px 8px"}} onClick={()=>removeMan(m.manufacturer_key)}>x</button>
              </span>
            ))}
          </div>
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <a className="btn" href="/map">Zur Karte</a>
          <button className="btn primary" disabled={saving} onClick={save}>Speichern</button>
        </div>
      </div>

      <div className="row" style={{marginTop:14}}>
        <div className="col">
          <div className="h2">Stammdaten</div>
          <div style={{marginTop:8, display:"grid", gap:8}}>
            {["name","street","zip","city","country"].map((k)=>(
              <input key={k} className="input" value={form[k] ?? ""} onChange={(e)=>setForm((p:any)=>({...p,[k]:e.target.value}))} placeholder={k} />
            ))}
          </div>

          <div style={{marginTop:14}}>
            <div className="h2">Hersteller hinzufügen</div>
            <div className="row" style={{marginTop:8}}>
              <select className="input" defaultValue="" onChange={(e)=>addMan(e.target.value)}>
                <option value="">— Hersteller wählen —</option>
                {allManufacturers.map((m:any)=>(
                  <option key={m.key} value={m.key} disabled={manKeys.has(m.key)}>{m.name} ({m.key})</option>
                ))}
              </select>
            </div>
            <div className="row" style={{marginTop:8}}>
              <input id="newman" className="input" placeholder="Neuer Hersteller-Name (z.B. Specialized)" />
              <button className="btn" onClick={()=>addManufacturerNew((document.getElementById("newman") as HTMLInputElement).value)}>Neu anlegen + zuweisen</button>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="h2">Kontaktpersonen</div>
          <ContactForm onAdd={addContact} />
          <div style={{marginTop:10, display:"grid", gap:8}}>
            {(contacts ?? []).map((c:any)=>(
              <div key={c.id} className="card" style={{padding:10, borderRadius:14}}>
                <div style={{fontWeight:800}}>{c.role}: {c.name}</div>
                <div className="small">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
            {!contacts?.length ? <div className="small">Noch keine Kontakte.</div> : null}
          </div>

          <div style={{marginTop:14}}>
            <div className="h2">Besuche</div>
            <VisitForm onAdd={addVisit} />
            <div style={{marginTop:10, display:"grid", gap:8}}>
              {(visits ?? []).map((v:any)=>(
                <div key={v.id} className="card" style={{padding:10, borderRadius:14}}>
                  <div style={{fontWeight:800}}>{v.visited_at} · {v.rep_email ?? "—"}</div>
                  <div className="small">{v.notes ?? ""}</div>
                </div>
              ))}
              {!visits?.length ? <div className="small">Noch keine Besuche.</div> : null}
            </div>
          </div>
        </div>
      </div>

      {/* Flyer-Rechnungen/Aufträge nur anzeigen wenn Flyer UND Daten vorhanden */}
      {hasFlyer && ((invoices?.length ?? 0) > 0 || (orders?.length ?? 0) > 0) ? (
        <div style={{marginTop:16}} className="card">
          <div style={{padding:12}}>
            <div className="h2">Flyer – Rechnungen & offene Aufträge (Platzhalter/Import später)</div>
            <div className="small">Dieser Bereich erscheint nur bei tatsächlichen Flyer-Daten.</div>
          </div>
          <div className="row" style={{padding:12}}>
            <div className="col">
              <div className="h2">Rechnungen ({invoices.length})</div>
              <table className="table" style={{marginTop:8}}>
                <thead><tr><th>Nr</th><th>Datum</th><th>Betrag</th></tr></thead>
                <tbody>
                  {invoices.slice(0,10).map((r:any)=>(
                    <tr key={r.id} className="tr"><td>{r.doc_no ?? ""}</td><td>{r.doc_date ?? ""}</td><td>{r.amount ?? ""}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="col">
              <div className="h2">Aufträge ({orders.length})</div>
              <table className="table" style={{marginTop:8}}>
                <thead><tr><th>Nr</th><th>Datum</th><th>Menge</th></tr></thead>
                <tbody>
                  {orders.slice(0,10).map((r:any)=>(
                    <tr key={r.id} className="tr"><td>{r.order_no ?? ""}</td><td>{r.order_date ?? ""}</td><td>{r.qty ?? ""}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContactForm({ onAdd }: { onAdd: (p:any)=>void }) {
  const [role, setRole] = useState("Geschäftsführer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <div className="card" style={{padding:12, borderRadius:14, marginTop:8}}>
      <div className="row">
        <select className="input" value={role} onChange={(e)=>setRole(e.target.value)}>
          {["Geschäftsführer","Verkauf","Werkstatt","Buchhaltung"].map(r=><option key={r} value={r}>{r}</option>)}
        </select>
        <input className="input" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Name" />
      </div>
      <div className="row" style={{marginTop:8}}>
        <input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email (optional)" />
        <input className="input" value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="Telefon (optional)" />
      </div>
      <div style={{marginTop:8}}>
        <button className="btn" onClick={()=>{ onAdd({ role, name, email: email||null, phone: phone||null }); setName(""); setEmail(""); setPhone(""); }}>Kontakt hinzufügen</button>
      </div>
    </div>
  );
}

function VisitForm({ onAdd }: { onAdd: (p:any)=>void }) {
  const [rep, setRep] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [notes, setNotes] = useState("");
  return (
    <div className="card" style={{padding:12, borderRadius:14, marginTop:8}}>
      <div className="row">
        <input className="input" value={rep} onChange={(e)=>setRep(e.target.value)} placeholder="AD Email (später Login)" />
        <input className="input" type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
      </div>
      <textarea className="input" style={{marginTop:8, minHeight:70}} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Notizen/Bericht" />
      <div style={{marginTop:8}}>
        <button className="btn" onClick={()=>{ onAdd({ rep_email: rep||null, visited_at: date, notes: notes||null }); setNotes(""); }}>Besuch speichern</button>
      </div>
    </div>
  );
}
