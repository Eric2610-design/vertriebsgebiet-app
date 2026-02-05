import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function POST(_: Request, { params }: { params: { id: string; key: string } }) {
  const sb = supabaseService();
  const { error } = await sb
    .from("dealer_manufacturers")
    .upsert({ dealer_id: params.id, manufacturer_key: params.key }, { onConflict: "dealer_id,manufacturer_key" });
  if (error) return bad(error.message, 500);
  return ok({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string; key: string } }) {
  const sb = supabaseService();
  const { error } = await sb.from("dealer_manufacturers").delete().eq("dealer_id", params.id).eq("manufacturer_key", params.key);
  if (error) return bad(error.message, 500);
  return ok({ ok: true });
}
