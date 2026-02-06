import { NextResponse } from "next/server";
import { requireRole } from "@/app/api/_auth";
import { supabaseService } from "@/lib/supabase";

export async function GET() {
  await requireRole(["superadmin"]);
  const supabase = supabaseService();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,display_name")
    .order("display_name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
