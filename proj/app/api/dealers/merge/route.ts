import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function pickFirst<T>(...vals: (T | null | undefined)[]) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length) return (s as any) as T;
      continue;
    }
    return v as T;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const masterId = Number(body?.masterId);
    const duplicateIds = Array.isArray(body?.duplicateIds)
      ? body.duplicateIds.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n))
      : [];

    if (!Number.isFinite(masterId) || !duplicateIds.length) {
      return NextResponse.json({ ok: false, error: "masterId + duplicateIds required" }, { status: 400 });
    }

    const sb = supabaseServer();

    const { data: master, error: mErr } = await sb
      .from("dealers")
      .select("*")
      .eq("id", masterId)
      .single();

    if (mErr || !master) {
      return NextResponse.json({ ok: false, error: mErr?.message ?? "Master not found" }, { status: 404 });
    }

    const { data: dups, error: dErr } = await sb
      .from("dealers")
      .select("*")
      .in("id", duplicateIds);

    if (dErr) {
      return NextResponse.json({ ok: false, error: dErr.message }, { status: 400 });
    }

    // Merge missing fields into master (best-effort, safe)
    const merged: any = {
      is_master: true,
      duplicate_of: null,
      street: pickFirst(master.street, ...dups!.map((d: any) => d.street)),
      zipcode: pickFirst(master.zipcode, ...dups!.map((d: any) => d.zipcode), ...dups!.map((d: any) => d.postal_code)),
      city: pickFirst(master.city, ...dups!.map((d: any) => d.city)),
      country: pickFirst(master.country, ...dups!.map((d: any) => d.country)),
      email: pickFirst(master.email, ...dups!.map((d: any) => d.email)),
      phone: pickFirst(master.phone, ...dups!.map((d: any) => d.phone)),
      website: pickFirst(master.website, ...dups!.map((d: any) => d.website)),
      lat: pickFirst(master.lat, ...dups!.map((d: any) => d.lat)),
      lng: pickFirst(master.lng, ...dups!.map((d: any) => d.lng)),
    };

    // Keep geocode status if master has none
    if (!master.geocode_status) {
      merged.geocode_status = pickFirst(master.geocode_status, ...dups!.map((d: any) => d.geocode_status));
      merged.geocode_error = pickFirst(master.geocode_error, ...dups!.map((d: any) => d.geocode_error));
    }

    const { error: upErr } = await sb.from("dealers").update(merged).eq("id", masterId);
    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
    }

    const { error: duErr } = await sb
      .from("dealers")
      .update({ is_master: false, duplicate_of: masterId })
      .in("id", duplicateIds);

    if (duErr) {
      return NextResponse.json({ ok: false, error: duErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, masterId, duplicateIds });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
