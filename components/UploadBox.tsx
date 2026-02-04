"use client";

import { useState } from "react";

export default function UploadBox() {
  const [file, setFile] = useState<File | null>(null);

  async function upload() {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await fetch("/api/upload", { method: "POST", body: formData });
    alert("Upload erfolgreich");
  }

  return (
    <div>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <br /><br />
      <button onClick={upload}>Hochladen</button>
    </div>
  );
}