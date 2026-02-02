import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";
import crypto from "crypto";

function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function pickHeaders(ws: XLSX.WorkSheet, headerRow: number): string[] {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  const r = headerRow - 1;
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    const v = (cell?.v ?? "").toString().trim();
    if (v) headers.push(v);
  }
  return headers;
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const workspaceId = (form.get("workspaceId") as string) || "";
    const sourceTypeCode = (form.get("sourceTypeCode") as string) || "";

    if (!file || !workspaceId || !sourceTypeCode) {
      return NextResponse.json({ error: "file/workspaceId/sourceTypeCode fehlen." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();

    const { data: mem, error: memErr } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (memErr || !mem) return NextResponse.json({ error: "Kein Zugriff auf Workspace." }, { status: 403 });

    const { data: st, error: stErr } = await admin
      .from("source_types")
      .select("id, code")
      .eq("code", sourceTypeCode)
      .maybeSingle();
    if (stErr || !st) return NextResponse.json({ error: "Unbekannte Quelle." }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    const fileHash = sha256(buf);

    const dt = new Date();
    const stamp = dt.toISOString().replace(/[:.]/g, "-");
    const storagePath = `${workspaceId}/${sourceTypeCode}/${stamp}-${file.name}`;

    const up = await admin.storage.from("imports").upload(storagePath, buf, {
      contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
    if (up.error) throw up.error;

    const { data: run, error: runErr } = await admin
      .from("import_runs")
      .insert({
        workspace_id: workspaceId,
        source_type_id: st.id,
        original_filename: file.name,
        storage_path: storagePath,
        file_sha256: fileHash,
        status: "uploaded",
        created_by: userData.user.id,
      })
      .select("id")
      .single();
    if (runErr) throw runErr;

    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetNames = wb.SheetNames || [];
    const detectedSheetName = sheetNames[0] || "";
    const ws = wb.Sheets[detectedSheetName];
    const headerRow = 1;
    const headers = ws ? pickHeaders(ws, headerRow) : [];

    return NextResponse.json({
      importRunId: run.id,
      sheetNames,
      detectedSheetName,
      headers,
      headerRow,
      fileName: file.name,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Analyze failed" }, { status: 500 });
  }
}
