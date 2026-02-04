"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";

type Mapping = {
  name: string;
  street: string;
  zipcode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  source: string;
};

type Row = Record<string, any>;

const FIELDS: { key: keyof Mapping; label: string; required?: boolean; hints: string[] }[] = [
  { key: "name", label: "Name", required: true, hints: ["name", "händler", "dealer", "firma", "shop"] },
  { key: "street", label: "Straße", hints: ["street", "strasse", "straße", "adresse", "address"] },
  { key: "zipcode", label: "PLZ", hints: ["plz", "zip", "zipcode", "postleitzahl", "postal"] },
  { key: "city", label: "Ort", hints: ["city", "ort", "stadt", "town"] },
  { key: "country", label: "Land", hints: ["country", "land", "nation"] },
  { key: "email", label: "E-Mail", hints: ["mail", "email", "e-mail"] },
  { key: "phone", label: "Telefon", hints: ["tel", "phone", "telefon", "mobile"] },
  { key: "website", label: "Website", hints: ["web", "website", "url", "homepage"] },
  { key: "source", label: "Quelle (Hersteller)", hints: ["source", "quelle", "hersteller", "brand"] },
];

function norm(s: any) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function guessMapping(headers: string[]) {
  const m: Mapping = {
    name: "",
    street: "",
    zipcode: "",
    city: "",
    country: "",
    email: "",
    phone: "",
    website: "",
    source: "",
  };

  const normHeaders = headers.map((h) => ({ raw: h, n: norm(h) }));

  for (const f of FIELDS) {
    const hit = normHeaders.find((h) => f.hints.some((k) => h.n.includes(k)));
    if (hit) (m as any)[f.key] = hit.raw;
  }

  return m;
}

function pick(row: Row, col: string) {
  if (!col) return null;
  const v = row[col];
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export default function UploadWizard() {
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>(() => guessMapping([]));
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function onFile(file: File) {
    setMsg("");
    setFileName(file.name);

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Row[];

    const hs = json.length ? Object.keys(json[0]) : [];
    setHeaders(hs);
    setRows(json);
    setMapping(guessMapping(hs));
  }

  const quality = useMemo(() => {
    const total = rows.length || 0;
    if (!total) return null;

    const hasName = rows.filter((r) => !!pick(r, mapping.name)).length;
    const hasStreet = rows.filter((r) => !!pick(r, mapping.street)).length;
    const hasZip = rows.filter((r) => !!pick(r, mapping.zipcode)).length;
    const hasCity = rows.filter((r) => !!pick(r, mapping.city)).length;

    const full = rows.filter((r) => {
      return !!pick(r, mapping.name) && !!pick(r, mapping.street) && !!pick(r, mapping.zipcode) && !!pick(r, mapping.city);
    }).length;

    return {
      total,
      hasName,
      hasStreet,
      hasZip,
      hasCity,
      full,
    };
  }, [rows, mapping]);

  const canImport = useMemo(() => {
    if (!rows.length) return false;
    if (!mapping.name) return false;
    return true;
  }, [rows.length, mapping.name]);

  async function doImport() {
    if (!canImport) return;

    setImporting(true);
    setMsg("");

    try {
      // Prepare rows for DB
      const payload = rows
        .map((r) => {
          const name = pick(r, mapping.name);
          if (!name) return null;

          return {
            name,
            street: pick(r, mapping.street),
            zipcode: pick(r, mapping.zipcode),
            city: pick(r, mapping.city),
            country: pick(r, mapping.country) ?? "Deutschland",
            email: pick(r, mapping.email),
            phone: pick(r, mapping.phone),
            website: pick(r, mapping.website),
            source: pick(r, mapping.source) ?? fileName,
            // defaults
            is_master: true,
            duplicate_of: null,
          };
        })
        .filter(Boolean) as any[];

      if (!payload.length) {
        throw new Error("Es wurden keine gültigen Händler erkannt (kein Name gefunden). Prüfe Mapping.");
      }

      // Chunk insert to avoid request limits
      const chunkSize = 1000;
      let inserted = 0;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await supabase.from("dealers").insert(chunk);
        if (error) throw new Error(error.message);
        inserted += chunk.length;
      }

      setMsg(`✅ Import abgeschlossen: ${inserted} Händler eingefügt.`);
    } catch (e: any) {
      setMsg(`❌ Fehler beim Import: ${e?.message ?? String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="cardHeader">
          <div>
            <h3 className="cardTitle">Upload</h3>
            <p className="cardSub">Excel auswählen → Mapping prüfen → Import nach Supabase.</p>
          </div>
        </div>
        <div className="cardBody">
          <div className="row" style={{ marginBottom: 10 }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            {fileName ? <span className="badge">{fileName}</span> : null}
            {rows.length ? <span className="badge">Zeilen: {rows.length}</span> : null}
          </div>

          {msg ? <div className={msg.startsWith("✅") ? "badge ok" : "badge danger"}>{msg}</div> : null}

          {quality ? (
            <div style={{ marginTop: 12 }} className="grid grid3">
              <div className="card" style={{ boxShadow: "none" }}>
                <div className="cardBody kpi">
                  <div className="kpiLabel">Name vorhanden</div>
                  <div className="kpiValue">{quality.hasName} / {quality.total}</div>
                </div>
              </div>
              <div className="card" style={{ boxShadow: "none" }}>
                <div className="cardBody kpi">
                  <div className="kpiLabel">PLZ + Ort vorhanden</div>
                  <div className="kpiValue">{Math.min(quality.hasZip, quality.hasCity)} / {quality.total}</div>
                </div>
              </div>
              <div className="card" style={{ boxShadow: "none" }}>
                <div className="cardBody kpi">
                  <div className="kpiLabel">Geocode-Qualität (Name+Straße+PLZ+Ort)</div>
                  <div className="kpiValue">{quality.full} / {quality.total}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="cardHeader">
          <div>
            <h3 className="cardTitle">Mapping</h3>
            <p className="cardSub">Automatische Vorschläge sind aktiv – ggf. anpassen.</p>
          </div>
          <div className="row">
            <button className="btnPrimary" onClick={doImport} disabled={!canImport || importing}>
              {importing ? "Import läuft…" : "Import starten"}
            </button>
          </div>
        </div>

        <div className="cardBody">
          {!headers.length ? (
            <div className="small">Bitte zuerst eine Excel-Datei auswählen.</div>
          ) : (
            <div className="grid grid2">
              {FIELDS.map((f) => (
                <div key={f.key} className="card" style={{ boxShadow: "none" }}>
                  <div className="cardBody">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 900 }}>
                        {f.label} {f.required ? <span className="badge warn">Pflicht</span> : null}
                      </div>
                      {(mapping as any)[f.key] ? <span className="badge ok">{(mapping as any)[f.key]}</span> : <span className="badge">—</span>}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <select
                        value={(mapping as any)[f.key]}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                        style={{ width: "100%" }}
                      >
                        <option value="">(nicht zuordnen)</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <div className="small" style={{ marginTop: 8 }}>
                        Hinweise: {f.hints.join(", ")}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
