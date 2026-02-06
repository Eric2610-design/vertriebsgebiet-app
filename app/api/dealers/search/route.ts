import { ok, bad } from "@/app/api/_util";
import { requireUser } from "@/app/api/_auth";

export async function GET(req: Request) {
  try {
    const { supabase } = await requireUser();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();

    if (!q) return ok({ items: [] });

    // Case-insensitive search by name; keep it small for dropdowns.
    const { data, error } = await supabase
      .from("dealers")
      .select("id,name,street,zip,city,country,zipcode_int,parent_dealer_id,branch_label")
      .ilike("name", `%${q}%`)
      .order("name", { ascending: true })
      .limit(25);

    if (error) return bad(error.message, 500);
    return ok({ items: data ?? [] });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "unauthorized") return bad("unauthorized", 401);
    if (msg === "forbidden") return bad("forbidden", 403);
    return bad(e?.message ?? "Search failed", 500);
  }
}
