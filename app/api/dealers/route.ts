import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET(req: Request) {
  try {
    const sb = supabaseService();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "1000"), 5000);
    const cursor = Number(url.searchParams.get("cursor") ?? "0");

    const { data, error } = await sb
      .from("dealers")
      .select("id,identity_key,name,street,zip,city,country,lat,lng,parent_dealer_id,branch_label,updated_at")
      .order("name", { ascending: true })
      .range(cursor, cursor + limit - 1);

    if (error) return bad(error.message, 500);

    const nextCursor = data && data.length === limit ? cursor + limit : null;
    return ok({ ok: true, dealers: data ?? [], nextCursor });
  } catch (e: any) {
    return bad(e?.message ?? "failed", 500);
  }
}
