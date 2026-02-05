import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET(req: Request) {
  const supabase = supabaseService();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) return ok({ items: [] });

  // Case-insensitive search by name; keep it small for dropdowns.
  const { data, error } = await supabase
    .from("dealers")
    .select("id,name,street,zip,city,country,parent_dealer_id,branch_label")
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(25);

  if (error) return bad(error.message, 500);
  return ok({ items: data ?? [] });
}
