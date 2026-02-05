// -------------------------
// 2) dealer_sources dedupe (schema-robust) + move
//    - funktioniert auch wenn Spalten anders heißen
//    - dedupe unter mergeIds + gegen master
// -------------------------
{
  const pick = (obj: any, keys: string[]) => {
    for (const k of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && String(obj[k]).trim() !== "") {
        return { key: k, val: obj[k] };
      }
    }
    return { key: null as any, val: null as any };
  };

  // Welche Spaltennamen kommen typischerweise vor?
  const SOURCE_KEYS = ["source", "source_key", "source_name", "brand", "provider"];
  const EXT_KEYS = ["source_external_id", "external_id", "externalid", "ext_id", "external_key", "source_id", "external_ref"];

  // Master rows holen
  const { data: masterRows, error: mErr } = await sb
    .from("dealer_sources")
    .select("*")
    .eq("dealer_id", masterId);

  if (mErr) return bad(`dealer_sources master fetch: ${mErr.message}`, 500);

  // Merge rows holen
  const { data: mergeRows0, error: sErr } = await sb
    .from("dealer_sources")
    .select("*")
    .in("dealer_id", mergeIds);

  if (sErr) return bad(`dealer_sources merge fetch: ${sErr.message}`, 500);

  const masterRowsAny = (masterRows ?? []) as any[];
  const mergeRowsAny = (mergeRows0 ?? []) as any[];

  // Key-Builder: findet automatisch source/external Spalte in jeder Row
  const makeKey = (r: any) => {
    const src = pick(r, SOURCE_KEYS).val;
    const ext = pick(r, EXT_KEYS).val;
    if (!src || !ext) return null;
    return `${String(src)}::${String(ext)}`;
  };

  // 2a) Master Keys Set
  const masterSet = new Set<string>();
  for (const r of masterRowsAny) {
    const k = makeKey(r);
    if (k) masterSet.add(k);
  }

  // 2b) Dedupe unter mergeIds (pro key nur 1 behalten)
  const seen = new Set<string>();
  const dupIdsToDelete: string[] = [];

  for (const r of mergeRowsAny) {
    const k = makeKey(r);
    if (!k) continue;

    if (seen.has(k)) {
      if (r.id) dupIdsToDelete.push(String(r.id));
      continue;
    }
    seen.add(k);
  }

  if (dupIdsToDelete.length) {
    const { error: delDupInner } = await sb.from("dealer_sources").delete().in("id", dupIdsToDelete);
    if (delDupInner) return bad(`dealer_sources inner dedupe: ${delDupInner.message}`, 500);
  }

  // 2c) Alles löschen, was der Master schon hat (löschen wieder nur via id)
  const againstMasterIds: string[] = [];
  for (const r of mergeRowsAny) {
    const k = makeKey(r);
    if (!k) continue;
    if (masterSet.has(k) && r.id) againstMasterIds.push(String(r.id));
  }

  if (againstMasterIds.length) {
    const { error: delAgainstMaster } = await sb.from("dealer_sources").delete().in("id", againstMasterIds);
    if (delAgainstMaster) return bad(`dealer_sources master dedupe: ${delAgainstMaster.message}`, 500);
  }

  // 2d) Umhängen (restliche dealer_sources der mergeIds -> master)
  const { error: moveErr } = await sb
    .from("dealer_sources")
    .update({ dealer_id: masterId })
    .in("dealer_id", mergeIds);

  if (moveErr) return bad(`dealer_sources move: ${moveErr.message}`, 500);
}
