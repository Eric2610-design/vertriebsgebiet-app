import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";

export async function POST() {
  const supabase = createSupabaseServer();
  await supabase.auth.signOut();
  const url = new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
  return NextResponse.redirect(url);
}
