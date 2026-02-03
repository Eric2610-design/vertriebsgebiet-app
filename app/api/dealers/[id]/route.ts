import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getAccessTokenFromCookies(): string | null {
  const all = cookies().getAll();

  // 1) klassisch: sb-access-token
  const direct = all.find((c) => c.name === "sb-access-token")?.value;
  if (direct) return direct;

  // 2) auth-helpers cookie: sb-<project-ref>-auth-token
  const authCookie = all.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  )?.value;

  if (!authCookie) return null;

  const tryParse = (raw: string): any | null => {
    try {
      return JSON.parse(raw);
    } catch {}
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {}
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch {}
    return null;
  };

  const parsed = tryParse(authCookie);
  if (!parsed) return null;

  // manchmal Array, manchmal Objekt
  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
  return obj?.access_token ?? null;
}

function supabaseUserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = getAccessTokenFromCookies();

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dealerId = params.id;

    if (!dealerId) {
      return NextResponse.json({ ok: false, error: "missing dealer id" }, { status: 400 });
    }

    const supabase = supabaseUserClient();

    // Auth check
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ ok: false, error: "not authenticated" }, { status: 401 });
    }

    // Dealer
    const { data: dealer, error: dealerErr } = await supabase
      .schema("app")
      .from("dealers")
      .select("id, workspace_id, name, email, phone, website, created_at")
      .eq("id", dealerId)
      .maybeSingle();

    if (dealerErr) {
      return NextResponse.json(
        { ok: false, error: "DB error loading dealer", details: dealerErr },
        { status: 500 }
      );
    }
    if (!dealer) {
      return NextResponse.json({ ok: false, error: "dealer not found" }, { status: 404 });
    }

    // Locations
    const { data: locations, error: locErr } = await supabase
      .schema("app")
      .from("dealer_locations")
      .select("id, label, street, zipcode, city, country, phone, email, website, lat, lng, is_primary")
      .eq("dealer_id", dealerId)
      .order("is_primary", { ascending: false });

    if (locErr) {
      return NextResponse.json(
        { ok: false, error: "DB error loading locations", details: locErr },
        { status: 500 }
      );
    }

    const primary = (locations ?? []).find((l) => l.is_primary) ?? (locations?.[0] ?? null);

    const displayName =
      (dealer.name && dealer.name.trim()) ||
      (primary?.label && primary.label.trim()) ||
      "(ohne Name)";

    // Stammdaten-Fallbacks: wenn dealer.* leer ist, nimm primary.*
    const outDealer = {
      ...dealer,
      display_name: displayName,
      email: dealer.email || primary?.email || null,
      phone: dealer.phone || primary?.phone || null,
      website: dealer.website || primary?.website || null,
    };

    return NextResponse.json({
      ok: true,
      dealer: outDealer,
      locations: locations ?? [],
      primary_location: primary,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "unexpected error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}