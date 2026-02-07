import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { normText } from "@/lib/normalize";
import { requireAdmin } from "@/app/api/_admin";

function normCountryIso(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s === "de" || s === "deu" || s.includes("deutschland") || s.includes("germany")) return "DE";
  if (s === "at" || s === "aut" || s.includes("österreich") || s.includes("oesterreich") || s.includes("austria")) return "AT";
  if (s === "ch" || s === "che" || s.includes("schweiz") || s.includes("switzerland")) return "CH";
  if (s === "fr" || s === "fra" || s.includes("frankreich") || s.includes("france")) return "FR";
  if (s === "it" || s === "ita" || s.includes("italien") || s.includes("italy")) return "IT";
  return s.toUpperCase();
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

function extractHouseNumber(street: string | null) {
  const m = String(street ?? "").match(/\b(\d+)\s*([a-z])?\b/i);
  if (!m) return null;
  return (m[1] + (m[2] ? m[2].toLowerCase() : "")).trim();
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

  // protect branches with different house numbers (only if both have numbers)
  const th = extractHouseNumber(t?.street ?? null);
  const ch = extractHouseNumber(c?.street ?? null);
  let streetPenalty = 0;
  if (th && ch && th !== ch) streetPenalty = 0.25;

  // soft street similarity bonus
  const ts = normStreetSoft(t?.street ?? null);
  const cs = normStreetSoft(c?.street ?? null);
  const streetBonus = ts && cs && (ts === cs || ts.includes(cs) || cs.includes(ts)) ? 0.1 : 0;

  const score = nameScore + zipBonus + cityBonus + streetBonus - streetPenalty;
  return { score, nameScore };
}

export async function GET(req: Request) {
  await requireAdmin();
  const supabase = supabaseService();
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) return bad("Missing id", 400);

  // Load target (dealer without geo)
  const { data: tRow, error: tErr } = await supabase
    .from("dealers")
    .select("id,name,street,zip,city,country,country_iso,lat,lng")
    .eq("id", id)
    .maybeSingle();

  if (tErr) return bad(tErr.message, 500);
  if (!tRow) return bad("Dealer not found", 404);

  const countryIso = String(tRow?.country_iso ?? "") || normCountryIso(tRow?.country);
  if (!countryIso) return ok({ target: tRow, items: [] });

  const zip = String(tRow?.zip ?? "").trim();
  const city = String(tRow?.city ?? "").trim();
  const zipPrefix2 = zip.length >= 2 ? zip.slice(0, 2) : "";

  // Candidate pool (keep it bounded)
  const seen = new Set<string>();
  const candidates: any[] = [];

  async function addCandidates(q: any) {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      if (!r?.id || seen.has(r.id)) continue;
      seen.add(r.id);
      candidates.push(r);
      if (candidates.length >= 2500) break;
    }
  }

  try {
    // 1) Zip prefix pool (best)
    if (zipPrefix2) {
      await addCandidates(
        supabase
          .from("dealers")
          .select("id,name,street,zip,city,country,country_iso,lat,lng")
          .eq("country_iso", countryIso)
          .not("lat", "is", null)
          .not("lng", "is", null)
          .like("zip", `${zipPrefix2}%`)
          .limit(1500)
      );
    }

    // 2) City pool (fallback)
    if (city) {
      await addCandidates(
        supabase
          .from("dealers")
          .select("id,name,street,zip,city,country,country_iso,lat,lng")
          .eq("country_iso", countryIso)
          .not("lat", "is", null)
          .not("lng", "is", null)
          .ilike("city", city)
          .limit(800)
      );
    }

    // 3) Name prefix pool (very helpful when zip/city is messy)
    const name = String(tRow?.name ?? "").trim();
    const namePrefix = name.length >= 4 ? name.slice(0, 4) : name;
    if (namePrefix.length >= 2) {
      await addCandidates(
        supabase
          .from("dealers")
          .select("id,name,street,zip,city,country,country_iso,lat,lng")
          .eq("country_iso", countryIso)
          .not("lat", "is", null)
          .not("lng", "is", null)
          .ilike("name", `${namePrefix}%`)
          .limit(800)
      );
    }
  } catch (e: any) {
    return bad(e?.message ?? "Error building suggestions", 500);
  }

  // Score & sort
  const scored = candidates
    .filter((c) => c.id !== tRow.id)
    .map((c) => {
      const { score, nameScore } = scoreCandidate(tRow, c);
      return { ...c, score, name_score: nameScore };
    })
    .filter((x) => x.score >= 0.15) // keep UI clean
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 20);

  return ok({ target: tRow, items: scored });
}
