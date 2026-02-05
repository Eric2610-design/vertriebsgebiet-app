"use client";

import * as XLSX from "xlsx";
import { useMemo, useState } from "react";

type Draft = {
  name: string;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  manufacturers: string[];
};

function guess(row: any, keys: string[]) {
  const pick = (cands: string[]) => {
    const k = keys.find((k) => cands.some((c) => k.toLowerCase().includes(c)));
    return k ? row[k] : undefined;
  };
  return {
    name: pick(["name","händler","haendler","dealer","firma","shop"]),
    street: pick(["straße","strasse","street","addr"]),
    zip: pick(["plz","zip","postcode"]),
    city: pick(["ort","stadt","city"]),
    country: pick(["land","country"]),
    lat: pick(["lat"]),
    lng: pick(["lng","lon","long"]),
  };
}

function keyFromFilename(fn: string) {
  const f = fn.toLowerCase();
  if (f.includes("flyer")) return "flyer";
  if (f.includes("zeg")) return "zeg";
  if (f.includes("bico")) return "bico";
  if (f.includes("kalkhoff")) return "kalkhoff";
  if (f.includes("bergamont")) return "bergamont";
  if (f.includes("riese")) return "riese_mueller";
  return "unknown";
}

export default function ImportPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [status, setStatus] = useState<string>("");
  const [extraMan, setExtraMan] = useState<string>("");

  const dupes = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of drafts) {
      const k = [d.name?.trim().toLowerCase(), d.street?.trim().toLowerCase(), d.zip?.trim(), d.city?.trim().toLowerCase()].join("|");
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).filter(([,n]) => n > 1).length;
  }, [drafts]);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setStatus("Lese Excel…");
    const all: Draft[] = [];
    for (const file of Array.from(files)) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const man = keyFromFilename(file.name);
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
        if (!rows.length) continue;
        const keys = Object.keys(rows[0] ?? {});
        for (const r of rows) {
          const g = guess(r, keys);
          const name = String(g.name ?? "").trim();
          if (!name) continue;
          all.push({
            name,
            street: String(g.street ?? "").trim() || null,
            zip: String(g.zip ?? "").trim() || null,
            city: String(g.city ?? "").trim() || null,
            country: String(g.country ?? "").trim() || null,
            lat: g.lat ? Number(g.lat) : null,
            lng: g.lng ? Number(g.lng) : null,
            manufacturers: man !== "unknown" ? [man] : [],
          });
        }
      }
    }
    setDrafts(all);
    setStatus(`Fertig. ${all.length} Zeilen erkannt.`);
  }

  async function addManufacturerToAll() {
    const k = extraMan.trim();
    if (!k) return;
    setDrafts((prev) => prev.map((d) => ({ ...d, manufacturers: Array.from(new Set([...d.manufacturers, k])) })));
    setExtraMan("");
  }

  async function save() {
    setStatus("Speichere in Supabase…");
    const res = await fetch("/api/import/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealers: drafts }),
    });
    const js = await res.json();
    if (!res.ok) return setStatus(js?.error ?? "Import fehlgeschlagen");
    setStatus(`OK: Dealers ${js.dealers} · Hersteller ${js.manufacturers} · Links ${js.links}`);
  }

  return (
    <main className="container">
      <div className="card" style={{padding:16}}>
        <div className="h1">Import</div>
        <p className="small">Excel-Dateien auswählen → Preview → Speichern. Re-Uploads überschreiben/aktualisieren (kein „alles neu mergen“ mehr).</p>

        <div className="row" style={{marginTop:12}}>
          <div className="col">
            <input className="input" type="file" multiple accept=".xlsx,.xls" onChange={(e)=>onFiles(e.target.files)} />
            <div className="small" style={{marginTop:8}}>{status}</div>
          </div>
          <div className="col">
            <div className="badge">Erkannt: {drafts.length}</div>{" "}
            <div className="badge">Exakte Duplikate im Import: {dupes}</div>
            <div style={{marginTop:12}}>
              <div className="small">Optional: Hersteller-Key zu allen Import-Zeilen hinzufügen</div>
              <div className="row" style={{marginTop:6}}>
                <input className="input" value={extraMan} onChange={(e)=>setExtraMan(e.target.value)} placeholder="z.B. flyer" />
                <button className="btn" onClick={addManufacturerToAll}>Hinzufügen</button>
              </div>
            </div>
          </div>
        </div>

        <div style={{display:"flex", gap:8, flexWrap:"wrap", marginTop:12}}>
          <button className="btn primary" disabled={drafts.length===0} onClick={save}>In Datenbank speichern</button>
          <a className="btn" href="/cleanup">Danach: Cleanup</a>
          <a className="btn" href="/map">Zur Karte</a>
        </div>

        {drafts.length ? (
          <div style={{marginTop:14}}>
            <div className="h2">Preview (erste 25)</div>
            <table className="table" style={{marginTop:8}}>
              <thead>
                <tr>
                  <th>Name</th><th>Straße</th><th>PLZ</th><th>Ort</th><th>Land</th><th>Hersteller</th>
                </tr>
              </thead>
              <tbody>
                {drafts.slice(0,25).map((d,i)=>(
                  <tr key={i} className="tr">
                    <td>{d.name}</td>
                    <td>{d.street ?? ""}</td>
                    <td>{d.zip ?? ""}</td>
                    <td>{d.city ?? ""}</td>
                    <td>{d.country ?? ""}</td>
                    <td>{d.manufacturers.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  );
}
