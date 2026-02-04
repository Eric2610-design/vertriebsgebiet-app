import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function parseBool(v: string | null) {
  return v === "1" || v === "true" || v === "yes";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") ?? "").trim();
    const onlyMaster = parseBool(searchParams.get("onlyMaster"));
    const withGeo = parseBool(searchParams.get("withGeo"));

    const sourceParam = (searchParams.get("source") ?? "").trim();
    const sources = sourceParam
      ? sourceParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const uploadRunIdRaw = (searchParams.get("uploadRunId") ?? "").trim();
    const uploadRunId = uploadRunIdRaw ? Number(uploadRunIdRaw) : NaN;

    const limit = Math.min(Number(searchParams.get("limit") ?? "2000"), 20000);

    const sb = supabaseServer();

    let query = sb
      .from("dealers")
      .select(
        "id,name,street,zipcode,postal_code,city,country,email,phone,website,source,upload_run_id,lat,lng,is_master,duplicate_of,notes,geocode_status",
        { count: "exact" }
      )
      .limit(limit)
      .order("id", { ascending: true });

    if (onlyMaster) {
      query = query.eq("is_master", true).is("duplicate_of", null);
    }

    if (withGeo) {
      query = query.not("lat", "is", null).not("lng", "is", null);
    }


    if (Number.isFinite(uploadRunId) && uploadRunId > 0) {
      query = query.eq("upload_run_id", uploadRunId);
    }
    if (sources.length === 1) {
      query = query.eq("source", sources[0]);
    } else if (sources.length > 1) {
      query = query.in("source", sources);
    }

    if (q) {
      // search in name, city, zipcode, street
      const like = `%${q}%`;
      query = query.or(
        `name.ilike.${like},city.ilike.${like},zipcode.ilike.${like},street.ilike.${like}`
      );
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // normalize: some datasets use postal_code; map to zipcode when zipcode missing
    const dealers = (data ?? []).map((d: any) => ({
      ...d,
      zipcode: d.zipcode ?? d.postal_code ?? null,
    }));

    return NextResponse.json({ ok: true, dealers, count: count ?? dealers.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
