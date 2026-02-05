"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DealerMini = { id: string; name: string; street?: string; zip?: string; city?: string; country?: string };
type Group = { key: string; address: string; dealers: DealerMini[]; suggested_master_id: string };

export default function CleanupPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [q, setQ] = useState("");
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [master, setMaster] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const res = await fetch("/api/cleanup/suggestions");
    const js = await res.json();
    setGroups(js.groups ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return groups;
    return groups.filter((g) => g.address.toLowerCase().includes(s) || g.dealers.some((d) => d.name.toLowerCase().includes(s)));
  }, [groups, q]);

  async function normalize() {
    if (!confirm("Adressen vereinheitlichen?\n\nAktualisiert nur norm_* Felder.")) return;
    setRunning(true);
    setProgress("Normalisiere…");
    const res = await fetch("/api/dealers/normalize", { method: "POST" });
    const js = await res.json();
    if (!res.ok) { setRunning(false); return alert(js?.error ?? "Fehler"); }
    setProgress(`OK (geprüft ${js.scanned}, aktualisiert ${js.updated}). Lade…`);
    await load();
    setProgress("");
    setRunning(false);
  }

  async function mergeOne(g: Group) {
    const m = master[g.key] ?? g.suggested_master_id;
    const merge_ids = g.dealers.map((d) => d.id).filter((id) => id !== m);
    if (!merge_ids.length) return;
    if (!confirm(`Mergen?\n\nMaster: ${m}\nMerge: ${merge_ids.length}`)) return;
    setRunning(true);
    setProgress("Merge…");
    const res = await fetch("/api/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ master_id: m, merge_ids, reason: "cleanup" }),
    });
    const js = await res.json();
    if (!res.ok) { setRunning(false); setProgress(""); return alert(js?.error ?? "Merge fehlgeschlagen"); }
    await load();
    setRunning(false);
    setProgress("");
  }

  async function bulkMerge(list: Group[], label: string) {
    if (!list.length) return;
    if (!confirm(`${label}?\n\nGruppen: ${list.length}`)) return;
    setRunning(true);
    let ok = 0, fail = 0;
    for (let i=0;i<list.length;i++){
      const g=list[i];
      setProgress(`Merge ${i+1}/${list.length}`);
      const m = master[g.key] ?? g.suggested_master_id;
      const merge_ids = g.dealers.map((d) => d.id).filter((id) => id !== m);
      if (!merge_ids.length) continue;
      const res = await fetch("/api/merge", {
        method:"POST",
        headers:{ "content-type":"application/json"},
        body: JSON.stringify({ master_id:m, merge_ids, reason:"cleanup_bulk" })
      });
      const js = await res.json();
      if (!res.ok) { fail++; console.warn(g.key, js); } else ok++;
    }
    setProgress("");
    setRunning(false);
    alert(`Fertig. OK: ${ok} · Fehler: ${fail}`);
    await load();
  }

  return (
    <main className="container">
      <div className="card" style={{padding:16}}>
        <div style={{display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap", alignItems:"center"}}>
          <div>
            <div className="h1">Cleanup (Dubletten / Filialen)</div>
            <div className="small">Vorschläge basieren auf Name+PLZ+Ort und „ähnlicher Straße“. Merge erlaubt fehlendes Land & toleriert Straßen-Varianten.</div>
          </div>
          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            <button className="btn" disabled={running} onClick={normalize}>Adressen vereinheitlichen</button>
            <button className="btn" disabled={running} onClick={load}>Neu laden</button>
            <Link className="btn primary" href="/map">Zur Karte</Link>
          </div>
        </div>

        <div className="row" style={{marginTop:12, alignItems:"center"}}>
          <input className="input" placeholder="Suche (Name/Adresse)…" value={q} onChange={(e)=>setQ(e.target.value)} />
          <button className="btn" disabled={running || filtered.length===0} onClick={()=>bulkMerge(filtered, "Alle Gruppen sofort mergen")}>Alle mergen</button>
          <button className="btn primary" disabled={running || filtered.filter(g=>marked[g.key]).length===0} onClick={()=>bulkMerge(filtered.filter(g=>marked[g.key]), "Markierte Gruppen sofort mergen")}>Markierte mergen</button>
        </div>

        {running ? <div className="small" style={{marginTop:8}}>{progress || "Arbeite…"}</div> : null}
        {loading ? <div className="small" style={{marginTop:12}}>Lade…</div> : null}

        <div style={{marginTop:12, display:"grid", gap:12}}>
          {filtered.slice(0, 200).map((g) => {
            const m = master[g.key] ?? g.suggested_master_id;
            return (
              <div key={g.key} className="card" style={{padding:12}}>
                <div style={{display:"flex", justifyContent:"space-between", gap:12}}>
                  <div>
                    <div style={{display:"flex", gap:8, alignItems:"center"}}>
                      <input type="checkbox" checked={!!marked[g.key]} onChange={(e)=>setMarked(p=>({...p,[g.key]:e.target.checked}))} />
                      <div className="h2">{g.address || "(Adresse fehlt)"}</div>
                      <span className="badge">{g.dealers.length} Einträge</span>
                    </div>
                    <div className="small" style={{marginTop:4}}>Master wählen:</div>
                    <select className="input" value={m} onChange={(e)=>setMaster(p=>({...p,[g.key]:e.target.value}))}>
                      {g.dealers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.street} · {d.zip} {d.city}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex", flexDirection:"column", gap:8, minWidth:140}}>
                    <button className="btn primary" disabled={running} onClick={()=>mergeOne(g)}>Mergen</button>
                  </div>
                </div>

                <table className="table" style={{marginTop:8}}>
                  <thead><tr><th>Name</th><th>Straße</th><th>PLZ</th><th>Ort</th><th>Land</th><th></th></tr></thead>
                  <tbody>
                    {g.dealers.map(d=>(
                      <tr key={d.id} className="tr">
                        <td>{d.name}</td><td>{d.street}</td><td>{d.zip}</td><td>{d.city}</td><td>{d.country}</td>
                        <td><Link className="btn" href={`/dealer/${d.id}`}>Händler</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {filtered.length > 200 ? <div className="small" style={{marginTop:10}}>Hinweis: Anzeige auf 200 Gruppen gekürzt (Performance).</div> : null}
      </div>
    </main>
  );
}
