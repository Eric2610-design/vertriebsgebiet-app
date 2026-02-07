import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

function canonicalPair(a: string, b: string) {
  const aa = String(a);
  const bb = String(b);
  return aa < bb ? [aa, bb] : [bb, aa];
}

export async function POST(req: Request) {
  const supabase = supabaseService();
  const body = await req.json().catch(() => null);

  const dealer_id = String(body?.dealer_id ?? "").trim();
  const ignore_ids = Array.isArray(body?.ignore_ids) ? (body.ignore_ids as any[]).map((x) => String(x).trim()) : [];
  const reason = body?.reason ? String(body.reason) : null;

  if (!dealer_id) return bad("dealer_id fehlt", 400);
  if (ignore_ids.length === 0) return bad("ignore_ids fehlt", 400);

  const rows = ignore_ids
    .filter((x) => x && x !== dealer_id)
    .map((x) => {
      const [a, b] = canonicalPair(dealer_id, x);
      return { dealer_id_a: a, dealer_id_b: b, reason };
    });

  if (rows.length === 0) return bad("Keine gültigen Paare", 400);

  // Use upsert to avoid breaking on already ignored pairs.
  const { error } = await supabase
    .from("dealer_duplicate_ignores")
    .upsert(rows, { onConflict: "dealer_id_a,dealer_id_b", ignoreDuplicates: true })
    .select("id")
    .throwOnError()
    .catch((e: any) => ({ error: e }));

  // If the insert fails because the table doesn't exist yet, return a helpful message.
  if ((error as any)?.message?.includes("dealer_duplicate_ignores") && (error as any)?.message?.includes("does not exist")) {
    return bad(
      "Tabelle dealer_duplicate_ignores fehlt. Bitte SQL-Migration sql/03_dealer_duplicate_ignores.sql in Supabase ausführen.",
      500
    );
  }
  if (error) return bad((error as any)?.message ?? "Konnte Ignore nicht speichern", 500);

  return ok({ inserted: rows.length });
}
