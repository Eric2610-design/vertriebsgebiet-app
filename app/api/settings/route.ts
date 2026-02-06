import { supabaseService } from "@/lib/supabase";
import { bad, ok } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const supabase = supabaseService();

  if (key) {
    const { data, error } = await supabase.from("app_settings").select("*").eq("key", key).maybeSingle();
    if (error) return bad(error.message, 500);
    return ok({ setting: data ?? null });
  }

  const { data, error } = await supabase.from("app_settings").select("*").order("key");
  if (error) return bad(error.message, 500);
  return ok({ settings: data ?? [] });
}

export async function PUT(req: Request) {
  try {
    requireAdmin(req);
  } catch {
    return bad("admin_only", 403);
  }
  const supabase = supabaseService();
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }
  const key = String(body?.key ?? "").trim();
  const value = body?.value;

  if (!key) return bad("Missing key");
  if (value === undefined) return bad("Missing value");

  const { data, error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("*")
    .maybeSingle();

  if (error) return bad(error.message, 500);
  return ok({ setting: data });
}
