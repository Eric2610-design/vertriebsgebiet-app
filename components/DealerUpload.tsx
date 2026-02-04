"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";

type RowObj = Record<string, any>;

type ImportResult = {
  inserted: number;
  batches: number;
};

function getFirst<T = any>(obj: RowObj, keys: string[]): T | null {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k] as T;
  }
  return null;
}

function normString(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

async function insertInBatches(rows: any[], batchSize = 500): Promise<ImportResult> {
  let inserted = 0;
  let batches = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    batches += 1;

    const { error } = await supabase.from("dealers").insert(chunk);
    if (error) throw error;

    inserted += chunk.length;
  }

  return { inserted, batches };
}

export default function DealerUpload() {
  const [status, setStatus] = useState<string>("Wähle eine Excel-Datei aus…");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<ImportResult | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setLast(null);
    setStatus(`Lese Datei: ${file.name} …`);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows: RowObj[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

      if (!rawRows.length) {
        setStatus("Keine Zeilen gefunden (Sheet leer oder Header nicht erkannt).");
        setBusy(false);
        return;
      }

      // Mapping (best-effort): wir versuchen viele typische Spaltennamen
      // -> Zielspalten in Supabase: name, city, street, source, created_at
      const mapped = rawRows
        .map((r) => {
          const name = normString(
            getFirst(r, ["Name", "Händler", "Haendler", "Dealer", "Firma", "Unternehmen", "Shop"])
          );

          const city = normString(
            getFirst(r, ["Ort", "Stadt", "City", "Town"])
          );

          const street = normString(
            getFirst(r, ["Straße", "Strasse", "Street", "Adresse", "Address"])
          );

          // optional: Quelle/Datei
          const source = file.name;

          return { name, city, street, source };
        })
        // nur Zeilen mit Name behalten
        .filter((x) => x.name);

      if (!mapped.length) {
        setStatus(
          "Es wurden keine gültigen Händler erkannt (kein Name gefunden). Prüfe, ob die Spalten z. B. „Name“ / „Händler“ enthalten."
        );
        setBusy(false);
        return;
      }

      setStatus(`Importiere ${mapped.length} Händler nach Supabase …`);

      const res = await insertInBatches(mapped, 500);
      setLast(res);
      setStatus(`✅ Import fertig: ${res.inserted} Händler gespeichert (${res.batches} Batch(es)).`);
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Fehler beim Import: ${err?.message ?? String(err)}`);
    } finally {
      setBusy(false);
      // Reset input (damit gleiche Datei nochmal gewählt werden kann)
      e.target.value = "";
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 900 }}>
      <h1>Upload → Supabase</h1>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <p style={{ marginTop: 0 }}>
          Wähle deine Excel-Datei (.xlsx). Danach wird automatisch importiert.
        </p>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          disabled={busy}
        />

        <div style={{ marginTop: 12 }}>
          <strong>Status:</strong>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{status}</div>
        </div>

        {last && (
          <div style={{ marginTop: 12 }}>
            <a href="/admin/dealers">→ Zur Händlerliste (Admin)</a>
          </div>
        )}
      </div>

      <p style={{ marginTop: 16, opacity: 0.8 }}>
        Hinweis: Das Mapping ist „best effort“. Wenn deine Spalten anders heißen, passe ich dir die Schlüssel in
        <code style={{ padding: "0 6px" }}>DealerUpload.tsx</code> exakt an.
      </p>
    </main>
  );
}
