import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function POST(req: Request) {
  const supabase = supabaseService();
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const dealerId = String(body?.dealer_id ?? "").trim();
  const reason = String(body?.reason ?? "geo-no-match").trim();
  if (!dealerId) return bad("Missing dealer_id", 400);

  // Mark as excluded so it disappears from the no-geo list.
  // We keep data for audit, but it won't show up unless explicitly requested.
  const { error } = await supabase
    .from("dealers")
    .update({ status: "excluded" })
    .eq("id", dealerId);

  if (error) return bad(error.message, 500);

  return ok({ ok: true, dealer_id: dealerId, status: "excluded", reason });
}
