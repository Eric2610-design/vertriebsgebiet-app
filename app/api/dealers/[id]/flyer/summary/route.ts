import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = supabaseService();

  // If tables don't exist yet (before migration), fail soft and return 0 counts.
  async function safeCount(table: string, col: string, value: string) {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(col, value);
    if (error) return 0;
    return count ?? 0;
  }

  const [invoiceCount, orderCount] = await Promise.all([
    safeCount("flyer_invoice_lines", "dealer_id", id),
    safeCount("flyer_order_lines", "dealer_id", id),
  ]);

  return NextResponse.json({
    dealer_id: id,
    invoice_count: invoiceCount,
    order_count: orderCount,
    has_any: invoiceCount > 0 || orderCount > 0,
  });
}
