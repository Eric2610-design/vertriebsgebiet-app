import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));

    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("dealers")
      .select(
        "id,name,street,zipcode,postal_code,city,country,email,phone,website,source,lat,lng,is_master,duplicate_of,notes,geocode_status,geocode_error"
      )
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }

    const dealer: any = {
      ...data,
      zipcode: (data as any)?.zipcode ?? (data as any)?.postal_code ?? null,
    };

    return NextResponse.json({ ok: true, dealer });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
