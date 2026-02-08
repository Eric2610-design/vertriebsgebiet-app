import { supabaseService } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = supabaseService();

    const { data: items, error } = await supabase
      .from("v_dealers_map_ui")
      .select("*");

    if (error) {
      return Response.json(
        { error: "Supabase dealers query failed", supabase_error: error },
        { status: 500 }
      );
    }

    // Hersteller sind schon drin (manufacturer_keys + has_flyer)
    return Response.json({ items: items ?? [] }, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
