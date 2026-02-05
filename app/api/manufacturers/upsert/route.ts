import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText } from "@/lib/normalize";

const BodySchema = z.object({
  key: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1),
});

function slugKey(label: string) {
  // Create a stable key like "riese_mueller".
  const s = normText(label).replace(/\s+/g, "_");
  return s || `m_${Date.now()}`;
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const supabase = supabaseService();
    const key = (body.key?.trim() || slugKey(body.label)).toLowerCase();
    const label = body.label.trim();

    const { data, error } = await supabase
      .from("manufacturers")
      .upsert({ key, label }, { onConflict: "key" })
      .select("key,label")
      .maybeSingle();
    if (error) return bad(error.message, 500);
    return ok({ item: data });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
