import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET() {
  const sb = supabaseService();
  const { data, error } = await sb.from("app_settings").select("*").order("key");
  if (error) return bad(error.message, 500);
  return ok({ ok: true, settings: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const sb = supabaseService();
    const body = await req.json();
    const key = String(body?.key ?? "").trim();
    if (!key) return bad("key fehlt", 400);
    const value = body?.value;
    const { error } = await sb.from("app_settings").upsert({ key, value }, { onConflict: "key" });
    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e:any) {
    return bad(e?.message ?? "bad", 400);
  }
}
