export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createSupabaseServer } from "../../lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function AppPage() {
  const supabase = createSupabaseServer();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/login?next=/app");

  let meta: any = null;

  try {
    // Build absolute URL (robust on Vercel) + forward cookies
    const h = headers();
    const proto = h.get("x-forwarded-proto") ?? "https";
    const host = h.get("x-forwarded-host") ?? h.get("host");

    const url = host ? `${proto}://${host}/api/meta` : "/api/meta";

    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        // Wichtig: Session-Cookies mitgeben, sonst sieht /api/meta keinen Login
        cookie: cookies().toString(),
      },
    });

    if (res.ok) meta = await res.json();
    else meta = { ok: false, status: res.status, error: await res.text() };
  } catch (e: any) {
    meta = { ok: false, error: e?.message ?? "fetch failed" };
  }

  return <DashboardClient meta={meta} />;
}
