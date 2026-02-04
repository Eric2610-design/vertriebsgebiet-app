"use client";

import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { norm, normStreet } from "@/lib/dealerUtils";

type Row = Record<string, any>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function pick(row: Row, key: string | undefined) {
  if (!key) return null;
  const v = row[key];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function buildDedupeKey(name: any, street: any, zipcode: any, city: any) {
  // Straße bewusst mit drin, sonst kollidieren zu viele "Fahrrad XXL" etc.
  return `${norm(name)}|${normStreet(street)}|${norm(zipcode)}|${norm(city)}`;
}

function mergeValue(existing: any, incoming: any, overwrite: boolean) {
  if (overwrite) return incoming ?? existing ?? null;
  return existing ?? incoming ?? null;
}

function mergeSource(existing: any, incoming: any) {
  const a = String(existing ?? "").trim();
  const b = String(incoming ?? "").trim();
  if (!a) return b || null;
  if (!b) return a || null;

  // Beide behalten (deterministisch sortiert)
  const parts = uniq(
    `${a};${b}`
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
  ).sort();
  return parts.join(";");
}

async function parseXlsx(file: File) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: null });
  return json;
}

// Supabase REST nutzt bei `.in()` Query-Parameter. Bei sehr vielen Keys wird die URL zu lang (400).
// Daher holen wir existierende Dealer in kleinen Batches.
async function fetchExistingDealersByDedupeKeys(keys: string[]) {
  const out = new Map<string, any>();
  const BATCH = 50; // konservativ, damit die URL klein bleibt

  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);

    const { data, error } = await supabase
      .from("dealers")
      // bewusst ohne `brands` (falls Spalte noch nicht existiert)
      .select(
        "id,dedupe_key,name,source,street,zipcode,postal_code,city,country,email,phone,website"
      )
      .in("dedupe_key", batch);

    if (error) throw new Error(error.message);

    for (const r of data ?? []) {
      if (r?.dedupe_key) out.set(String(r.dedupe_key), r);
    }
  }

  return out;
}

