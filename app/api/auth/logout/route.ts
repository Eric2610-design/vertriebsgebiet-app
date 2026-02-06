import { NextResponse } from "next/server";
import { clearAuthCookies, getUserClientFromCookies } from "@/app/api/_auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  try {
    const { supabase } = await getUserClientFromCookies();
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
  clearAuthCookies(res);
  return res;
}
