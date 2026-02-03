import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = supaAdmin();
  const dealerId = params.id;

  // Dealer
  const { data: dealer, error: e1 } = await supabase
    .from("dealers")
    .select("id, canonical_name, created_at")
    .eq("id", dealerId)
    .single();

  if (e1) return NextResponse.json({ error: e1.message }, { status: 404 });

  // Locations
  const { data: locations, error: e2 } = await supabase
    .from("dealer_locations")
    .select(
      "id, dealer_id, name, street, zipcode, city, country, phone, email, website, opening_hours, lat, lng, source_type_code"
    )
    .eq("dealer_id", dealerId)
    .order("created_at", { ascending: true });

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ dealer, locations: locations ?? [] });
}
