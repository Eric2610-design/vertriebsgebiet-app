"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";

type Row = Record<string, any>;

type Mapping = {
  name?: string;
  city?: string;
  street?: string;
};

export default function DealerUpload() {
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [status, setStatus] = useState<string>("Bitte Excel-Datei auswählen");
  const [busy, setBusy] = useState(false);

  /* ===============================
     1️⃣ Datei einlesen
     =============================== */
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Lese Datei …");
    setBusy(true);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data: Row[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (!data.length) {
      setStatus("❌ Datei enthält keine Daten");
      setBusy(false);
      return;
    }

    setRows(data);
    setHeaders(Object.keys(data[0]));
    setStatus("Spalten erkannt – bitte Mapping wählen");
    setBusy(false);
  }

  /* ===============================
     2️⃣ Import starten
     =============================== */
  async function startImport() {
    if (!mapping.name) {
      alert("Bitte eine Spalte für den Händlernamen auswählen.");
      return;
    }

    setBusy(true);
    setStatus("Importiere Händler …");

    const payload = rows
      .map((r) => ({
        name: String(r[mapping.name!]).trim(),
        city: mapping.city ? String(r[mapping.city]).trim() : null,
        street: mapping.street ? String(r[mapping.street]).trim() : null,
        source: "upload",
      }))
      .filter((r) => r.name);

    const { error } = await supabase.from("dealers").insert(payload);

    if (error) {
      setStatus(`❌ Fehler: ${error.message}`);
    } else {
      setStatus(`✅ Import erfolgreich: ${payload.length} Händler`);
    }

    setBusy(false);
  }

  /* ===============================
     UI
     =============================== */
  return (
    <main style={{ padding: 40, maxWidth: 800 }}>
      <h1>Händler-Upload</h1>

      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        disabled={busy}
      />

      <p style={{ marginTop: 12 }}>{status}</p>

      {headers.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>Spalten zuordnen</h3>

          {[
            { key: "name", label: "Händlername (Pflichtfeld)" },
            { key: "city", label: "Stadt" },
            { key: "street", label: "Straße" },
          ].map((f) => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label>{f.label}</label>
              <br />
              <select
                value={(mapping as any)[f.key] ?? ""}
                onChange={(e) =>
                  setMapping({ ...mapping, [f.key]: e.target.value || undefined })
                }
              >
                <option value="">— nicht zuordnen —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <button onClick={startImport} disabled={busy}>
            Import starten
          </button>
        </div>
      )}
    </main>
  );
}
