"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { norm, normStreet } from "@/lib/dealerUtils";

type Mapping = {
  name: string;
  street: string;
  zipcode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
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
  };

  const normHeaders = headers.map((h) => ({ raw: h, n: normHeader(h) }));

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

function mergeValue(existing: any, incoming: any, overwrite: boolean) {
  const ex = String(existing ?? "").trim();
  const inc = String(incoming ?? "").trim();
  if (!inc) return ex || null;
  if (!ex) return inc;
  return overwrite ? inc : ex;
}

function unionBrands(a: any, b: any) {
  const arr = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(arr)).sort((x, y) => x.localeCompare(y, "de"));
}

export default function UploadWizard() {
  const search = useSearchParams();

  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>(() => guessMapping([]));
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [brand, setBrand] = useState<string>(""); // freies Textfeld

  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [rollbackEnabled, setRollbackEnabled] = useState(false);
  const [rollbackRunId, setRollbackRunId] = useState<number | null>(null);
  const [runs, setRuns] = useState<RunBrief[]>([]);
  const [lastRunId, setLastRunId] = useState<number | null>(null);

  useEffect(() => {
    const q = search?.get("reimport");
    const id = q ? Number(q) : NaN;
    if (Number.isFinite(id) && id > 0) {
      setRollbackEnabled(true);
      setRollbackRunId(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
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
      throw new Error(json.error ?? "Rollback fehlgeschlagen");
    }
  }

  function buildKey(name: any, street: any, zipcode: any, city: any) {
    return `${norm(name)}|${normStreet(street)}|${norm(zipcode)}|${norm(city)}`;
  }

  function compressPrepared(prepared: any[], overwrite: boolean) {
    // Dedup innerhalb der Datei nach dedupe_key
    // Merge-Regeln: Felder nicht zerstören (oder overwrite), brands union, source beliebig
    const byKey = new Map<string, any>();

    for (const it of prepared) {
      const k = String(it.dedupe_key ?? "").trim();
      if (!k) continue;

      const ex = byKey.get(k);
      if (!ex) {
        byKey.set(k, { ...it });
        continue;
      }

      byKey.set(k, {
        ...ex,
        name: mergeValue(ex.name, it.name, overwrite),
        street: mergeValue(ex.street, it.street, overwrite),
        zipcode: mergeValue(ex.zipcode, it.zipcode, overwrite),
        city: mergeValue(ex.city, it.city, overwrite),
        country: mergeValue(ex.country, it.country, overwrite),
        email: mergeValue(ex.email, it.email, overwrite),
        phone: mergeValue(ex.phone, it.phone, overwrite),
        website: mergeValue(ex.website, it.website, overwrite),
        source: mergeValue(ex.source, it.source, overwrite),
        brands: unionBrands(ex.brands, it.brands),
      });
    }

    return Array.from(byKey.values());
  }

  async function doImport() {
    if (!canImport) return;

    setImporting(true);
    setMsg("");
    setLastRunId(null);

    const runBrand = brand.trim() || null;

    // 1) Roh vorbereiten
    const preparedRaw = rows
      .map((r) => {
        const name = pick(r, mapping.name);
        if (!name) return null;

        const street = pick(r, mapping.street);
        const zipcode = pick(r, mapping.zipcode) ?? pick(r, "postal_code");
        const city = pick(r, mapping.city);

        const dedupe_key = buildKey(name, street, zipcode, city);

        return {
          name,
          street,
          zipcode,
          city,
          country: pick(r, mapping.country) ?? "Deutschland",
          email: pick(r, mapping.email),
          phone: pick(r, mapping.phone),
          website: pick(r, mapping.website),

          source: runBrand ?? fileName,
          dedupe_key,

          brands: runBrand ? [runBrand] : [],

          is_master: true,
          duplicate_of: null,
        };
      })
      .filter(Boolean) as any[];

    const skipped = rows.length - preparedRaw.length;

    // 2) Innerhalb der Datei deduplizieren (Kern-Fix!)
    const prepared = compressPrepared(preparedRaw, overwriteExisting);

    try {
      if (!prepared.length) {
        throw new Error("Es wurden keine gültigen Händler erkannt (kein Name gefunden). Prüfe Mapping.");
      }

      if (rollbackEnabled && rollbackRunId) {
        setMsg(`⏪ Rollback Run #${rollbackRunId} …`);
        await rollbackIfNeeded();
      }

      // Upload-Run anlegen
      const { data: run, error: runErr } = await supabase
        .from("upload_runs")
        .insert({
          file_name: fileName,
          source: runBrand ?? fileName,
          rows_in_file: rows.length,
          inserted_count: 0,
          updated_count: 0,
          skipped_count: skipped,
          error_count: 0,
          notes: `Mapping: name=${mapping.name || "-"}, street=${mapping.street || "-"}, zipcode=${mapping.zipcode || "-"}, city=${mapping.city || "-"}; brand=${runBrand ?? "-"}; overwrite=${overwriteExisting ? "yes" : "no"}; dedup_in_file=yes`,
        })
        .select("id")
        .single();

      if (runErr) throw runErr;
      const uploadRunId: number = run?.id;
      setLastRunId(uploadRunId);

      const chunkSize = 800;
      let inserted = 0;
      let updated = 0;

      for (let i = 0; i < prepared.length; i += chunkSize) {
        const chunk = prepared.slice(i, i + chunkSize);
        const keys = chunk.map((x: any) => x.dedupe_key).filter(Boolean);

        const { data: existingRows, error: exErr } = await supabase
          .from("dealers")
          .select("id,dedupe_key,name,street,zipcode,postal_code,city,country,email,phone,website,brands,source")
          .in("dedupe_key", keys);

        if (exErr) throw new Error(exErr.message);

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
              brands: unionBrands(ex.brands, it.brands),
              source: mergeValue(ex.source, it.source, overwriteExisting),
            });
          }
        }

        // Inserts (kann theoretisch trotzdem 23505 geben, wenn parallel was reinläuft -> fallback)
        let insertedRows: any[] = [];
        if (toInsert.length) {
          const { data: insData, error: insErr } = await supabase
            .from("dealers")
            .insert(toInsert)
            .select("id,dedupe_key");

          if (insErr) {
            // Fallback: wenn Duplicate-Key doch auftaucht (Race), dann behandeln wir als Upsert ohne upload_run_id
            const msg = String(insErr.message ?? "");
            if (msg.toLowerCase().includes("duplicate") || msg.includes("23505")) {
              const safeUp = toInsert.map(({ upload_run_id, ...rest }) => rest);
              const { error: upErr } = await supabase.from("dealers").upsert(safeUp, { onConflict: "dedupe_key" });
              if (upErr) throw new Error(upErr.message);
              // in diesem Fall zählen wir konservativ als updated
              updated += toInsert.length;
            } else {
              throw new Error(insErr.message);
            }
          } else {
            insertedRows = insData ?? [];
            inserted += toInsert.length;
          }
        }

        // Updates (Upsert by dedupe_key)
        if (toUpdate.length) {
          const { error: upErr } = await supabase.from("dealers").upsert(toUpdate, { onConflict: "dedupe_key" });
          if (upErr) throw new Error(upErr.message);
          updated += toUpdate.length;
        }

        // dealer_source_runs (Audit: welche Marke kam in welchem Run)
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
          const src = String((runBrand ?? fileName) || "").trim();
          if (!src) continue;
          const k = `${dealerId}|${src}`;
          if (seen.has(k)) continue;
          seen.add(k);
          sourceRuns.push({ dealer_id: dealerId, source: src, upload_run_id: uploadRunId });
        }

        if (sourceRuns.length) {
          await supabase.from("dealer_source_runs").upsert(sourceRuns, { onConflict: "dealer_id,source,upload_run_id" });
        }

        setMsg(
          `⏳ Import läuft… ${Math.min(i + chunk.length, prepared.length)} / ${prepared.length} (unique keys) · inserted ${inserted}, updated ${updated}`
        );
      }

      await supabase
        .from("upload_runs")
        .update({
          inserted_count: inserted,
          updated_count: updated,
          skipped_count: skipped,
          error_count: 0,
          notes: `brand=${runBrand ?? "-"}; unique_keys=${prepared.length}; raw_rows=${preparedRaw.length}; dedup_in_file=yes`,
        })
        .eq("id", uploadRunId);

      setMsg(
        `✅ Import abgeschlossen: inserted ${inserted}, updated ${updated}, skipped ${skipped}. Datei hatte ${preparedRaw.length} gültige Zeilen, davon ${prepared.length} eindeutige Händler (dedupe_key). (Run #${uploadRunId})`
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
            <p className="cardSub">Excel hochladen, Mapping prüfen, Import (Upsert) starten. Duplikate innerhalb der Datei werden automatisch zusammengeführt.</p>
          </div>
          <div className="row">
            <Link className="pill" href="/">← Zur Karte</Link>
            <Link className="pill" href="/admin/uploads">Uploads</Link>
            <Link className="pill" href="/admin/dealers">Dublettenkontrolle</Link>
          </div>
        </div>

        <div className="cardBody">
          <div className="row" style={{ alignItems: "end", flexWrap: "wrap", gap: 12 }}>
            <div style={{ minWidth: 260 }}>
              <label><strong>Datei</strong></label>
              <br />
              <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              {fileName ? <div style={{ marginTop: 6, opacity: 0.7 }}>{fileName}</div> : null}
            </div>

            <div style={{ minWidth: 260 }}>
              <label><strong>Hersteller / Marke (frei)</strong></label>
              <br />
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder='z.B. "BICO" oder "Flyer"'
                style={{ width: "100%" }}
              />
              <div style={{ marginTop: 6, opacity: 0.7 }}>
                Wird in <code>brands</code> gespeichert und bei gleichen Händlern automatisch zusammengeführt.
              </div>
            </div>

            <div style={{ minWidth: 220 }}>
              <label><strong>Optionen</strong></label>
              <div style={{ marginTop: 6 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={overwriteExisting} onChange={(e) => setOverwriteExisting(e.target.checked)} />
                  Vorhandene Felder überschreiben
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                  <input type="checkbox" checked={rollbackEnabled} onChange={(e) => setRollbackEnabled(e.target.checked)} />
                  Vorher Rollback (Run löschen)
                </label>
                {rollbackEnabled ? (
                  <div style={{ marginTop: 6 }}>
                    <select
                      value={rollbackRunId ?? ""}
                      onChange={(e) => setRollbackRunId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Run auswählen…</option>
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          #{r.id} · {new Date(r.created_at).toLocaleString("de-DE")} · {r.file_name ?? ""} · {r.source ?? ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {quality ? (
            <div className="row" style={{ marginTop: 12, flexWrap: "wrap", gap: 10 }}>
              <span className="badge">Zeilen: {quality.total}</span>
              <span className="badge">Name: {quality.hasName}</span>
              <span className="badge">Straße: {quality.hasStreet}</span>
              <span className="badge">PLZ: {quality.hasZip}</span>
              <span className="badge">Ort: {quality.hasCity}</span>
              <span className="badge">vollständig (Name+Straße+PLZ+Ort): {quality.full}</span>
            </div>
          ) : null}

          <hr style={{ margin: "16px 0" }} />

          <h4 style={{ marginTop: 0 }}>Mapping</h4>
          <div className="grid grid3" style={{ gap: 12 }}>
            {FIELDS.map((f) => (
              <div key={f.key} className="card" style={{ border: "1px solid #eee" }}>
                <div className="cardBody">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    {f.label} {f.required ? <span style={{ color: "#b00" }}>*</span> : null}
                  </div>
                  <select
                    value={(mapping as any)[f.key] ?? ""}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ width: "100%" }}
                  >
                    <option value="">—</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 14, flexWrap: "wrap", gap: 10 }}>
            <button className="pill" disabled={!canImport || importing} onClick={doImport}>
              {importing ? "Import läuft…" : "Import starten"}
            </button>

            {lastRunId ? (
              <Link className="pill" href={`/admin/uploads`}>
                Uploads ansehen (Run #{lastRunId}) →
              </Link>
            ) : null}

            {msg ? <span className={msg.startsWith("❌") ? "badge danger" : "badge"}>{msg}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
