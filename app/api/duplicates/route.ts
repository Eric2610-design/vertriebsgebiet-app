import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText } from "@/lib/normalize";

type DealerRow = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  buying_group_key?: string | null;
  norm_street: string;
  norm_city: string;
  parent_dealer_id?: string | null;
  branch_label?: string | null;
  lat?: number | null;
  lng?: number | null;
  geocode_status?: string | null;
};

function normStreetSoft(raw: string | null) {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/\bstraße\b/gi, "strasse")
    .replace(/\bstr\.?\b/gi, "strasse")
    .replace(/\s+/g, " ")
    .trim();
  return normText(s);
}

function addressKey(d: DealerRow) {
  const zip = (d.zip ?? "").trim();
  const street = normStreetSoft(d.street);
  return `${street}|${zip}|${d.norm_city}`;
}

function baseName(name: string) {
  const s = name
    .replace(/^\s*\d+\s*-\s*/g, "")
    .replace(/\s+inh\.?\s+[^,]+/gi, "")
    .replace(/\s+inhaber\s+[^,]+/gi, "")
    .trim();
  return normText(s);
}

function nameKey(name: string) {
  const s = String(name ?? "")
    .toLowerCase()
    .replace(/&/g, " und ")
    .replace(
      /\b(gmbh\s*&\s*co\.?\s*kg|gmbh\s*&\s*co|gmbh|mbh|ug\s*\(haftungsbeschr\.?\)|ug|ag|kg|ohg|gbr|e\.?\s*k\.?|ek|kgaa|sarl|s\.?r\.?l\.?|srl|ltd\.?|inc\.?|bv|nv)\b/gi,
      " "
    )
    .replace(/\b(inh\.?|inhaber|filiale|store|shop|center|zentrum|zweiradcenter|zweirad\s*zentrum)\b/gi, " ")
    .replace(/[^a-z0-9äöüß\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normText(s);
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class DSU {
  parent: number[];
  rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = Array.from({ length: n }, () => 0);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
    else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
  }
}

export async function GET() {
  const supabase = supabaseService();

  // Explicit "do not merge" pairs (suppresses suggestions)
  const ignoreSet = new Set<string>();
  try {
    const { data: ignores } = await supabase
      .from("dealer_duplicate_ignores")
      .select("dealer_id_a,dealer_id_b")
      .limit(50000);
    for (const r of ignores ?? []) {
      if (!r.dealer_id_a || !r.dealer_id_b) continue;
      ignoreSet.add(`${r.dealer_id_a}|${r.dealer_id_b}`);
    }
  } catch {
    // table might not exist yet; ignore silently
  }

  const isIgnored = (a: string, b: string) => {
    const aa = String(a);
    const bb = String(b);
    if (!aa || !bb) return false;
    if (aa === bb) return false;
    const k = aa < bb ? `${aa}|${bb}` : `${bb}|${aa}`;
    return ignoreSet.has(k);
  };

  const { data: dealers, error } = await supabase
    .from("dealers")
    .select(
      "id,name,street,zip,city,country,buying_group_key,norm_street,norm_city,parent_dealer_id,branch_label,lat,lng,geocode_status"
    )
    .order("name", { ascending: true })
    .limit(10000);
  if (error) return bad(error.message, 500);

  const { data: dm, error: dmErr } = await supabase
    .from("dealer_manufacturers")
    .select("dealer_id,manufacturer_key")
    .limit(50000);
  if (dmErr) return bad(dmErr.message, 500);
  const manByDealer = new Map<string, string[]>();
  for (const r of dm ?? []) {
    const arr = manByDealer.get(r.dealer_id) ?? [];
    arr.push(r.manufacturer_key);
    manByDealer.set(r.dealer_id, arr);
  }

  const invCount = new Map<string, number>();
  const ordCount = new Map<string, number>();

  const { data: inv, error: invErr } = await supabase.from("flyer_invoice_lines").select("dealer_id").limit(100000);
  if (!invErr) {
    for (const r of inv ?? []) {
      if (!r.dealer_id) continue;
      invCount.set(r.dealer_id, (invCount.get(r.dealer_id) ?? 0) + 1);
    }
  }

  const { data: ord, error: ordErr } = await supabase.from("flyer_order_lines").select("dealer_id").limit(100000);
  if (!ordErr) {
    for (const r of ord ?? []) {
      if (!r.dealer_id) continue;
      ordCount.set(r.dealer_id, (ordCount.get(r.dealer_id) ?? 0) + 1);
    }
  }

  const rows = (dealers ?? []) as unknown as DealerRow[];

  const enrich = (arr: DealerRow[]) =>
    arr.map((d) => ({
      ...d,
      manufacturer_keys: manByDealer.get(d.id) ?? [],
      invoice_lines: invCount.get(d.id) ?? 0,
      order_lines: ordCount.get(d.id) ?? 0,
    }));

  const suggestMaster = (arr: any[]) => {
    const sorted = [...arr].sort((a, b) => {
      const aa = (a.order_lines ?? 0) * 100000 + (a.invoice_lines ?? 0);
      const bb = (b.order_lines ?? 0) * 100000 + (b.invoice_lines ?? 0);
      if (bb !== aa) return bb - aa;
      if ((b.manufacturer_keys?.length ?? 0) !== (a.manufacturer_keys?.length ?? 0))
        return (b.manufacturer_keys?.length ?? 0) - (a.manufacturer_keys?.length ?? 0);
      return String(a.name).localeCompare(String(b.name));
    });
    return { sorted, masterId: sorted[0]?.id };
  };

  // 1) Address duplicates (safe merges)
  const byAddr = new Map<string, DealerRow[]>();
  for (const d of rows) {
    const k = addressKey(d);
    if (!k || k.startsWith("|")) continue;
    const arr = byAddr.get(k) ?? [];
    arr.push(d);
    byAddr.set(k, arr);
  }

  const address_duplicates = Array.from(byAddr.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([k, arr]) => {
      const enriched = enrich(arr);
      const { sorted, masterId } = suggestMaster(enriched);

      const ignored_with_master = (sorted ?? [])
        .filter((d: any) => d?.id && d.id !== masterId && isIgnored(masterId, d.id))
        .map((d: any) => d.id);
      const filtered = (sorted ?? []).filter((d: any) => d?.id === masterId || !isIgnored(masterId, d.id));
      if (filtered.length < 2) return null;

      return {
        key: k,
        address: `${arr[0].street ?? ""}, ${arr[0].zip ?? ""} ${arr[0].city ?? ""}`.trim(),
        dealers: filtered,
        suggested_master_id: masterId,
        ignored_with_master,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.dealers.length - a.dealers.length);

  // 2) Branch suggestions (NOT merges)
  const byBase = new Map<string, DealerRow[]>();
  for (const d of rows) {
    const bn = baseName(d.name);
    if (!bn) continue;
    const arr = byBase.get(bn) ?? [];
    arr.push(d);
    byBase.set(bn, arr);
  }

  const branch_suggestions = Array.from(byBase.entries())
    .map(([bn, arr]) => {
      const uniqAddr = new Map<string, DealerRow[]>();
      for (const d of arr) {
        const ak = addressKey(d);
        const aarr = uniqAddr.get(ak) ?? [];
        aarr.push(d);
        uniqAddr.set(ak, aarr);
      }
      if (uniqAddr.size <= 1) return null;
      const enriched = enrich(arr);
      const { sorted, masterId } = suggestMaster(enriched);
      return { base_name: bn, dealers: sorted, suggested_parent_id: masterId };
    })
    .filter(Boolean)
    .slice(0, 200);

  // 3) Name duplicates (manual review / force merge)
  const nameMap = new Map<string, DealerRow[]>();
  for (const d of rows) {
    const nk = nameKey(d.name ?? "");
    if (!nk) continue;
    const arr = nameMap.get(nk) ?? [];
    arr.push(d);
    nameMap.set(nk, arr);
  }

  const name_duplicates = Array.from(nameMap.entries())
    .filter(([, arr]) => arr.length >= 2)
    .map(([nk, arr]) => {
      const enriched = enrich(arr);
      const { sorted, masterId } = suggestMaster(enriched);
      const ignored_with_master = (sorted ?? [])
        .filter((d: any) => d?.id && d.id !== masterId && isIgnored(masterId, d.id))
        .map((d: any) => d.id);
      const filtered = (sorted ?? []).filter((d: any) => d?.id === masterId || !isIgnored(masterId, d.id));
      if (filtered.length < 2) return null;
      return { base_name: nk, dealers: filtered, suggested_master_id: masterId, ignored_with_master };
    })
    .filter(Boolean)
    .slice(0, 500);

  // 4) PLZ clusters (show ALL dealers; helpful for forcing merges)
  const byZip = new Map<string, DealerRow[]>();
  for (const d of rows) {
    const z = String(d.zip ?? "").trim();
    if (!z) continue;
    const arr = byZip.get(z) ?? [];
    arr.push(d);
    byZip.set(z, arr);
  }

  const zip_clusters = Array.from(byZip.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([zip, arr]) => {
      const enriched = enrich(arr);
      const { sorted, masterId } = suggestMaster(enriched);
      const ignored_with_master = (sorted ?? [])
        .filter((d: any) => d?.id && d.id !== masterId && isIgnored(masterId, d.id))
        .map((d: any) => d.id);
      const filtered = (sorted ?? []).filter((d: any) => d?.id === masterId || !isIgnored(masterId, d.id));
      if (filtered.length < 2) return null;
      const cities = Array.from(new Set(arr.map((d) => (d.city ?? "").trim()).filter(Boolean))).slice(0, 3);
      return {
        zip,
        city_hint: cities.join(" / "),
        dealers: filtered,
        suggested_master_id: masterId,
        ignored_with_master,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.dealers.length - a.dealers.length)
    .slice(0, 800);

  // 5) Geo duplicates (very close coordinates)
  const GEO_MAX_METERS = 120; // conservative; user can still force merge
  const geoByZip = new Map<string, DealerRow[]>();
  for (const d of rows) {
    const z = String(d.zip ?? "").trim();
    if (!z) continue;
    if (d.geocode_status !== "ok") continue;
    if (typeof d.lat !== "number" || typeof d.lng !== "number") continue;
    const arr = geoByZip.get(z) ?? [];
    arr.push(d);
    geoByZip.set(z, arr);
  }

  const geo_duplicates: any[] = [];
  for (const [zip, arr] of geoByZip.entries()) {
    if (arr.length < 2) continue;
    // DSU clustering by distance
    const dsu = new DSU(arr.length);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        const dist = haversineMeters(a.lat as number, a.lng as number, b.lat as number, b.lng as number);
        if (dist <= GEO_MAX_METERS) dsu.union(i, j);
      }
    }
    const clusters = new Map<number, number[]>();
    for (let i = 0; i < arr.length; i++) {
      const r = dsu.find(i);
      const list = clusters.get(r) ?? [];
      list.push(i);
      clusters.set(r, list);
    }

    for (const idxs of clusters.values()) {
      if (idxs.length < 2) continue;
      const clusterDealers = idxs.map((i) => arr[i]);

      // require at least 2 with the same normalized name OR identical address key
      const nkCounts = new Map<string, number>();
      const akCounts = new Map<string, number>();
      for (const d of clusterDealers) {
        const nk = nameKey(d.name ?? "");
        const ak = addressKey(d);
        nkCounts.set(nk, (nkCounts.get(nk) ?? 0) + 1);
        akCounts.set(ak, (akCounts.get(ak) ?? 0) + 1);
      }
      const maxNk = Math.max(...Array.from(nkCounts.values()));
      const maxAk = Math.max(...Array.from(akCounts.values()));
      if (Math.max(maxNk, maxAk) < 2) continue;

      let minDist = Infinity;
      for (let i = 0; i < clusterDealers.length; i++) {
        for (let j = i + 1; j < clusterDealers.length; j++) {
          const a = clusterDealers[i];
          const b = clusterDealers[j];
          const dist = haversineMeters(a.lat as number, a.lng as number, b.lat as number, b.lng as number);
          if (dist < minDist) minDist = dist;
        }
      }

      const enriched = enrich(clusterDealers);
      const { sorted, masterId } = suggestMaster(enriched);
      const ignored_with_master = (sorted ?? [])
        .filter((d: any) => d?.id && d.id !== masterId && isIgnored(masterId, d.id))
        .map((d: any) => d.id);
      const filtered = (sorted ?? []).filter((d: any) => d?.id === masterId || !isIgnored(masterId, d.id));
      if (filtered.length < 2) continue;
      geo_duplicates.push({
        key: `${zip}|${Math.round(minDist)}|${filtered.map((d: any) => d.id).join(",")}`.slice(0, 220),
        zip,
        min_distance_m: Math.round(minDist),
        dealers: filtered,
        suggested_master_id: masterId,
        ignored_with_master,
      });
    }
  }
  geo_duplicates.sort((a, b) => (a.min_distance_m ?? 999999) - (b.min_distance_m ?? 999999));

  return ok({ address_duplicates, branch_suggestions, name_duplicates, zip_clusters, geo_duplicates });
}
