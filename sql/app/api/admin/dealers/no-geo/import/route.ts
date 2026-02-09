import { supabaseService } from "@/lib/supabase";
import { requireAdmin } from "@/app/api/_admin";

function parseCsv(text: string) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { header: [], rows: [] as string[][] };

  // Support Excel 'sep=;' line
  if (/^sep=/.test(lines[0].toLowerCase())) {
    lines.shift();
  }

  const headerLine = lines.shift() as string;
  const delimiter = headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";

  const splitLine = (line: string) => {
    // simple CSV split with quotes
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === delimiter && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };

  const header = splitLine(headerLine).map((h) => h.replace(/^"|"$/g, "").trim());
  const rows = lines.map(splitLine);
  return { header, rows };
}

export async function POST(req: Request) {
  await requireAdmin();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "file_missing" }), { status: 400 });
  }

  const raw = Buffer.from(await file.arrayBuffer()).toString("utf8");
  const { header, rows } = parseCsv(raw);
  if (!header.length) {
    return new Response(JSON.stringify({ error: "csv_empty" }), { status: 400 });
  }

  const idxId = header.findIndex((h) => ["id", "uuid"].includes(h.toLowerCase()));
  const idxLat = header.findIndex((h) => h.toLowerCase() === "lat" || h.toLowerCase() === "latitude");
  const idxLng = header.findIndex((h) => h.toLowerCase() === "lng" || h.toLowerCase() === "lon" || h.toLowerCase() === "longitude");

  if (idxId < 0 || idxLat < 0 || idxLng < 0) {
    return new Response(
      JSON.stringify({ error: "header_missing", need: ["id/uuid", "lat", "lng"] }),
      { status: 400 }
    );
  }

  const updates: { id: string; lat: number; lng: number }[] = [];
  let skipped = 0;

  for (const r of rows) {
    const id = String(r[idxId] ?? "").replace(/^"|"$/g, "").trim();
    const lat = Number(String(r[idxLat] ?? "").replace(/^"|"$/g, "").trim());
    const lng = Number(String(r[idxLng] ?? "").replace(/^"|"$/g, "").trim());
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped++;
      continue;
    }
    updates.push({ id, lat, lng });
  }

  const supabase = supabaseService();
  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("dealers")
      .update({
        lat: u.lat,
        lng: u.lng,
        geocode_status: "manual",
        last_geocoded_at: new Date().toISOString(),
      })
      .eq("id", u.id);
    if (!error) updated++;
  }

  return new Response(
    JSON.stringify({ ok: true, updated, skipped: skipped + (rows.length - updates.length) }),
    { headers: { "content-type": "application/json" } }
  );
}
