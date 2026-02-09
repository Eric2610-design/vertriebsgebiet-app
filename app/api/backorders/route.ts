export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { getVtRole } from "@/app/api/_admin";

type Row = {
  id: string;
  order_no: string | null;
  pos_no: string | null;
  article_no: string;
  order_date: string | null;
  col_m: string | null;
  col_v: string | null;
  col_z: string | null;
  col_aa: string | null;
  col_ah: string | null;
  col_ak: string | null;
  col_ap: string | null;
  col_ar: string | null;
  col_as: string | null;
  customer_no: string | null;
  dealer_name: string | null;
  dealer_country: string | null;
  dealer_id: string | null;
};

function isCH(country: string | null) {
  return String(country ?? "").toUpperCase() === "CH";
}

function safeLike(q: string) {
  return q.replace(/[%_]/g, "\\$&");
}

export async function GET(req: Request) {
  const role = await getVtRole();
  if (!role) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const dealerId = (url.searchParams.get("dealerId") ?? "").trim();
  const limit = Math.min(10000, Math.max(1, Number(url.searchParams.get("limit") ?? "5000")));

  const supabase = supabaseService();

  const { data: run, error: runErr } = await supabase
    .from("backorder_runs")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });
  if (!run) return NextResponse.json({ ok: true, run: null, rows: [] });

  // Always fetch the whole latest snapshot (up to limit) to keep order_seq global.
  let query = supabase
    .from("backorder_items")
    .select(
      "id, order_no, pos_no, article_no, order_date, col_m, col_v, col_z, col_aa, col_ah, col_ak, col_ap, col_ar, col_as, customer_no, dealer_name, dealer_country, dealer_id"
    )
    .eq("run_id", run.id)
    .limit(limit);

  if (q) {
    const s = safeLike(q);
    query = query.or(
      `article_no.ilike.%${s}%,customer_no.ilike.%${s}%,dealer_name.ilike.%${s}%,order_no.ilike.%${s}%`
    );
  }

  const { data: rows, error: rowsErr } = await query;
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const safeRows = (rows ?? []) as unknown as Row[];

  // global sequence per article_no (oldest first) — must not change with dealer filtering.
  const byArticle = new Map<string, Row[]>();
  for (const r of safeRows) {
    const key = String(r.article_no ?? "");
    if (!key) continue;
    const arr = byArticle.get(key) ?? [];
    arr.push(r);
    byArticle.set(key, arr);
  }

  const seqMap = new Map<string, number>();
  for (const arr of byArticle.values()) {
    arr.sort((a, b) => {
      const ad = a.order_date ? Date.parse(a.order_date) : Number.POSITIVE_INFINITY;
      const bd = b.order_date ? Date.parse(b.order_date) : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return String(a.id).localeCompare(String(b.id));
    });
    arr.forEach((r, i) => seqMap.set(r.id, i + 1));
  }

  // frame_size from latest stock snapshot (match by sku == article_no)
  let frameByArticle: Record<string, string> = {};
  try {
    const { data: stockRun } = await supabase
      .from("stock_runs")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stockRun?.id) {
      const uniqueArticles = Array.from(new Set(safeRows.map((r) => String(r.article_no)).filter(Boolean)));
      const chunkSize = 500;
      const out: Record<string, string> = {};

      for (let i = 0; i < uniqueArticles.length; i += chunkSize) {
        const chunk = uniqueArticles.slice(i, i + chunkSize);
        const { data: stockItems, error: stockErr } = await supabase
          .from("stock_items")
          .select("sku, frame_size")
          .eq("run_id", stockRun.id)
          .in("sku", chunk);

        if (stockErr) throw stockErr;

        for (const si of stockItems ?? []) {
          const a = String((si as any).sku ?? "");
          const fs = String((si as any).frame_size ?? "");
          if (a && fs) out[a] = fs;
        }
      }
      frameByArticle = out;
    }
  } catch {
    frameByArticle = {};
  }

  const enriched = safeRows.map((r) => {
    const country = r.dealer_country;
    return {
      ...r,
      order_seq: seqMap.get(r.id) ?? null,
      frame_size: frameByArticle[String(r.article_no)] ?? null,
      price_col: isCH(country) ? (r.col_as ?? null) : (r.col_ar ?? null),
    };
  });

  // Optional dealer filter after global sequencing.
  const filtered = dealerId ? enriched.filter((r: any) => String(r.dealer_id ?? "") === dealerId) : enriched;

  return NextResponse.json({ ok: true, role, run, rows: filtered });
}
