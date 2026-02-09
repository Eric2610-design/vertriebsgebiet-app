import { ok, bad } from "@/app/api/_util";
import { supabaseService } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseService();
  // backorders_latest is a VIEW that already:
  // - picks latest backorder run
  // - assigns prio_no (row_number per article_no)
  // - joins latest stock run for frame_size
  // - resolves dealer country via dealer_sources external_id
  const { data, error } = await supabase
    .from("backorders_latest")
    .select(
      "id, prio_no, article_no, order_date, col_a, col_m, col_v, col_z, col_aa, col_ah, col_ak, col_ap, col_g, customer_no, dealer_name, dealer_country, col_price, frame_size"
    )
    .order("article_no", { ascending: true })
    .order("prio_no", { ascending: true });

  if (error) return bad(error.message, 500);
  return ok({ rows: data ?? [] });
}
