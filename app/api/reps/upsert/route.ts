import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

const ProfileSchema = z.object({
  display_name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["rep","admin"]).default("rep"),
});

const TerritorySchema = z.object({
  profile_email: z.string().email(),
  country: z.string().min(1).default("DE"),
  plz2_from: z.number().int().min(0).max(99),
  plz2_to: z.number().int().min(0).max(99),
});

const BodySchema = z.object({
  profiles: z.array(ProfileSchema).default([]),
  territories: z.array(TerritorySchema).default([]),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const supabase = supabaseService();

    if (body.profiles.length) {
      const { error } = await supabase
        .from("profiles")
        .upsert(body.profiles, { onConflict: "email" });
      if (error) return bad(error.message, 500);
    }

    if (body.territories.length) {
      // territories has no unique key; we avoid duplicates by deleting and re-inserting per email
      const emails = [...new Set(body.territories.map((t) => t.profile_email))];
      for (const email of emails) {
        await supabase.from("territories").delete().eq("profile_email", email);
      }
      const { error } = await supabase.from("territories").insert(body.territories);
      if (error) return bad(error.message, 500);
    }

    return ok({ ok: true, profiles: body.profiles.length, territories: body.territories.length });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
