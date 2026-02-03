
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "../../lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function AppPage() {
  const supabase = createSupabaseServer();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/login?next=/app");

  let meta: any = null;
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
    const res = await fetch(`${base}/api/meta`, { cache: "no-store" });
    if (res.ok) meta = await res.json();
  } catch {
    meta = null;
  }

  return <DashboardClient meta={meta} />;
}
