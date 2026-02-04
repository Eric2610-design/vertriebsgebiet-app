"use client";

import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient";

export default function UploadBox() {
  async function handleFile(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (evt) => {
      const data = evt.target?.result;
      if (!data) return;

      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      const dealers = rows.map((row) => ({
        name: row.Name ?? row.Händler ?? null,
        street: row.Straße ?? null,
        city: row.Ort ?? row.Stadt ?? null,
        zip: row.PLZ ?? null,
        phone: row.Telefon ?? null,
        email: row.Email ?? null,
        website: row.Website ?? row.URL ?? null,
        source_file: file.name,
      }));

      const { error } = await supabase
        .from("dealers")
        .insert(dealers);

      if (error) {
        console.error("❌ Supabase error", error);
        alert("Fehler beim Speichern");
      } else {
        alert(`✅ ${dealers.length} Händler gespeichert`);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  return (
    <div style={{ padding: 20 }}>
      <h3>Händler-Excel hochladen</h3>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
      />
    </div>
  );
}
