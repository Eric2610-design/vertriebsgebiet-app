import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const sb = supabaseService();
  const { data: dealer, error } = await sb
    .from("dealers")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return bad(error.message, 500);
  if (!dealer) return bad("not found", 404);

  const { data: mans } = await sb
    .from("dealer_manufacturers")
    .select("manufacturer_key, manufacturers(name,color)")
    .eq("dealer_id", params.id);

  const { data: contacts } = await sb.from("dealer_contacts").select("*").eq("dealer_id", params.id).order("created_at");
  const { data: visits } = await sb.from("visits").select("*").eq("dealer_id", params.id).order("visited_at", { ascending: false });

  const { data: inv } = await sb.from("flyer_invoice_lines").select("*").eq("dealer_id", params.id).limit(50);
  const { data: ord } = await sb.from("flyer_order_lines").select("*").eq("dealer_id", params.id).limit(50);

  return ok({ ok: true, dealer, manufacturers: mans ?? [], contacts: contacts ?? [], visits: visits ?? [], invoices: inv ?? [], orders: ord ?? [] });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseService();
    const body = await req.json();
    const allowed: any = {};
    for (const k of ["name","street","zip","city","country","branch_label","parent_dealer_id","lat","lng"]) {
      if (k in body) allowed[k] = body[k];
    }
    const { error } = await sb.from("dealers").update({ ...allowed, updated_at: new Date().toISOString() }).eq("id", params.id);
    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e:any) {
    return bad(e?.message ?? "bad", 400);
  }
}
