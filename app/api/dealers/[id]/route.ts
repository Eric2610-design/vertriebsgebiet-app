// app/api/dealers/[id]/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_SCHEMA = process.env.NEXT_PUBLIC_DB_SCHEMA || "app";

function adminClient() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function loadFromSchema(schema: string, dealerId: string) {
  const sb = adminClient().schema(schema);

  const { data: dealer, error: dealerErr } = await sb
    .from("dealers")
    .select("*")
    .eq("id", dealerId)
    .maybeSingle();

  if (dealerErr) return { ok: false as const, error: dealerErr };
  if (!dealer) return { ok: false as const, error: { message: "dealer not found" } };

  const { data: locations, error: locErr } = await sb
    .from("dealer_locations")
    .select("*")
    .eq("dealer_id", dealerId);

  const { data: links, error: linkErr } = await sb
    .from("source_links")
    .select("*")
    .eq("dealer_id", dealerId);

  return {
    ok: true as const,
    dealer,
    // Damit dein Frontend weiterhin "locations" / "links" erwartet:
    locations: locErr ? [] : (locations || []),
    links: linkErr ? [] : (links || []),
  };
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx?.params?.id;

    if (!id || !isUuid(id)) {
      return NextResponse.json(
        { ok: false, error: "invalid dealer id" },
        { status: 400 }
      );
    }

    const schemas = Array.from(new Set([DEFAULT_SCHEMA, "public"]));
    let lastErr: any = null;

    for (const schema of schemas) {
      const res = await loadFromSchema(schema, id);
      if (res.ok) {
        return NextResponse.json({ ok: true, schema, ...res });
      }
      lastErr = res.error;
    }

    return NextResponse.json(
      { ok: false, error: "DB error loading dealer", details: lastErr },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
