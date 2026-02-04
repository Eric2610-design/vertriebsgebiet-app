import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST() {
  // 1) neue Batch-ID
  const batchId = randomUUID();

  // 2) alle Händler ohne Geo markieren
  const { error } = await supabase
    .from("dealers")
    .update({
      geocode_batch_id: batchId,
      geocode_status: "queued",
    })
    .is("lat", null)
    .is("lng", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    batchId,
  });
}
