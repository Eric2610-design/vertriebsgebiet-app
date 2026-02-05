import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseService();
    const body = await req.json();
    const role = String(body?.role ?? "").trim();
    const name = String(body?.name ?? "").trim();
    if (!role || !name) return bad("role/name fehlen", 400);
    const { error } = await sb.from("dealer_contacts").insert({
      dealer_id: params.id,
      role,
      name,
      email: body?.email ?? null,
      phone: body?.phone ?? null,
    });
    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e:any) {
    return bad(e?.message ?? "bad", 400);
  }
}
