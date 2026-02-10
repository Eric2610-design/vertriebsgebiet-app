import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { fetchAllPaged } from "@/lib/supabasePaging";

export async function GET() {
  const supabase = supabaseService();

  try {
    const profiles = await fetchAllPaged(
      (from, to) =>
        supabase
          .from("profiles")
          .select("id,display_name,email,role")
          .order("display_name", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize: 1000, maxRows: 10000 }
    );

    const territories = await fetchAllPaged(
      (from, to) =>
        supabase
          .from("territories")
          .select("id,profile_email,country,plz2_from,plz2_to")
          .order("profile_email", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize: 1000, maxRows: 100000 }
    );

    return ok({ profiles: profiles ?? [], territories: territories ?? [] });
  } catch (e: any) {
    return bad(e?.message ?? "Failed to load reps list", 500);
  }
}
