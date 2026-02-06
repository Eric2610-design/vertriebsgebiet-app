import { NextResponse } from "next/server";
import { getUserClientFromCookies, getRoleForUser, readAuthCookies } from "@/app/api/_auth";

export async function GET() {
  const { supabase, user } = await getUserClientFromCookies();
  if (!user) return NextResponse.json({ user: null, role: null }, { status: 200 });

  let role = (await getRoleForUser(user.id)) || null;
  const c = await readAuthCookies();
  // fall back to cookie role if table read fails
  role = role || (c.role as any) || null;

  return NextResponse.json({ user: { id: user.id, email: user.email }, role }, { status: 200 });
}
