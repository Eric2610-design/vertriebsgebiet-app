import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/geocode/start
 * Markiert alle Händler ohne Geo für einen neuen Batch und gibt batchId zurück.
 */
export async function POST() {
  const batchId = randomUUID();

  // Alle ohne Geo in den Batch stellen
  const { error } = await supabase
    .from("dealers")
    .update({
      geocode_batch_id: batchId,
      geocode_status: "queued",
      geocode_provider: "nominatim",
      geocoded_at: new Date().toISOString(),
      geocode_error: null,
    })
    .is("lat", null)
    .is("lng", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, batchId });
}
