"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [settings, setSettings] = useState<any[]>([]);
  const [months, setMonths] = useState("18");
  const [status, setStatus] = useState("");

  async function load() {
    const res = await fetch("/api/settings");
    const js = await res.json();
    setSettings(js.settings ?? []);
    const cur = (js.settings ?? []).find((s:any)=>s.key==="flyer_active_threshold_months");
    if (cur) setMonths(String(cur.value));
  }
  useEffect(()=>{ load(); }, []);

  async function save() {
    setStatus("speichere…");
    const res = await fetch("/api/settings", { method:"POST", headers:{ "content-type":"application/json"}, body: JSON.stringify({ key:"flyer_active_threshold_months", value: Number(months) }) });
    const js = await res.json();
    if (!res.ok) return setStatus(js?.error ?? "Fehler");
    setStatus("OK");
    await load();
    setTimeout(()=>setStatus(""), 1000);
  }

  return (
    <main className="container">
      <div className="card" style={{padding:16}}>
        <div className="h1">Admin</div>
        <p className="small">Hier kommen später Login/Profile, AD-Gebiete, Import-Regeln und Zeitraum-Defaults rein.</p>

        <div className="card" style={{padding:12, borderRadius:14, marginTop:12}}>
          <div className="h2">Flyer „aktiv“-Zeitraum (Monate)</div>
          <div className="small">Wird später beim Import gefragt/klassifiziert (aktive vs ehemalige Händler).</div>
          <div className="row" style={{marginTop:8}}>
            <input className="input" value={months} onChange={(e)=>setMonths(e.target.value)} />
            <button className="btn primary" onClick={save}>Speichern</button>
          </div>
          {status ? <div className="small" style={{marginTop:8}}>{status}</div> : null}
        </div>

        <div style={{marginTop:12}}>
          <div className="h2">Alle Settings</div>
          <pre className="card" style={{padding:12, borderRadius:14, overflow:"auto"}}>{JSON.stringify(settings, null, 2)}</pre>
        </div>
      </div>
    </main>
  );
}
