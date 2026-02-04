"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { norm } from "@/lib/dealerUtils";

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

type RunBrief = {
  id: number;
  created_at: string;
  file_name?: string | null;
  source?: string | null;
};

const FIELDS: { key: keyof Mapping; label: string; required?: boolean; hints: string[] }[] = [
  { key: "name", label: "Name", required: true, hints: ["name", "händler", "haendler", "dealer", "firma", "shop"] },
  { key: "street", label: "Straße", hints: ["street", "strasse", "straße", "adresse", "address"] },
  { key: "zipcode", label: "PLZ", hints: ["plz", "zip", "zipcode", "postleitzahl", "postal"] },
  { key: "city", label: "Ort", hints: ["city", "ort", "stadt", "town"] },
  { key: "country", label: "Land", hints: ["country", "land", "nation"] },
  { key: "email", label: "E-Mail", hints: ["mail", "email", "e-mail"] },
  { key: "phone", label: "Telefon", hints: ["tel", "phone", "telefon", "mobile"] },
  { key: "website", label: "Website", hints: ["web", "website", "url", "homepage"] },
  { key: "source", label: "Quelle (Hersteller)", hints: ["source", "quelle", "hersteller", "brand"] },
];

function normHeader(s: any) {
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

  // Besseres Auto-Mapping:
  // - bewertet Treffer (genauer Match gewinnt)
  // - verhindert, dass „irgendeine“ Spalte für alle Felder verwendet wird
  const normHeaders = headers.map((h) => ({ raw: h, n: normHeader(h) }));
  const used = new Set<string>();

  const score = (headerNorm: string, hint: string) => {
    if (headerNorm === hint) return 5;
    if (headerNorm.startsWith(hint)) return 4;
    if (headerNorm.includes(hint)) return 3;
    return 0;
  };

  for (const f of FIELDS) {
    let best: { raw: string; s: number } | null = null;
    for (const h of normHeaders) {
      if (used.has(h.raw)) continue;
      let s = 0;
      for (const hint of f.hints) s = Math.max(s, score(h.n, hint));
      if (s <= 0) continue;
      if (!best || s > best.s) best = { raw: h.raw, s };
    }
    if (best) {
      (m as any)[f.key] = best.raw;
      // „source“ darf auch gerne leer bleiben; ansonsten wie alle Felder eindeutig.
      used.add(best.raw);
    }
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

function buildDedupeKey(name: any, street: any, zipcode: any, city: any) {
  // Street unbedingt aufnehmen, sonst werden unterschiedliche Filialen in derselben PLZ/Stadt fälschlich zusammengeführt.
  return `${norm(name)}|${normStreet(street)}|${norm(zipcode)}|${norm(city)}`;
}

function mergeSource(existing: any, incoming: string) {
  const ex = String(existing ?? "").trim();
  const parts = ex
    ? ex
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (incoming && !parts.includes(incoming)) parts.push(incoming);
  return parts.join(", ");
}

function mergeValue(existing: any, incoming: any, overwrite: boolean) {
  const ex = String(existing ?? "").trim();
  const inc = String(incoming ?? "").trim();
  if (!inc) return ex || null;
  if (!ex) return inc;
  return overwrite ? inc : ex;
}

export default function UploadWizard() {
  const search = useSearchParams();

  const [fileName, setFileName] = useState<string>("");
  const [manualSource, setManualSource] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>(() => guessMapping([]));
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [rollbackEnabled, setRollbackEnabled] = useState(false);
  const [rollbackRunId, setRollbackRunId] = useState<number | null>(null);
  const [runs, setRuns] = useState<RunBrief[]>([]);

  const [lastRunId, setLastRunId] = useState<number | null>(null);

  useEffect(() => {
    // optional: preselect rollback from URL (/upload?reimport=123)
    const q = search?.get("reimport");
    const id = q ? Number(q) : NaN;
    if (Number.isFinite(id) && id > 0) {
      setRollbackEnabled(true);
      setRollbackRunId(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Load recent upload runs for the rollback dropdown
    (async () => {
      try {
        const res = await fetch("/api/uploads/list?limit=200", { cache: "no-store" });
        const json = await res.json();
        if (json?.ok && Array.isArray(json.runs)) {
          setRuns(json.runs);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  async function onFile(file: File) {
    setMsg("");
    setLastRunId(null);
    setFileName(file.name);
    // Default: Dateiname ohne Endung als Hersteller/Quelle vorschlagen
    setManualSource(file.name.replace(/\.[^.]+$/, ""));

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

    return { total, hasName, hasStreet, hasZip, hasCity, full };
  }, [rows, mapping]);

  const canImport = useMemo(() => {
    if (!rows.length) return false;
    if (!mapping.name) return false;
    return true;
  }, [rows.length, mapping.name]);

  async function rollbackIfNeeded() {
    if (!rollbackEnabled || !rollbackRunId) return;
    const res = await fetch("/api/uploads/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rollbackRunId }),
    });
    const json = await res.json();
    if (!json.ok) {
      throw new Error(`Rollback fehlgeschlagen: ${json.error ?? "unknown"}`);
    }
  }

  async function doImport() {
    if (!canImport) return;

    setImporting(true);
    setMsg("");
    setLastRunId(null);

    // Heuristik: Quelle für den Upload-Run (falls Column gemappt ist, nimm häufigste)
    const sourceCandidates =
      mapping.source && rows.length
        ? rows.slice(0, 800).map((r) => (pick(r, mapping.source) as string | null))
        : [];
    const runSource =
      mostCommon(sourceCandidates) ??
      (manualSource?.trim() || fileName.replace(/\.[^.]+$/, ""));

    // Händler vorbereiten
    const prepared = rows
      .map((r) => {
        const name = pick(r, mapping.name);
        if (!name) return null;

        const zipcode = pick(r, mapping.zipcode) ?? pick(r, "postal_code");
        const city = pick(r, mapping.city);
        const src = (pick(r, mapping.source) ?? runSource) as string;

        const dedupe_key = buildDedupeKey(name, street, zipcode, city);

        return {
          name,
          street: pick(r, mapping.street),
          zipcode,
          city,
          country: pick(r, mapping.country) ?? "Deutschland",
          email: pick(r, mapping.email),
          phone: pick(r, mapping.phone),
          website: pick(r, mapping.website),
          source: src,
          dedupe_key,
          // defaults
          is_master: true,
          duplicate_of: null,
        };
      })
      .filter(Boolean) as any[];

    const skipped = rows.length - prepared.length;

    try {
      if (!prepared.length) {
        throw new Error("Es wurden keine gültigen Händler erkannt (kein Name gefunden). Prüfe Mapping.");
      }

      // Optional: Rollback (Run löschen) VOR Import
      if (rollbackEnabled && rollbackRunId) {
        setMsg(`⏪ Rollback Run #${rollbackRunId} …`);
        await rollbackIfNeeded();
      }

      // Upload-Run anlegen
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
          notes: `Mapping: name=${mapping.name || "-"}, street=${mapping.street || "-"}, zipcode=${mapping.zipcode || "-"}, city=${mapping.city || "-"}, source=${mapping.source || "(auto)"}; overwrite=${overwriteExisting ? "yes" : "no"}; rollback=${rollbackEnabled && rollbackRunId ? `#${rollbackRunId}` : "no"}`,
        })
        .select("id")
        .single();

      if (runErr) throw runErr;
      const uploadRunId: number = run?.id;
      setLastRunId(uploadRunId);

      // Import (Insert neu, Update bestehend) in Chunks
      const chunkSize = 800;
      let inserted = 0;
      let updated = 0;

      for (let i = 0; i < prepared.length; i += chunkSize) {
        const chunk = prepared.slice(i, i + chunkSize);
        const keys = Array.from(new Set(chunk.map((x: any) => x.dedupe_key).filter(Boolean)));

        // existing map (dedupe_key -> row)
        // Achtung: Supabase REST-Query nutzt GET & URL-Parameter -> zu viele/lange Keys (Flyer!) führen zu 400.
        // Daher: Keys in kleinen Portionen holen.
        const existingRows: any[] = [];
        const keyBatchSize = 120;
        for (let k = 0; k < keys.length; k += keyBatchSize) {
          const part = keys.slice(k, k + keyBatchSize);
          const { data, error: exErr } = await supabase
            .from("dealers")
            .select(
              "id,dedupe_key,name,source,street,zipcode,postal_code,city,country,email,phone,website,brands"
            )
            .in("dedupe_key", part);
          if (exErr) throw new Error(exErr.message);
          if (data?.length) existingRows.push(...data);
        }

        const existingByKey = new Map<string, any>();
        for (const r of existingRows ?? []) {
          if (r?.dedupe_key) existingByKey.set(String(r.dedupe_key), r);
        }

        const toInsert: any[] = [];
        const toUpdate: any[] = [];
        const sourceRuns: any[] = [];

        for (const it of chunk) {
          const ex = existingByKey.get(String(it.dedupe_key));

          if (!ex) {
            toInsert.push({
              ...it,
              upload_run_id: uploadRunId, // nur für NEU
            });
          } else {
            // Smart merge (keine Daten zerstören)
            const mergedSource = mergeSource(ex.source, it.source);
            toUpdate.push({
              dedupe_key: it.dedupe_key,
              name: mergeValue(ex.name, it.name, overwriteExisting),
              street: mergeValue(ex.street, it.street, overwriteExisting),
              zipcode: mergeValue(ex.zipcode ?? ex.postal_code, it.zipcode, overwriteExisting),
              city: mergeValue(ex.city, it.city, overwriteExisting),
              country: mergeValue(ex.country, it.country, overwriteExisting),
              email: mergeValue(ex.email, it.email, overwriteExisting),
              phone: mergeValue(ex.phone, it.phone, overwriteExisting),
              website: mergeValue(ex.website, it.website, overwriteExisting),
              source: mergedSource || it.source,
              // Wichtig: upload_run_id NICHT anfassen
            });
          }

          // Quelle pro Run protokollieren (best-effort)
          // Dealer-ID kennen wir erst nach Insert/Update -> wir füllen weiter unten.
        }

        // 1) Inserts
        let insertedRows: any[] = [];
        if (toInsert.length) {
          const { data: insData, error: insErr } = await supabase
            .from("dealers")
            .insert(toInsert)
            .select("id,dedupe_key,source");
          if (insErr) throw new Error(insErr.message);
          insertedRows = insData ?? [];
          inserted += toInsert.length;
        }

        // 2) Updates (prefer fast upsert by dedupe_key, fallback to per-id updates)
        if (toUpdate.length) {
          const { error: upErr } = await supabase.from("dealers").upsert(toUpdate, { onConflict: "dedupe_key" });
          if (upErr) {
            // fallback: update per id
            for (const u of toUpdate) {
              const ex = existingByKey.get(String(u.dedupe_key));
              if (!ex?.id) continue;
              const { error: uErr } = await supabase
                .from("dealers")
                .update({
                  name: u.name,
                  street: u.street,
                  zipcode: u.zipcode,
                  city: u.city,
                  country: u.country,
                  email: u.email,
                  phone: u.phone,
                  website: u.website,
                  source: u.source,
                })
                .eq("id", ex.id);
              if (uErr) throw new Error(uErr.message);
            }
          }
          updated += toUpdate.length;
        }

        // 3) dealer_source_runs (best-effort)
        // Wir legen pro Datensatz (Dealer, Source, Run) einen Eintrag an.
        // Für Updates nehmen wir die existierenden IDs; für Inserts die zurückgegebenen IDs.
        const idByKey = new Map<string, number>();
        for (const r of existingRows ?? []) {
          if (r?.dedupe_key && r?.id) idByKey.set(String(r.dedupe_key), Number(r.id));
        }
        for (const r of insertedRows ?? []) {
          if (r?.dedupe_key && r?.id) idByKey.set(String(r.dedupe_key), Number(r.id));
        }

        const seen = new Set<string>();
        for (const it of chunk) {
          const dealerId = idByKey.get(String(it.dedupe_key));
          if (!dealerId) continue;
          const src = String(it.source ?? runSource).trim();
          if (!src) continue;
          const k = `${dealerId}|${src}`;
          if (seen.has(k)) continue;
          seen.add(k);
          sourceRuns.push({ dealer_id: dealerId, source: src, upload_run_id: uploadRunId });
        }

        if (sourceRuns.length) {
          // primary key includes upload_run_id, so duplicates are ignored by upsert
          await supabase.from("dealer_source_runs").upsert(sourceRuns, { onConflict: "dealer_id,source,upload_run_id" });
        }

        setMsg(`⏳ Import läuft… ${Math.min(i + chunk.length, prepared.length)} / ${prepared.length} verarbeitet (inserted ${inserted}, updated ${updated})`);
      }

      // Upload-Run aktualisieren
      await supabase
        .from("upload_runs")
        .update({
          inserted_count: inserted,
          updated_count: updated,
          skipped_count: skipped,
          error_count: 0,
        })
        .eq("id", uploadRunId);

      setMsg(`✅ Import abgeschlossen: inserted ${inserted}, updated ${updated}, skipped ${skipped}. (Upload-Run #${uploadRunId})`);
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
            <p className="cardSub">Excel auswählen → Mapping prüfen → Import nach Supabase (Upsert + Upload-Run Tracking).</p>
          </div>
          <div className="row">
            <Link className="pill" href="/admin/uploads">
              Uploads
            </Link>
            <Link className="pill" href="/admin/dealers">
              Dubletten
            </Link>
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

          <div className="grid" style={{ gap: 6, marginBottom: 10 }}>
            <div className="muted" style={{ fontSize: 13 }}>
              Hersteller/Quelle (wird im Upload-Run gespeichert und als "source" an Händler gehängt, falls keine Quelle-Spalte gemappt ist)
            </div>
            <input
              value={manualSource}
              onChange={(e) => setManualSource(e.target.value)}
              placeholder="z.B. FLYER"
            />
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

              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <label className="pill" style={{ cursor: "pointer" }} title="Wenn aktiv, überschreibt der Import vorhandene Werte">
                  <input type="checkbox" checked={overwriteExisting} onChange={(e) => setOverwriteExisting(e.target.checked)} />
                  Vorhandene Felder überschreiben
                </label>

                <label className="pill" style={{ cursor: "pointer" }} title="Löscht einen früheren Upload-Run vor dem Import">
                  <input type="checkbox" checked={rollbackEnabled} onChange={(e) => setRollbackEnabled(e.target.checked)} />
                  Rollback vor Import
                </label>

                {rollbackEnabled ? (
                  <select
                    value={rollbackRunId ?? ""}
                    onChange={(e) => setRollbackRunId(e.target.value ? Number(e.target.value) : null)}
                    style={{ minWidth: 320 }}
                  >
                    <option value="">Run auswählen…</option>
                    {runs.map((r) => {
                      const dt = r.created_at ? new Date(r.created_at).toLocaleString("de-DE") : "";
                      const label = `#${r.id} · ${dt} · ${r.source ?? "—"} · ${r.file_name ?? ""}`;
                      return (
                        <option key={r.id} value={r.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                ) : null}
              </div>

              <div className="row" style={{ marginTop: 6, gap: 10, flexWrap: "wrap" }}>
                <button className="btnPrimary" onClick={doImport} disabled={!canImport || importing || (rollbackEnabled && !rollbackRunId)}>
                  {importing ? "Import läuft…" : rollbackEnabled && rollbackRunId ? "Rollback + Import" : "Import starten"}
                </button>

                <Link className="pill" href="/admin/uploads">
                  Upload-Historie
                </Link>

                {lastRunId ? (
                  <>
                    <Link className="pill" href={`/admin/dealers?runId=${lastRunId}`}>
                      Dubletten dieses Uploads
                    </Link>
                    <Link className="pill" href="/geocoding">
                      Geocoding
                    </Link>
                  </>
                ) : null}
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

          {lastRunId ? (
            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Tipp: Wenn du mehrere Hersteller-Listen importierst, geh danach auf <Link href={`/admin/dealers?runId=${lastRunId}`} style={{ color: "#93c5fd" }}>Dubletten dieses Uploads</Link> und merge.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
