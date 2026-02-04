import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function DELETE(_: Request, { params }: { params: { id: string, key: string } }) {
  const supabase = supabaseService();
  const { error } = await supabase
    .from("dealer_manufacturers")
    .delete()
    .eq("dealer_id", params.id)
    .eq("manufacturer_key", params.key);
  if (error) return bad(error.message, 500);
  return ok({ ok: true });
}