export default function UploadWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string>("");

  const [runSource, setRunSource] = useState<string>("flyer");
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(false);

  const [mapping, setMapping] = useState({
    name: "name",
    street: "street",
    zipcode: "zipcode",
    city: "city",
    country: "country",
    email: "email",
    phone: "phone",
    website: "website",
    source: "source",
  });

  const canImport = useMemo(() => {
    return rows.length > 0 && mapping.name && mapping.zipcode && mapping.city;
  }, [rows.length, mapping]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setLog("");
    setRows([]);
    setHeaders([]);

    if (!f) return;

    setLoading(true);
    try {
      const data = await parseXlsx(f);
      setRows(data);
      setHeaders(data.length ? Object.keys(data[0] ?? {}) : []);
      setLog((p) => p + `\n✅ Datei gelesen: ${data.length} Zeilen`);
    } catch (err: any) {
      console.error(err);
      setLog((p) => p + `\n❌ Fehler beim Einlesen: ${err?.message ?? String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function startImport() {
    if (!canImport) return;

    setLoading(true);
    setLog((p) => p + "\n⏳ Import gestartet ...");

    try {
      // 1) Upload-Run erzeugen
      const { data: uploadRun, error: runErr } = await supabase
        .from("upload_runs")
        .insert({
          filename: file?.name ?? null,
          source: runSource,
          total_rows: rows.length,
        })
        .select("id")
        .single();

      if (runErr) throw new Error(runErr.message);
      const uploadRunId = uploadRun.id as string;

      // 2) Rows -> normalized dealer candidates
      const prepared = rows
        .map((r) => {
          const name = pick(r, mapping.name);
          if (!name) return null;

          const zipcode = pick(r, mapping.zipcode) ?? pick(r, "postal_code");
          const city = pick(r, mapping.city);
          const street = pick(r, mapping.street);
          const src = (pick(r, mapping.source) ?? runSource) as string;

          const dedupe_key = buildDedupeKey(name, street, zipcode, city);

          return {
            dedupe_key,
            name,
            street,
            zipcode,
            postal_code: zipcode,
            city,
            country: pick(r, mapping.country),
            email: pick(r, mapping.email),
            phone: pick(r, mapping.phone),
            website: pick(r, mapping.website),
            source: src,
          };
        })
        .filter(Boolean) as any[];

      const keys = uniq(
        prepared
          .map((x) => String(x.dedupe_key ?? ""))
          .filter((x) => x.length > 0)
      );

      // 3) Existing (chunked, damit keine 400 URL-Länge)
      const existingByKey = await fetchExistingDealersByDedupeKeys(keys);

      // 4) Upsert-Plan bauen: neue Dealer rein, bestehende nur optional updaten
      const toInsert: any[] = [];
      const toUpdate: any[] = [];
      const sourceRuns: any[] = [];
      const seenInsert = new Set<string>();

      // Chunk-weise arbeiten, damit memory ruhig bleibt
      const CHUNK = 1000;
      for (let i = 0; i < prepared.length; i += CHUNK) {
        const chunk = prepared.slice(i, i + CHUNK);

        for (const it of chunk) {
          const key = String(it.dedupe_key);
          const ex = existingByKey.get(key);

          if (!ex) {
            const k = String(it.dedupe_key ?? "");
            if (k && seenInsert.has(k)) continue; // Duplikate im selben Upload verhindern
            if (k) seenInsert.add(k);

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
              zipcode: mergeValue(ex.zipcode, it.zipcode, overwriteExisting),
              postal_code: mergeValue(ex.postal_code, it.postal_code, overwriteExisting),
              city: mergeValue(ex.city, it.city, overwriteExisting),
              country: mergeValue(ex.country, it.country, overwriteExisting),
              email: mergeValue(ex.email, it.email, overwriteExisting),
              phone: mergeValue(ex.phone, it.phone, overwriteExisting),
              website: mergeValue(ex.website, it.website, overwriteExisting),
              source: mergedSource,
            });
          }

          // Upload-Run->Dealer Zuordnung (optional)
          sourceRuns.push({
            upload_run_id: uploadRunId,
            source: runSource,
            dedupe_key: it.dedupe_key,
          });
        }
      }

      setLog((p) =>
        p +
        `\n🧩 Kandidaten: ${prepared.length} | Keys: ${keys.length} | neu: ${toInsert.length} | update: ${toUpdate.length}`
      );

      // 5) Insert neue Dealer (bulk)
      if (toInsert.length) {
        const { error: insErr } = await supabase.from("dealers").insert(toInsert);
        if (insErr) throw new Error(insErr.message);
      }

      // 6) Update bestehende Dealer (bulk in kleinen Batches)
      if (toUpdate.length) {
        const B = 200;
        for (let i = 0; i < toUpdate.length; i += B) {
          const batch = toUpdate.slice(i, i + B);

          // Kein echtes bulk-update in PostgREST ohne RPC:
          // wir machen es als einzelne upserts auf dedupe_key
          const { error: upErr } = await supabase
            .from("dealers")
            .upsert(batch, { onConflict: "dedupe_key" });

          if (upErr) throw new Error(upErr.message);
        }
      }

      // 7) Markiere Upload-Run als fertig
      const { error: finErr } = await supabase
        .from("upload_runs")
        .update({
          inserted_count: toInsert.length,
          updated_count: toUpdate.length,
          status: "done",
        })
        .eq("id", uploadRunId);

      if (finErr) throw new Error(finErr.message);

      setLog((p) => p + `\n✅ Fertig. Upload-Run: ${uploadRunId}`);
    } catch (err: any) {
      console.error(err);
      setLog((p) => p + `\n❌ Import Fehler: ${err?.message ?? String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-4">
      <div className="rounded-2xl shadow-sm border border-gray-200 p-4 bg-white">
        <h2 className="text-xl font-semibold mb-2">Upload</h2>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".xlsx,.xls" onChange={onFileChange} />

            <select
              value={runSource}
              onChange={(e) => setRunSource(e.target.value)}
              className="border rounded-lg px-2 py-1"
              title="Quelle"
            >
              <option value="flyer">Flyer</option>
              <option value="riese_mueller">Riese &amp; Müller</option>
              <option value="zeg">ZEG</option>
              <option value="bico">BICO</option>
              <option value="cube">Cube</option>
              <option value="kalkhoff">Kalkhoff</option>
              <option value="sonstige">Sonstige</option>
            </select>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
              />
              Bestehende Felder überschreiben
            </label>

            <button
              onClick={startImport}
              disabled={!canImport || loading}
              className="px-3 py-2 rounded-xl bg-black text-white disabled:opacity-50"
            >
              {loading ? "..." : "Import starten"}
            </button>
          </div>

          {headers.length > 0 && (
            <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
              <div className="text-sm font-medium mb-2">Mapping</div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(
                  [
                    ["name", "Name*"],
                    ["street", "Straße"],
                    ["zipcode", "PLZ*"],
                    ["city", "Ort*"],
                    ["country", "Land"],
                    ["email", "E-Mail"],
                    ["phone", "Telefon"],
                    ["website", "Webseite"],
                    ["source", "Quelle (optional)"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="text-sm">
                    <div className="mb-1">{label}</div>
                    <select
                      className="w-full border rounded-lg px-2 py-1"
                      value={(mapping as any)[k] ?? ""}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [k]: e.target.value }))
                      }
                    >
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 p-3 bg-white">
            <div className="text-sm font-medium mb-2">Log</div>
            <pre className="text-xs whitespace-pre-wrap">{log}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
