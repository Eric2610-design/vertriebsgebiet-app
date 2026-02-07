import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

const Schema = z.object({
  kind: z.enum(["manufacturer", "buying_group"]),
  key: z.string().min(1),
  data_url: z.string().min(10),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = Schema.parse(await req.json());

    if (!body.data_url.startsWith("data:image/")) {
      return bad("Bitte eine Bild-Datei hochladen.", 400);
    }

    const supabase = supabaseService();
    const table = body.kind === "manufacturer" ? "manufacturers" : "buying_groups";

    const { error } = await supabase
      .from(table)
      .update({ icon_data_url: body.data_url, icon_missing: false })
      .eq("key", body.key);

    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e: any) {
    return bad(e?.message === "admin_only" ? "admin_only" : e?.message || "Fehler", e?.status || 400);
  }
}
