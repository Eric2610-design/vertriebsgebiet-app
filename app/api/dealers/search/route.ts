import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { getUserContext, isAdminRole, inRanges } from "@/app/api/_userctx";

export async function GET(req: Request) {
  const supabase = supabaseService();
  const ctx = await getUserContext();
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
  const items = data ?? [];

  if (isAdminRole(ctx.role)) return ok({ items });
  if (ctx.role === "aussendienst") {
    return ok({ items: items.filter((d: any) => inRanges(d.country, d.zipcode_int, ctx.ranges)) });
  }
  return ok({ items: [] });
}
