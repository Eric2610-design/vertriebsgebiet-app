import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";

type MergeRow = {
  master_id: string;
  merged_id: string;
  reason: string | null;
  merged_at: string;
};

type DealerMini = {
  id: string;
  name: string;
  zip: string | null;
  city: string | null;
  country_iso: string | null;
};

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const supabase = supabaseService();
    const url = new URL(req.url);
    const limit = Math.min(5000, Math.max(50, Number(url.searchParams.get("limit") ?? "1000") || 1000));

    // We track force vs normal merges via reason:
    // - geo-merge
    // - geo-merge-force
    const { data: rows, error } = await supabase
      .from("merge_log")
      .select("master_id,merged_id,reason,merged_at")
      .in("reason", ["geo-merge", "geo-merge-force"])
      .order("merged_at", { ascending: false })
      .limit(limit);

    if (error) return bad(error.message, 500);

    const items = (rows ?? []) as unknown as MergeRow[];
    const ids = Array.from(
      new Set(items.flatMap((r) => [r.master_id, r.merged_id]).filter(Boolean))
    );

    let dealersById: Record<string, DealerMini> = {};
    if (ids.length) {
      const { data: ds, error: derr } = await supabase
        .from("dealers")
        .select("id,name,zip,city,country_iso")
        .in("id", ids)
        .limit(50000);
      if (!derr) {
        for (const d of (ds ?? []) as any[]) dealersById[String(d.id)] = d as DealerMini;
      }
    }

    const normal = items.filter((r) => (r.reason ?? "") === "geo-merge");
    const forced = items.filter((r) => (r.reason ?? "") === "geo-merge-force");

    return ok({
      total: items.length,
      normal: {
        count: normal.length,
        items: normal,
      },
      force: {
        count: forced.length,
        items: forced,
      },
      dealersById,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return bad(e?.message ?? "Failed", status);
  }
}
