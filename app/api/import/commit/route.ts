import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { z } from "zod";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";

const CommitSchema = z.object({
  importRunId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sourceTypeCode: z.string().min(1),
  sheetName: z.string().min(1),
  headerRow: z.number().int().min(1),
  mapping: z.object({
    name: z.string().optional(),
    street: z.string().optional(),
    zipcode: z.string().optional(),
    city: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    website: z.string().optional(),
    external: z.record(z.string(), z.string()).optional(),
  })
});

function normalizeZip(v: any): string | null {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/\.0$/, "");
  if (/^\d+$/.test(s) && s.length < 5) s = s.padStart(5, "0");
  return s;
}

function cellToStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function toRowObject(headers: string[], row: any[]): Record<string, any> {
  const obj: Record<string, any> = {};
  for (let i = 0; i < headers.length; i++) obj[headers[i]] = row[i];
  return obj;
}

function territoryOk(zipcode: string | null): boolean {
  if (!zipcode) return false;
  const p2 = zipcode.slice(0,2);
  const n = parseInt(p2, 10);
  if (Number.isNaN(n)) return false;
  return (n>=35 && n<=36) || (n>=53 && n<=57) || (n>=60 && n<=69);
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const body = await req.json();
    const parsed = CommitSchema.parse(body);
    const admin = createSupabaseAdmin();

    const { data: mem, error: memErr } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", parsed.workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (memErr || !mem) return NextResponse.json({ error: "Kein Zugriff auf Workspace." }, { status: 403 });

    const { data: st, error: stErr } = await admin
      .from("source_types")
      .select("id, code")
      .eq("code", parsed.sourceTypeCode)
      .maybeSingle();
    if (stErr || !st) return NextResponse.json({ error: "Unbekannte Quelle." }, { status: 400 });

    const { data: run, error: runErr } = await admin
      .from("import_runs")
      .select("id, storage_path")
      .eq("id", parsed.importRunId)
      .eq("workspace_id", parsed.workspaceId)
      .maybeSingle();
    if (runErr || !run) return NextResponse.json({ error: "ImportRun nicht gefunden." }, { status: 404 });

    const cleanedExternal: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.mapping.external ?? {})) {
      if (v && v.trim()) cleanedExternal[k] = v.trim();
    }
    const mappingToSave = { ...parsed.mapping, external: Object.keys(cleanedExternal).length ? cleanedExternal : undefined };

    await admin
      .from("import_profiles")
      .upsert({
        workspace_id: parsed.workspaceId,
        source_type_id: st.id,
        sheet_name: parsed.sheetName,
        header_row: parsed.headerRow,
        mapping: mappingToSave,
      }, { onConflict: "workspace_id,source_type_id,sheet_name" });

    const dl = await admin.storage.from("imports").download(run.storage_path);
    if (dl.error) throw dl.error;

    const buf = Buffer.from(await dl.data.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[parsed.sheetName];
    if (!ws) return NextResponse.json({ error: "Sheet nicht gefunden." }, { status: 400 });

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    const headerIndex = parsed.headerRow - 1;
    const headers = (rows[headerIndex] ?? []).map((x:any)=>String(x ?? "").trim()).filter((x:any)=>x);
    if (!headers.length) return NextResponse.json({ error: "Headerzeile leer – bitte headerRow prüfen." }, { status: 400 });

    const dataRows = rows.slice(headerIndex + 1).filter(r => r && r.some((c:any)=>String(c ?? "").trim() !== ""));

    const inserts: any[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const obj = toRowObject(headers, row);

      const name = parsed.mapping.name ? cellToStr(obj[parsed.mapping.name]) : null;
      const street = parsed.mapping.street ? cellToStr(obj[parsed.mapping.street]) : null;
      const zipcode = parsed.mapping.zipcode ? normalizeZip(obj[parsed.mapping.zipcode]) : null;
      const city = parsed.mapping.city ? cellToStr(obj[parsed.mapping.city]) : null;
      const phone = parsed.mapping.phone ? cellToStr(obj[parsed.mapping.phone]) : null;
      const email = parsed.mapping.email ? cellToStr(obj[parsed.mapping.email]) : null;
      const website = parsed.mapping.website ? cellToStr(obj[parsed.mapping.website]) : null;

      const external_ids: Record<string, any> = {};
      for (const [k, col] of Object.entries(cleanedExternal)) external_ids[k] = cellToStr(obj[col]);

      obj.__in_territory = territoryOk(zipcode);

      inserts.push({
        workspace_id: parsed.workspaceId,
        import_run_id: parsed.importRunId,
        row_number: headerIndex + 2 + i,
        raw: obj,
        external_ids: Object.keys(external_ids).length ? external_ids : null,
        name, street, zipcode, city,
        country: "DE",
        phone, email, website,
      });
    }

    let imported = 0;
    const chunkSize = 500;
    for (let i = 0; i < inserts.length; i += chunkSize) {
      const chunk = inserts.slice(i, i + chunkSize);
      const { error } = await admin.from("source_records").insert(chunk);
      if (error) throw error;
      imported += chunk.length;
    }

    await admin.from("import_runs").update({ status: "parsed" }).eq("id", parsed.importRunId);

    let candidates = 0;
    const rpc = await admin.rpc("generate_match_candidates", { _workspace_id: parsed.workspaceId, _import_run_id: parsed.importRunId });
    if (!rpc.error) candidates = rpc.data ?? 0;

    await admin.from("import_runs").update({ status: "matched" }).eq("id", parsed.importRunId);

    return NextResponse.json({ imported, candidates });
  } catch (e: any) {
    const msg = e?.issues ? JSON.stringify(e.issues) : (e?.message ?? "Commit failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
