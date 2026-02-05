import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText } from "@/lib/normalize";

export async function GET() {
  const sb = supabaseService();
  const { data, error } = await sb.from("manufacturers").select("*").order("name");
  if (error) return bad(error.message, 500);
  return ok({ ok: true, manufacturers: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const sb = supabaseService();
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    if (!name) return bad("Name fehlt", 400);
    const key = normText(name).replace(/\s+/g, "_");
    const { error } = await sb.from("manufacturers").upsert({ key, name }, { onConflict: "key" });
    if (error) return bad(error.message, 500);
    return ok({ ok: true, key });
  } catch (e:any) {
    return bad(e?.message ?? "bad", 400);
  }
}
