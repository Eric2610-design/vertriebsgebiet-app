import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { getUserContext, isAdminRole, inRanges } from "@/app/api/_userctx";

export async function GET(req: Request) {
  const ctx = await getUserContext();
  const url = new URL(req.url);
  const parent_id = (url.searchParams.get("parent_id") ?? "").trim();
  if (!parent_id) return ok({ items: [] });

  const supabase = supabaseService();
  const { data, error } = await supabase
    .from("dealers")
    .select("id,name,street,zip,city,country,zipcode_int,branch_label,parent_dealer_id")
    .eq("parent_dealer_id", parent_id)
    .order("name", { ascending: true })
    .limit(500);

  if (error) return bad(error.message, 500);
  const items = data ?? [];
  if (isAdminRole(ctx.role)) return ok({ items });
  if (ctx.role === "aussendienst") return ok({ items: items.filter((d: any) => inRanges(d.country, d.zipcode_int, ctx.ranges)) });
  return ok({ items: [] });
}
