import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

const BodySchema = z.object({ note: z.string().min(1).max(4000) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = BodySchema.parse(await req.json());
    const supabase = supabaseService();
    const { error } = await supabase.from("visits").insert({ dealer_id: params.id, note: body.note.trim() });
    if (error) return bad(error.message, 500);
    return ok({ ok: true });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
