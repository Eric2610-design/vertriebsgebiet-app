"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "../../lib/supabase/browser";

type Workspace = { id: string; name: string };
type SourceType = { code: string; name: string };

type AnalyzeResponse = {
  importRunId: string;
  sheetNames: string[];
  detectedSheetName: string;
  headers: string[];
  headerRow: number;
  fileName: string;
};

type Mapping = {
  name?: string;
  street?: string;
  zipcode?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  external?: Record<string, string>;
};

export default function UploadWizard({ workspaces, sourceTypes }: { workspaces: Workspace[]; sourceTypes: SourceType[] }) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [sourceTypeCode, setSourceTypeCode] = useState(sourceTypes[0]?.code ?? "");
  const [file, setFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [analyze, setAnalyze] = useState<AnalyzeResponse | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [headerRow, setHeaderRow] = useState<number>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [importResult, setImportResult] = useState<{ imported: number; candidates: number } | null>(null);

  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidatesBusy, setCandidatesBusy] = useState(false);

  useEffect(() => {
    if (analyze) {
      setSheetName(analyze.detectedSheetName);
      setHeaderRow(analyze.headerRow);
      setHeaders(analyze.headers);
      setImportResult(null);
      setCandidates([]);
      setMapping(autoSuggestMapping(sourceTypeCode, analyze.headers));
    }
  }, [analyze, sourceTypeCode]);

  function autoSuggestMapping(sourceType: string, hdrs: string[]): Mapping {
    const h = hdrs.map(x => x.trim());
    const find = (...cands: string[]) => h.find(x => cands.some(c => x.toLowerCase() === c.toLowerCase()));
    const includes = (cand: RegExp) => h.find(x => cand.test(x.toLowerCase()));

    const m: Mapping = { external: {} };

    if (sourceType.includes("zeg")) {
      m.name = find("Name1") ?? find("Name") ?? h[0];
      m.street = find("Strasse") ?? includes(/str/);
      m.zipcode = find("PLZ") ?? includes(/plz|post/);
      m.city = find("Ort") ?? includes(/ort|city/);
      m.phone = find("Telefon") ?? includes(/tel/);
      m.email = find("E-Mail") ?? find("Email") ?? includes(/mail/);
      m.website = find("Homepage") ?? includes(/home|web/);
      const kdnr = find("KdNr") ?? find("Kdnr");
      if (kdnr) m.external!["zeg_kdnr"] = kdnr;
      const adr = find("AdrNr") ?? find("Adrnr");
      if (adr) m.external!["zeg_adrnr"] = adr;
      const mgl = find("MglNr") ?? find("Mglnr");
      if (mgl) m.external!["zeg_mglnr"] = mgl;
    } else if (sourceType.includes("bico")) {
      m.name = find("Name") ?? h[0];
      m.street = find("Adresse") ?? includes(/adress/);
      m.zipcode = find("PLZ-Code") ?? includes(/plz|post/);
      m.city = find("Ort") ?? includes(/ort|city/);
      m.phone = find("Telefonnr.") ?? includes(/tel/);
      m.website = find("Homepage") ?? includes(/web|home/);
      const dzb = find("DZB Händlernr.") ?? includes(/händlernr|haendlernr/);
      if (dzb) m.external!["bico_dzb"] = dzb;
      const ust = find("USt Id Nr") ?? includes(/ust/);
      if (ust) m.external!["ustid"] = ust;
    } else if (sourceType.includes("vk_rechnungsposten")) {
      m.name = find("Kunden") ?? includes(/kunde/);
      m.street = find("Kunden Straße/Hausnummer") ?? includes(/straße|strasse/);
      m.zipcode = find("Kunden Postleitzahl") ?? includes(/postleitz/);
      m.city = find("Kunden Ort") ?? includes(/kunden ort|ort/);
    } else if (sourceType.includes("auftragsbestandsposten")) {
      m.name = find("Kunden") ?? includes(/kunde/);
      m.street = find("Kunden Straße/Hausnummer") ?? includes(/straße|strasse/);
      m.zipcode = find("Kunden Postleitzahl") ?? includes(/postleitz/);
      m.city = find("Kunden Ort") ?? includes(/kunden ort|ort/);
    } else if (sourceType.includes("rm_haendler")) {
      m.name = find("name") ?? h[0];
      m.street = find("street") ?? includes(/street|str/);
      m.zipcode = find("zipcode") ?? includes(/zip/);
      m.city = find("city") ?? includes(/city|ort/);
      m.phone = find("phonenumber") ?? includes(/phone|tel/);
    } else {
      m.name = h[0];
      m.zipcode = includes(/plz|zip|post/) ?? undefined;
      m.city = includes(/ort|city/) ?? undefined;
      m.street = includes(/str|street|adress/) ?? undefined;
    }
    if (m.external && Object.keys(m.external).length === 0) delete m.external;
    return m;
  }

  async function analyzeFile() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setAnalyze(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("workspaceId", workspaceId);
      fd.append("sourceTypeCode", sourceTypeCode);

      const res = await fetch("/api/import/analyze", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Analyze failed");
      setAnalyze(j as AnalyzeResponse);
    } catch (e: any) {
      setMsg(e?.message ?? "Fehler beim Analysieren.");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!analyze) return;
    setBusy(true);
    setMsg(null);
    setImportResult(null);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importRunId: analyze.importRunId,
          workspaceId,
          sourceTypeCode,
          sheetName,
          headerRow,
          mapping,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Import failed");
      setImportResult({ imported: j.imported, candidates: j.candidates });
      await loadCandidates();
    } catch (e: any) {
      setMsg(e?.message ?? "Fehler beim Import.");
    } finally {
      setBusy(false);
    }
  }

  async function loadCandidates() {
    setCandidatesBusy(true);
    try {
      const { data, error } = await supabase
        .from("match_candidates")
        .select(`
          id, score, reason, status, created_at,
          left:source_records!match_candidates_left_source_record_id_fkey(id,name,street,zipcode,city),
          right:source_records!match_candidates_right_source_record_id_fkey(id,name,street,zipcode,city)
        `)
        .eq("workspace_id", workspaceId)
        .eq("status", "suggested")
        .order("score", { ascending: false })
        .limit(100);

      if (error) throw error;
      setCandidates(data ?? []);
    } catch (e:any) {
      setMsg(e?.message ?? "Konnte Vorschläge nicht laden.");
    } finally {
      setCandidatesBusy(false);
    }
  }

  async function acceptCandidate(id: string) {
    setMsg(null);
    const res = await fetch("/api/match/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: id })
    });
    const j = await res.json();
    if (!res.ok) setMsg(j?.error ?? "Accept fehlgeschlagen");
    await loadCandidates();
  }

  async function rejectCandidate(id: string) {
    setMsg(null);
    const res = await fetch("/api/match/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: id })
    });
    const j = await res.json();
    if (!res.ok) setMsg(j?.error ?? "Reject fehlgeschlagen");
    await loadCandidates();
  }

  const canonicalFields: { key: keyof Mapping; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "street", label: "Straße" },
    { key: "zipcode", label: "PLZ" },
    { key: "city", label: "Ort" },
    { key: "phone", label: "Telefon" },
    { key: "email", label: "E-Mail" },
    { key: "website", label: "Website" },
  ];

  return (
    <div>
      <div className="card" style={{marginBottom:12}}>
        <h3 style={{marginTop:0}}>1) Datei auswählen & analysieren</h3>

        <div className="row">
          <div style={{flex:"1 1 240px"}}>
            <label>Workspace</label>
            <select className="input" value={workspaceId} onChange={(e)=>setWorkspaceId(e.target.value)}>
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div style={{flex:"1 1 240px"}}>
            <label>Quelle</label>
            <select className="input" value={sourceTypeCode} onChange={(e)=>setSourceTypeCode(e.target.value)}>
              {sourceTypes.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </div>
          <div style={{flex:"2 1 320px"}}>
            <label>Excel-Datei</label>
            <input className="input" type="file" accept=".xlsx,.xls" onChange={(e)=>setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div style={{display:"flex", gap:10, marginTop:12, flexWrap:"wrap"}}>
          <button className="btn" onClick={analyzeFile} disabled={busy || !file || !workspaceId || !sourceTypeCode}>
            {busy ? "Analysiere…" : "Datei analysieren"}
          </button>
          <button className="btn secondary" onClick={()=>{ setAnalyze(null); setImportResult(null); setCandidates([]); setMsg(null); }} disabled={busy}>
            Reset
          </button>
        </div>

        {msg && <p style={{marginTop:12, marginBottom:0}}><small style={{color:"crimson"}}>{msg}</small></p>}
      </div>

      {analyze && (
        <div className="card" style={{marginBottom:12}}>
          <h3 style={{marginTop:0}}>2) Mapping festlegen</h3>
          <small>Datei: {analyze.fileName} · ImportRun: {analyze.importRunId}</small>

          <div className="row" style={{marginTop:12}}>
            <div style={{flex:"1 1 240px"}}>
              <label>Sheet</label>
              <select className="input" value={sheetName} onChange={(e)=>setSheetName(e.target.value)}>
                {analyze.sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{flex:"1 1 240px"}}>
              <label>Header-Zeile (meist 1)</label>
              <input className="input" type="number" value={headerRow} min={1} onChange={(e)=>setHeaderRow(parseInt(e.target.value || "1", 10))} />
            </div>
          </div>

          <div style={{marginTop:12}}>
            <div className="row">
              {canonicalFields.map(f => (
                <div key={String(f.key)} style={{flex:"1 1 240px"}}>
                  <label>{f.label}</label>
                  <select
                    className="input"
                    value={(mapping as any)[f.key] ?? ""}
                    onChange={(e)=>setMapping(prev => ({...prev, [f.key]: e.target.value || undefined}))}
                  >
                    <option value="">(nicht nutzen)</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div style={{marginTop:12}}>
              <label>Externe IDs (optional)</label>
              <div className="row">
                {["zeg_kdnr","zeg_adrnr","zeg_mglnr","bico_dzb","ustid"].map((k)=>(
                  <div key={k} style={{flex:"1 1 240px"}}>
                    <label>{k}</label>
                    <select
                      className="input"
                      value={(mapping.external?.[k] ?? "")}
                      onChange={(e)=>setMapping(prev => ({
                        ...prev,
                        external: {
                          ...(prev.external ?? {}),
                          [k]: e.target.value || ""
                        }
                      }))}
                    >
                      <option value="">(nicht nutzen)</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <small>Leere Auswahl wird ignoriert.</small>
            </div>

            <div style={{display:"flex", gap:10, marginTop:14, flexWrap:"wrap"}}>
              <button className="btn" onClick={commitImport} disabled={busy}>
                {busy ? "Importiere…" : "Import starten"}
              </button>
              <button className="btn secondary" onClick={loadCandidates} disabled={candidatesBusy}>
                {candidatesBusy ? "Lade…" : "Vorschläge laden"}
              </button>
            </div>

            {importResult && (
              <p style={{marginTop:12, marginBottom:0}}>
                <span className="badge green">Importiert: {importResult.imported}</span>{" "}
                <span className="badge yellow">Vorschläge: {importResult.candidates}</span>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{marginTop:0}}>3) Vorschläge: Händler zusammenführen</h3>
        <small>Top 100 „suggested“ Matches für den Workspace.</small>

        <div style={{marginTop:12}}>
          {candidates.length === 0 ? (
            <small>Keine Vorschläge geladen (oder keine vorhanden).</small>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table>
                <thead>
                  <tr>
                    <th>Score</th>
                    <th>Links</th>
                    <th>Rechts</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id}>
                      <td><span className="badge">{Number(c.score).toFixed(2)}</span><div><small>{c.reason}</small></div></td>
                      <td>
                        <div style={{fontWeight:700}}>{c.left?.name}</div>
                        <small>{c.left?.street} · {c.left?.zipcode} {c.left?.city}</small>
                      </td>
                      <td>
                        <div style={{fontWeight:700}}>{c.right?.name}</div>
                        <small>{c.right?.street} · {c.right?.zipcode} {c.right?.city}</small>
                      </td>
                      <td style={{minWidth:180}}>
                        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                          <button className="btn" onClick={()=>acceptCandidate(c.id)}>Verknüpfen</button>
                          <button className="btn secondary" onClick={()=>rejectCandidate(c.id)}>Ablehnen</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
