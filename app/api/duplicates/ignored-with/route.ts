import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

function canonical(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dealer_id = String(url.searchParams.get("dealer_id") ?? "").trim();
  if (!dealer_id) return bad("dealer_id fehlt", 400);

  const supabase = supabaseService();
  try {
    const { data, error } = await supabase
      .from("dealer_duplicate_ignores")
      .select("dealer_id_a,dealer_id_b")
      .or(`dealer_id_a.eq.${dealer_id},dealer_id_b.eq.${dealer_id}`)
      .limit(20000);
    if (error) return bad(error.message, 500);
    const ignored_ids: string[] = [];
    for (const r of data ?? []) {
      const a = String((r as any).dealer_id_a ?? "");
      const b = String((r as any).dealer_id_b ?? "");
      if (!a || !b) continue;
      const other = a === dealer_id ? b : a;
      if (other && other !== dealer_id) ignored_ids.push(other);
    }
    return ok({ dealer_id, ignored_ids });
  } catch (e: any) {
    if (String(e?.message ?? "").includes("dealer_duplicate_ignores") && String(e?.message ?? "").includes("does not exist")) {
      return ok({ dealer_id, ignored_ids: [] });
    }
    return bad(e?.message ?? "Fehler", 500);
  }
}
