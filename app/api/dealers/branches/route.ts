import { ok, bad } from "@/app/api/_util";
import { requireUser } from "@/app/api/_auth";

export async function GET(req: Request) {
  try {
    const { supabase } = await requireUser();
    const url = new URL(req.url);
    const parent_id = (url.searchParams.get("parent_id") ?? "").trim();
    if (!parent_id) return ok({ items: [] });

    const { data, error } = await supabase
      .from("dealers")
      .select("id,name,street,zip,city,country,zipcode_int,branch_label,parent_dealer_id")
      .eq("parent_dealer_id", parent_id)
      .order("name", { ascending: true })
      .limit(500);
    if (error) return bad(error.message, 500);
    return ok({ items: data ?? [] });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "unauthorized") return bad("unauthorized", 401);
    return bad(e?.message ?? "Failed", 500);
  }
}
