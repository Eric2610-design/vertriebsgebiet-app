import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseService();
    const body = await req.json();
    const visited_at = String(body?.visited_at ?? "").trim();
    if (!visited_at) return bad("visited_at fehlt", 400);
    const { error } = await sb.from("visits").insert({
      dealer_id: params.id,
      rep_email: body?.rep_email ?? null,
      visited_at,
      notes: body?.notes ?? null,
    });
    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e:any) {
    return bad(e?.message ?? "bad", 400);
  }
}
