"use client";

import * as XLSX from "xlsx";

export type UploadedDealer = {
  id: number;
  name: string;
  city: string;
  street?: string;
  phone?: string;
  email?: string;
  lat: number;
  lng: number;
};

export default function UploadBox({
  onUpload,
}: {
  onUpload: (dealers: UploadedDealer[]) => void;
}) {
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      const data = evt.target?.result;
      if (!data) return;

      const workbook = XLSX.read(data, { type: "binary" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      // ⚠️ Spaltennamen ggf. anpassen!
      const dealers = rows.map((row, index) => ({
        id: index + 1,
        name: row.Name,
        city: row.Ort,
        street: row.Straße,
        phone: row.Telefon,
        email: row.Email,
        lat: Number(row.Lat),
        lng: Number(row.Lng),
      }));

      onUpload(dealers);
    };

    reader.readAsBinaryString(file);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 1000,
        background: "white",
        padding: 10,
        borderRadius: 6,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
    </div>
  );
}
