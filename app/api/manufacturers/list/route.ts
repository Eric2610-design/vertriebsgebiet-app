import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET() {
  const supabase = supabaseService();
  const { data, error } = await supabase
    .from("manufacturers")
    .select("key,label")
    .order("label", { ascending: true });

  if (error) return bad(error.message, 500);
  return ok({ items: data ?? [] });
}
