import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

const BUYING_GROUP_KEYS = new Set(["zeg", "bico", "bikeco"]);

export async function GET() {
  const supabase = supabaseService();

  // try with icon fields (new schema)
  let data: any[] | null = null;
  const first = await supabase
    .from("manufacturers")
    .select("key,label,icon_data_url,icon_missing")
    .order("label", { ascending: true });

  if (!first.error) {
    data = first.data ?? [];
  } else {
    // fallback old schema
    const second = await supabase
      .from("manufacturers")
      .select("key,label")
      .order("label", { ascending: true });
    if (second.error) return bad(second.error.message, 500);
    data = (second.data ?? []).map((x: any) => ({ ...x, icon_data_url: null, icon_missing: false }));
  }

  const items = (data ?? []).filter((x: any) => !BUYING_GROUP_KEYS.has(x.key));
  return ok({ items });
}
