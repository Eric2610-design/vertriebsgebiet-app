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

function mostCommon(values: (string | null)[]) {
  const m = new Map<string, number>();
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    m.set(s, (m.get(s) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of m.entries()) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
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

    // Heuristik: Quelle für den Upload-Run (falls Column gemappt ist, nimm häufigste)
    const sourceCandidates =
      mapping.source && rows.length
        ? rows.slice(0, 500).map((r) => (pick(r, mapping.source) as string | null))
        : [];
    const runSource = mostCommon(sourceCandidates) ?? fileName;

    // Händler vorbereiten
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
          source: (pick(r, mapping.source) ?? runSource) as string,
          // defaults
          is_master: true,
          duplicate_of: null,
        };
      })
      .filter(Boolean) as any[];

    const skipped = rows.length - payload.length;

    try {
      if (!payload.length) {
        throw new Error("Es wurden keine gültigen Händler erkannt (kein Name gefunden). Prüfe Mapping.");
      }

      // 1) Upload-Run anlegen (liefert upload_run_id)
      let uploadRunId: number | null = null;
      try {
        const { data: run, error: runErr } = await supabase
          .from("upload_runs")
          .insert({
            file_name: fileName,
            source: runSource,
            rows_in_file: rows.length,
            inserted_count: 0,
            updated_count: 0,
            skipped_count: skipped,
            error_count: 0,
            notes: `Mapping: name=${mapping.name || "-"}, street=${mapping.street || "-"}, zipcode=${mapping.zipcode || "-"}, city=${mapping.city || "-"}, source=${mapping.source || "(fixed)"}`,
          })
          .select("id")
          .single();

        if (runErr) throw runErr;
        uploadRunId = run?.id ?? null;
      } catch (e: any) {
        // Falls upload_runs (noch) nicht existiert: Import trotzdem ermöglichen
        uploadRunId = null;
      }

      // 2) Insert Händler (in Chunks)
      const chunkSize = 1000;
      let inserted = 0;

      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);

        if (uploadRunId) {
          for (const it of chunk) it.upload_run_id = uploadRunId;
        }

        const { error } = await supabase.from("dealers").insert(chunk);
        if (error) throw new Error(error.message);
        inserted += chunk.length;
      }

      // 3) Upload-Run aktualisieren
      if (uploadRunId) {
        await supabase
          .from("upload_runs")
          .update({
            inserted_count: inserted,
            skipped_count: skipped,
            error_count: 0,
          })
          .eq("id", uploadRunId);
      }

      setMsg(
        uploadRunId
          ? `✅ Import abgeschlossen: ${inserted} Händler eingefügt. (Upload-Run #${uploadRunId})`
          : `✅ Import abgeschlossen: ${inserted} Händler eingefügt. (Hinweis: upload_runs ist nicht aktiv)`
      );
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
            <p className="cardSub">Excel auswählen → Mapping prüfen → Import nach Supabase (mit Upload-Run Tracking).</p>
          </div>
          <div className="row">
            <a className="btn btnGhost" href="/admin/uploads">
              Uploads
            </a>
            <a className="btn btnGhost" href="/admin/dealers">
              Dubletten
            </a>
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
          </div>

          {quality ? (
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="badge">Zeilen: {quality.total}</span>
              <span className="badge">Name: {quality.hasName}</span>
              <span className="badge">Straße: {quality.hasStreet}</span>
              <span className="badge">PLZ: {quality.hasZip}</span>
              <span className="badge">Ort: {quality.hasCity}</span>
              <span className="badge">Vollständig: {quality.full}</span>
            </div>
          ) : null}

          {headers.length ? (
            <div className="grid" style={{ gap: 10 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                Auto-Vorschläge sind gesetzt. Passe bei Bedarf an.
              </div>

              <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                {FIELDS.map((f) => (
                  <label key={f.key} className="field">
                    <span className="label">
                      {f.label} {f.required ? <span className="danger">*</span> : null}
                    </span>
                    <select
                      value={(mapping as any)[f.key] || ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value } as any))}
                    >
                      <option value="">—</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn" onClick={doImport} disabled={!canImport || importing}>
                  {importing ? "Import läuft…" : "Import starten"}
                </button>
                <a className="btn btnGhost" href="/admin/uploads">
                  Upload-Historie
                </a>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              Bitte eine Excel-Datei auswählen.
            </div>
          )}

          {msg ? (
            <div style={{ marginTop: 12, padding: 10, border: "1px solid var(--border)", borderRadius: 12 }}>{msg}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
