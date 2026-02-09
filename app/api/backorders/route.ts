export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { getVtRole } from "@/app/api/_admin";

type Row = {
  id: string;
  article_no: string;
  order_date: string | null;
  col_a: string | null;
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
};

function isCH(country: string | null) {
  return String(country ?? "").toUpperCase() === "CH";
}

export async function GET() {
  const role = await getVtRole();
  if (!role) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  if (!["aussendienst", "admin", "superadmin"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = supabaseService();

  const { data: run, error: runErr } = await supabase
    .from("backorder_runs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });
  if (!run) return NextResponse.json({ ok: true, run: null, rows: [] });

  let query = supabase
    .from("backorder_items")
    .select(
      "id, article_no, order_date, col_a, col_m, col_v, col_z, col_aa, col_ah, col_ak, col_ap, col_ar, col_as, customer_no, dealer_name, dealer_country"
    )
    .eq("run_id", run.id)
    .limit(5000);

  const { data: rows, error: rowsErr } = await query;

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const safeRows = (rows ?? []) as unknown as Row[];

  // global sequence per article_no (oldest first)
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

  // frame_size from latest stock snapshot (optional)
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
          .select("article_no, frame_size")
          .eq("run_id", stockRun.id)
          .in("article_no", chunk);

        if (stockErr) throw stockErr;

        for (const si of stockItems ?? []) {
          const a = String((si as any).article_no ?? "");
          const fs = String((si as any).frame_size ?? "");
          if (a && fs) out[a] = fs;
        }
      }

      frameByArticle = out;
    }
  } catch {
    frameByArticle = {};
  }

  const result = safeRows.map((r) => {
    const country = r.dealer_country;
    return {
      ...r,
      order_seq: seqMap.get(r.id) ?? null,
      frame_size: frameByArticle[String(r.article_no)] ?? null,
      price_col: isCH(country) ? (r.col_as ?? null) : (r.col_ar ?? null),
    };
  });

  return NextResponse.json({ ok: true, run, rows: result });
}
