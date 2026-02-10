import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";
import { supabaseService } from "@/lib/supabase";

function normMarket(value: string | null) {
  return value === "CH" ? "CH" : "DE_AT";
}

function sortStrings(values: Set<string>) {
  return Array.from(values)
    .map((v) => String(v ?? "").trim())
    .filter((v) => v)
    .sort((a, b) => a.localeCompare(b, "de"));
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return bad("admin_only", 403);
  }

  const url = new URL(req.url);
  const mode = String(url.searchParams.get("mode") ?? "").trim();
  const header = String(url.searchParams.get("header") ?? "").trim();
  const market = normMarket(url.searchParams.get("market"));

  const supabase = supabaseService();
  const runRes = await supabase
    .from("stock_runs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const runId = runRes.data?.id ?? null;
  if (!runId) {
    return ok({ headers: [], values: [] });
  }

  if (mode === "headers") {
    // Union keys from a small sample to avoid missing headers.
    const sampleRes = await supabase
      .from("stock_items")
      .select("raw")
      .eq("run_id", runId)
      .not("raw", "is", null)
      .limit(50);

    if (sampleRes.error) return bad(sampleRes.error.message, 500);

    const keys = new Set<string>();
    for (const row of sampleRes.data ?? []) {
      const raw = (row as any)?.raw;
      if (raw && typeof raw === "object") {
        for (const k of Object.keys(raw)) keys.add(String(k));
      }
    }

    return ok({ headers: sortStrings(keys) });
  }

  if (mode === "values") {
    if (!header) return bad("missing_header", 400);

    let q = supabase
      .from("stock_items")
      .select("raw,price_eur,price_chf")
      .eq("run_id", runId)
      .not("raw", "is", null)
      .limit(5000);

    // Match /api/stock/latest filtering: market decides which price column must be > 0.
    if (market === "CH") q = q.gt("price_chf", 0);
    else q = q.gt("price_eur", 0);

    const res = await q;
    if (res.error) return bad(res.error.message, 500);

    const values = new Set<string>();
    for (const row of res.data ?? []) {
      const raw = (row as any)?.raw;
      if (!raw || typeof raw !== "object") continue;

      const v = (raw as any)[header];
      if (v === undefined || v === null) continue;
      const s = String(v).trim();
      if (!s) continue;
      values.add(s);
      if (values.size >= 500) break;
    }

    return ok({ values: sortStrings(values) });
  }

  return bad("invalid_mode", 400);
}
