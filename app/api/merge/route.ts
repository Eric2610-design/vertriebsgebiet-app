import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

const BodySchema = z.object({
  master_id: z.string().uuid(),
  merge_ids: z.array(z.string().uuid()).min(1),
  reason: z.string().optional(),
});

type DealerRow = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  norm_street: string;
  norm_city: string;
};

function addrKey(d: DealerRow) {
  return `${d.norm_street}|${(d.zip ?? "").trim()}|${d.norm_city}|${(d.country ?? "").trim()}`;
}

async function moveForeignKeys(supabase: ReturnType<typeof supabaseService>, masterId: string, mergeIds: string[]) {
  const tables: Array<{ table: string; col: string }> = [
    { table: "dealer_manufacturers", col: "dealer_id" },
    { table: "dealer_sources", col: "dealer_id" },
    { table: "visits", col: "dealer_id" },
    { table: "dealer_contacts", col: "dealer_id" },
    { table: "flyer_invoice_lines", col: "dealer_id" },
    { table: "flyer_order_lines", col: "dealer_id" },
    { table: "demo_bikes", col: "dealer_id" },
    { table: "appointments", col: "dealer_id" },
  ];

  for (const t of tables) {
    const { error } = await supabase
      .from(t.table)
      .update({ [t.col]: masterId } as any)
      .in(t.col, mergeIds);
    // If the table doesn't exist, ignore (older schema)
    if (error && !/relation .* does not exist/i.test(error.message) && !/schema cache/i.test(error.message) && !/Could not find the table/i.test(error.message)) {
      throw new Error(`${t.table}: ${error.message}`);
    }
  }
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseService();
    const body = BodySchema.parse(await req.json());
    const mergeIds = Array.from(new Set(body.merge_ids)).filter((id) => id !== body.master_id);
    if (mergeIds.length === 0) return bad("Keine gültigen Merge-IDs", 400);

    const ids = [body.master_id, ...mergeIds];
    const { data: dealers, error } = await supabase
      .from("dealers")
      .select("id,name,street,zip,city,country,norm_street,norm_city")
      .in("id", ids)
      .limit(50);
    if (error) return bad(error.message, 500);
    if (!dealers || dealers.length !== ids.length) return bad("Nicht alle Händler gefunden", 400);

    const rows = dealers as unknown as DealerRow[];
    const master = rows.find((d) => d.id === body.master_id)!;
    const masterKey = addrKey(master);
    for (const d of rows) {
      if (addrKey(d) !== masterKey) {
        return bad("Merge nur erlaubt, wenn die Adresse exakt übereinstimmt (Straße/PLZ/Ort/Land).", 400);
      }
    }

    const snapshot = { master, merged: rows.filter((d) => d.id !== master.id) };

    await moveForeignKeys(supabase, body.master_id, mergeIds);

    // Remove branch links pointing to deleted dealers
    await supabase
      .from("dealers")
      .update({ parent_dealer_id: body.master_id })
      .in("parent_dealer_id", mergeIds);

    // Merge log
    for (const mid of mergeIds) {
      const { error: logErr } = await supabase.from("merge_log").insert({
        master_id: body.master_id,
        merged_id: mid,
        reason: body.reason ?? null,
        snapshot,
      } as any);
      if (logErr && !/relation .* does not exist/i.test(logErr.message)) {
        throw new Error(`merge_log: ${logErr.message}`);
      }
    }

    const { error: delErr } = await supabase.from("dealers").delete().in("id", mergeIds);
    if (delErr) return bad(delErr.message, 500);

    return ok({ ok: true, master_id: body.master_id, merged: mergeIds });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
