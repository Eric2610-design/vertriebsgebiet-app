import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET() {
  const supabase = supabaseService();

  const { data: profiles, error: perr } = await supabase
    .from("profiles")
    .select("id,display_name,email,role")
    .order("display_name", { ascending: true });

  if (perr) return bad(perr.message, 500);

  const { data: territories, error: terr } = await supabase
    .from("territories")
    .select("id,profile_email,country,plz2_from,plz2_to")
    .order("profile_email", { ascending: true });
  if (terr) return bad(terr.message, 500);

  return ok({ profiles: profiles ?? [], territories: territories ?? [] });
}
