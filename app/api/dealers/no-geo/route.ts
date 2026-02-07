import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText } from "@/lib/normalize";
import { requireAdmin } from "@/app/api/_admin";

function extractHouseNumber(street: string | null) {
  const m = String(street ?? "").match(/\b(\d+)\s*([a-z])?\b/i);
  if (!m) return null;
  return (m[1] + (m[2] ? m[2].toLowerCase() : "")).trim();
}

function normStreetSoft(raw: string | null) {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/\bstraße\b/gi, "strasse")
    .replace(/\bstr\.?\b/gi, "strasse")
    .replace(/\s+/g, " ")
    .trim();
  return normText(s);
}

function jaccard(a: string, b: string) {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

function scoreCandidate(t: any, c: any) {
  const tn = normText(String(t?.name ?? ""));
  const cn = normText(String(c?.name ?? ""));
  const nameScore = jaccard(tn, cn);

  const tz = String(t?.zip ?? "").trim();
  const cz = String(c?.zip ?? "").trim();
  const zipBonus = tz && cz && tz === cz ? 0.25 : 0;

  const tc = normText(String(t?.city ?? "").trim());
  const cc = normText(String(c?.city ?? "").trim());
  const cityBonus = tc && cc && tc === cc ? 0.1 : 0;

  const th = extractHouseNumber(t?.street ?? null);
  const ch = extractHouseNumber(c?.street ?? null);
  let streetPenalty = 0;
  if (th && ch && th !== ch) streetPenalty = 0.25;

  const ts = normStreetSoft(t?.street ?? null);
  const cs = normStreetSoft(c?.street ?? null);
  const streetBonus = ts && cs && (ts === cs || ts.includes(cs) || cs.includes(ts)) ? 0.1 : 0;

  const score = nameScore + zipBonus + cityBonus + streetBonus - streetPenalty;
  return { score, nameScore };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const ret: R[] = [];
  const queue = items.slice();
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length) {
      const it = queue.shift()!;
      // eslint-disable-next-line no-await-in-loop
      ret.push(await fn(it));
    }
  });
  await Promise.all(workers);
  return ret;
}

export async function GET(req: Request) {
  await requireAdmin();
  const supabase = supabaseService();
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  const q = (url.searchParams.get("q") ?? "").trim();
  const onlyMatch = (url.searchParams.get("only_match") ?? "0") === "1";
  const sort = (url.searchParams.get("sort") ?? "zip").trim(); // zip | buying_group

  // If only_match=1, we build a filtered list of dealers without geo
  // that have at least one "usable" suggestion (score >= 0.15) in the same country_iso.
  if (onlyMatch) {
    const scanLimit = Math.min(Math.max(parseInt(url.searchParams.get("scan") ?? "1500", 10) || 1500, 200), 5000);

    let base = supabase
      .from("dealers")
      .select(
        "id,name,street,zip,city,country,country_iso,lat,lng,merged_into,status,parent_dealer_id,branch_label,buying_group_key,dealer_manufacturers(manufacturer_key)"
      )
      .or("lat.is.null,lng.is.null")
      .is("merged_into", null)
      .neq("status", "excluded")
      .neq("status", "merged")
      .order(sort === "buying_group" ? "buying_group_key" : "zip", { ascending: true, nullsFirst: false })
      .order("zip", { ascending: true, nullsFirst: false })
      .order("city", { ascending: true })
      .order("name", { ascending: true })
      .range(0, scanLimit - 1);

    if (q.length >= 2) base = base.ilike("name", `%${q}%`);

    const { data: raw, error: rawErr } = await base;
    if (rawErr) return bad(rawErr.message, 500);

    const rows = (raw ?? [])
      .filter((r) => (r?.country_iso ? true : false))
      .map((d: any) => {
        const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
        const { dealer_manufacturers, ...rest } = d;
        return { ...rest, manufacturer_keys };
      });

    async function hasUsableMatch(t: any): Promise<boolean> {
      const countryIso = String(t?.country_iso ?? "").trim();
      if (!countryIso) return false;

      // IMPORTANT: user requirement
      // "usable" match for geo-merge exists ONLY if ZIP matches exactly.
      const zip = String(t?.zip ?? "").trim().replace(/\s+/g, "");
      if (!zip) return false;

      const { data: cand, error: cErr } = await supabase
        .from("dealers")
        .select("id,name,street,zip,city,country,country_iso,lat,lng")
        .eq("country_iso", countryIso)
        .not("lat", "is", null)
        .not("lng", "is", null)
        .eq("zip", zip)
        .limit(400);

      if (cErr) return false;
      const candidates = cand ?? [];
      for (const c of candidates) {
        if (String(c?.zip ?? "").trim().replace(/\s+/g, "") !== zip) continue;
        const { score } = scoreCandidate(t, c);
        if (score >= 0.15) return true;
      }
      return false;
    }

    // Concurrency-limited filtering to avoid hammering Supabase
    const flags = await mapLimit(rows, 10, async (r) => ({ id: r.id, ok: await hasUsableMatch(r) }));
    const okSet = new Set(flags.filter((f) => f.ok).map((f) => f.id));
    const filtered = rows.filter((r) => okSet.has(r.id));

    const page = filtered.slice(offset, offset + limit);
    return ok({ items: page, limit, offset, total_scanned: rows.length, total_matches: filtered.length });
  }

  let query = supabase
    .from("dealers")
    .select(
      "id,name,street,zip,city,country,country_iso,lat,lng,merged_into,status,parent_dealer_id,branch_label,buying_group_key,dealer_manufacturers(manufacturer_key)"
    )
    .or("lat.is.null,lng.is.null")
    .is("merged_into", null)
    .neq("status", "excluded")
    .neq("status", "merged")
    .order(sort === "buying_group" ? "buying_group_key" : "zip", { ascending: true, nullsFirst: false })
    .order("zip", { ascending: true, nullsFirst: false })
    .order("city", { ascending: true })
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (q.length >= 2) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) return bad(error.message, 500);

  const items = (data ?? []).map((d: any) => {
    const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
    const { dealer_manufacturers, ...rest } = d;
    return { ...rest, manufacturer_keys };
  });

  return ok({ items, limit, offset });
}
