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
  // country is optional: treat missing as wildcard by ignoring it in the key
  const street = normStreetSoft(d.street);
  return `${street}|${zip}|${d.norm_city}`;
}

function baseName(name: string) {
  // normalize name for branch suggestions (no auto merge)
  const s = name
    .replace(/^\s*\d+\s*-\s*/g, "")
    .replace(/\s+inh\.?\s+[^,]+/gi, "")
    .replace(/\s+inhaber\s+[^,]+/gi, "")
    .trim();
  return normText(s);
}

function nameKey(name: string) {
  // stronger normalization for manual merge candidates
  const s = String(name ?? "")
    .toLowerCase()
    .replace(/&/g, " und ")
    // strip legal forms
    .replace(/\b(gmbh\s*&\s*co\.?\s*kg|gmbh\s*&\s*co|gmbh|mbh|ug\s*\(haftungsbeschr\.?\)|ug|ag|kg|ohg|gbr|e\.?\s*k\.?|ek|kgaa|sarl|s\.r\.l\.|srl|ltd\.?|inc\.?|bv|nv)\b/gi, " ")
    // common noise words
    .replace(/\b(inh\.?|inhaber|filiale|store|shop|center|zentrum|zweiradcenter|zweirad\s*zentrum)\b/gi, " ")
    .replace(/[^a-z0-9äöüß\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normText(s);
}

export async function GET() {
  const supabase = supabaseService();

  // Pull dealers with normalized address columns (up to 10k)
  const { data: dealers, error } = await supabase
    .from("dealers")
    .select(
      "id,name,street,zip,city,country,buying_group_key,norm_street,norm_city,parent_dealer_id,branch_label"
    )
    .order("name", { ascending: true })
    .limit(10000);
  if (error) return bad(error.message, 500);

  // Manufacturer keys
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

  // Activity (orders / invoices) – lightweight counts
  const invCount = new Map<string, number>();
  const ordCount = new Map<string, number>();

  const { data: inv, error: invErr } = await supabase
    .from("flyer_invoice_lines")
    .select("dealer_id")
    .limit(100000);
  if (!invErr) {
    for (const r of inv ?? []) {
      if (!r.dealer_id) continue;
      invCount.set(r.dealer_id, (invCount.get(r.dealer_id) ?? 0) + 1);
    }
  }

  const { data: ord, error: ordErr } = await supabase
    .from("flyer_order_lines")
    .select("dealer_id")
    .limit(100000);
  if (!ordErr) {
    for (const r of ord ?? []) {
      if (!r.dealer_id) continue;
      ordCount.set(r.dealer_id, (ordCount.get(r.dealer_id) ?? 0) + 1);
    }
  }

  const rows = (dealers ?? []) as unknown as DealerRow[];

  // 1) Address duplicates: exact address key matches (safe to merge)
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
      const enriched = arr.map((d) => ({
        ...d,
        manufacturer_keys: manByDealer.get(d.id) ?? [],
        invoice_lines: invCount.get(d.id) ?? 0,
        order_lines: ordCount.get(d.id) ?? 0,
      }));
      // Suggest master: most activity, then most manufacturers, then earliest by name
      const sorted = [...enriched].sort((a, b) => {
        const aa = (a.order_lines ?? 0) * 100000 + (a.invoice_lines ?? 0);
        const bb = (b.order_lines ?? 0) * 100000 + (b.invoice_lines ?? 0);
        if (bb !== aa) return bb - aa;
        if (b.manufacturer_keys.length !== a.manufacturer_keys.length) return b.manufacturer_keys.length - a.manufacturer_keys.length;
        return String(a.name).localeCompare(String(b.name));
      });
      return {
        key: k,
        address: `${arr[0].street ?? ""}, ${arr[0].zip ?? ""} ${arr[0].city ?? ""}`.trim(),
        dealers: sorted,
        suggested_master_id: sorted[0]?.id,
      };
    })
    .sort((a, b) => b.dealers.length - a.dealers.length);

  // 2) Branch suggestions (NOT merges): same base name, different addresses
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
      const enriched = arr.map((d) => ({
        ...d,
        manufacturer_keys: manByDealer.get(d.id) ?? [],
        invoice_lines: invCount.get(d.id) ?? 0,
        order_lines: ordCount.get(d.id) ?? 0,
      }));
      const sorted = [...enriched].sort((a, b) => {
        const aa = (a.order_lines ?? 0) * 100000 + (a.invoice_lines ?? 0);
        const bb = (b.order_lines ?? 0) * 100000 + (b.invoice_lines ?? 0);
        if (bb !== aa) return bb - aa;
        if (b.manufacturer_keys.length !== a.manufacturer_keys.length) return b.manufacturer_keys.length - a.manufacturer_keys.length;
        return String(a.name).localeCompare(String(b.name));
      });
      return {
        base_name: bn,
        dealers: sorted,
        suggested_parent_id: sorted[0]?.id,
      };
    })
    .filter(Boolean)
    .slice(0, 200);

  
  // Name duplicates (manual review): strong grouping by normalized name key.
  // This intentionally ignores street/city/country differences so the user can decide.
  const nameMap = new Map<string, DealerRow[]>();
  for (const d of rows) {
    const nk = nameKey(d.name ?? "");
    if (!nk) continue;
    const arr = nameMap.get(nk) ?? [];
    arr.push(d);
    nameMap.set(nk, arr);
  }

  const name_duplicates = Array.from(nameMap.entries())
    .filter(([_, arr]) => arr.length >= 2)
    .map(([nk, arr]) => {
      const enriched = arr.map((d) => ({
        ...d,
        manufacturer_keys: manByDealer.get(d.id) ?? [],
        invoice_lines: invCount.get(d.id) ?? 0,
        order_lines: ordCount.get(d.id) ?? 0,
      }));
      // Suggest master: most activity, then most manufacturers, then name
      const sorted = [...enriched].sort((a, b) => {
        const aa = (a.order_lines ?? 0) * 100000 + (a.invoice_lines ?? 0);
        const bb = (b.order_lines ?? 0) * 100000 + (b.invoice_lines ?? 0);
        if (bb !== aa) return bb - aa;
        if (b.manufacturer_keys.length !== a.manufacturer_keys.length) return b.manufacturer_keys.length - a.manufacturer_keys.length;
        return String(a.name).localeCompare(String(b.name));
      });
      return { base_name: nk, dealers: sorted, suggested_master_id: sorted[0]?.id };
    })
    .slice(0, 500);

  return ok({ address_duplicates, branch_suggestions, name_duplicates });
}