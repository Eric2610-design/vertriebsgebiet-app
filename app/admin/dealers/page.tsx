"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Dealer = {
  id: number;
  name: string;
  city: string | null;
  postal_code: string | null;
  street: string | null;
  source: string | null;
  is_master: boolean;
  duplicate_of: number | null;
  created_at: string;
};

function norm(v: string | null | undefined) {
  return (v ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeNameForFuzzy(v: string | null | undefined) {
  const s = norm(v)
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    // häufige Rechtsformen/Noise raus
    .replace(/\b(gmbh|mbh|ag|kg|ohg|gbr|eg|ehg|ek|e\.k\.|ug|ltd|inc)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/** Levenshtein distance */
function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const v0 = new Array(b.length + 1).fill(0);
  const v1 = new Array(b.length + 1).fill(0);

  for (let i = 0; i <= b.length; i++) v0[i] = i;

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(
        v1[j] + 1, // insert
        v0[j + 1] + 1, // delete
        v0[j] + cost // replace
      );
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }

  return v1[b.length];
}

function similarity(a: string, b: string) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

type Group = {
  key: string;
  list: Dealer[];
  reason: "exact" | "fuzzy";
  postalCodes: string[]; // normalized non-empty
  hasPostalWarning: boolean;
};

export default function AdminDealersPage() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyGroupKey, setBusyGroupKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAll, setShowAll] = useState(false);

  // Fuzzy Settings (kannst du später in UI packen)
  const FUZZY_THRESHOLD = 0.86; // 0..1 (höher = strenger)

  useEffect(() => {
    loadDealers();
  }, []);

  async function loadDealers() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("dealers")
      .select("id,name,city,postal_code,street,source,is_master,duplicate_of,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setDealers([]);
    } else {
      setDealers((data as Dealer[]) || []);
    }

    setLoading(false);
  }

  const groups: Group[] = useMemo(() => {
    if (!dealers.length) return [];

    // 1) Exakte Gruppen nach Name+Stadt
    const exactMap = new Map<string, Dealer[]>();
    for (const d of dealers) {
      const key = `${norm(d.name)}|${norm(d.city)}`;
      const arr = exactMap.get(key) ?? [];
      arr.push(d);
      exactMap.set(key, arr);
    }

    const exactGroups: Group[] = Array.from(exactMap.entries()).map(([key, list]) => {
      const pcs = Array.from(new Set(list.map((x) => norm(x.postal_code)).filter(Boolean)));
      return {
        key: `exact:${key}`,
        list,
        reason: "exact",
        postalCodes: pcs,
        hasPostalWarning: pcs.length > 1,
      };
    });

    // Wenn showAll=false: nur Dubletten aus exact nehmen und fuzzy ergänzen
    // 2) Fuzzy-Gruppen: wir erstellen zusätzliche Gruppen, wenn Namen ähnlich sind,
    //    aber NICHT bereits in derselben exact-Gruppe sind.
    //    Restriktion: gleiche PLZ oder gleiche Stadt (fallback).
    const fuzzyGroups: Group[] = [];
    const usedPairs = new Set<string>();

    // Index nach Stadt für schnellere Kandidaten
    const byCity = new Map<string, Dealer[]>();
    for (const d of dealers) {
      const c = norm(d.city);
      const arr = byCity.get(c) ?? [];
      arr.push(d);
      byCity.set(c, arr);
    }

    function pairKey(a: Dealer, b: Dealer) {
      const x = Math.min(a.id, b.id);
      const y = Math.max(a.id, b.id);
      return `${x}:${y}`;
    }

    // Wir iterieren dealerweise, vergleichen nur innerhalb derselben Stadt (schnell + sinnvoll).
    for (const d of dealers) {
      const cKey = norm(d.city);
      const candidates = byCity.get(cKey) ?? [];
      const dn = normalizeNameForFuzzy(d.name);

      if (!dn) continue;

      // Kleine Gruppe sammeln, wenn d zu anderen passt
      const group: Dealer[] = [d];

      for (const o of candidates) {
        if (o.id === d.id) continue;

        // schon gleiche exact-Gruppe? Dann ignorieren (ist sowieso in exact)
        const exactA = `${norm(d.name)}|${norm(d.city)}`;
        const exactB = `${norm(o.name)}|${norm(o.city)}`;
        if (exactA === exactB) continue;

        const pk = pairKey(d, o);
        if (usedPairs.has(pk)) continue;

        // PLZ Gate: gleiche PLZ (wenn vorhanden) oder fallback Stadt
        const plzA = norm(d.postal_code);
        const plzB = norm(o.postal_code);
        const plzMatches = plzA && plzB ? plzA === plzB : false;
        const cityMatches = cKey.length > 0; // gleiche Stadt, weil candidates aus city index

        // Fuzzy-Score
        const on = normalizeNameForFuzzy(o.name);
        if (!on) continue;

        const score = similarity(dn, on);
        if (score >= FUZZY_THRESHOLD && (plzMatches || cityMatches)) {
          group.push(o);
          usedPairs.add(pk);
        }
      }

      // Fuzzy-Gruppe nur, wenn mehr als 1 Eintrag
      if (group.length > 1) {
        // dedupe ids
        const uniq = Array.from(new Map(group.map((x) => [x.id, x])).values());
        const pcs = Array.from(new Set(uniq.map((x) => norm(x.postal_code)).filter(Boolean)));

        fuzzyGroups.push({
          key: `fuzzy:${d.id}:${cKey}`,
          list: uniq,
          reason: "fuzzy",
          postalCodes: pcs,
          hasPostalWarning: pcs.length > 1,
        });
      }
    }

    // Filter:
    const combined = [...exactGroups, ...fuzzyGroups]
      .filter((g) => (showAll ? true : g.list.length > 1))
      // sinnvolle Sortierung: exact zuerst, dann fuzzy
      .sort((a, b) => {
        if (a.reason !== b.reason) return a.reason === "exact" ? -1 : 1;
        return (a.list[0]?.name ?? "").localeCompare(b.list[0]?.name ?? "");
      });

    return combined;
  }, [dealers, showAll]);

  async function setMaster(masterId: number, groupKey: string, group: Group) {
    // ✅ Confirm, wenn PLZ Warnung
    if (group.hasPostalWarning) {
      const ok = confirm(
        `Achtung: Unterschiedliche PLZ in dieser Gruppe (${group.postalCodes.join(", ")}).\n` +
          `Das sind oft Filialen.\n\nWirklich zusammenführen und ID ${masterId} als Master setzen?`
      );
      if (!ok) return;
    }

    setBusyGroupKey(groupKey);
    setError(null);

    try {
      const otherIds = group.list.filter((d) => d.id !== masterId).map((d) => d.id);

      const { error: e1 } = await supabase
        .from("dealers")
        .update({ is_master: true, duplicate_of: null })
        .eq("id", masterId);
      if (e1) throw e1;

      if (otherIds.length) {
        const { error: e2 } = await supabase
          .from("dealers")
          .update({ is_master: false, duplicate_of: masterId })
          .in("id", otherIds);
        if (e2) throw e2;
      }

      await loadDealers();
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? String(err));
    } finally {
      setBusyGroupKey(null);
    }
  }

  return (
    <main style={{ padding: 40 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Dublettenkontrolle</h1>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Alle Händler anzeigen
        </label>

        <button onClick={loadDealers} disabled={loading}>
          Neu laden
        </button>
      </div>

      {loading && <p style={{ marginTop: 16 }}>Lade Händler …</p>}
      {error && (
        <p style={{ marginTop: 16, color: "red", whiteSpace: "pre-wrap" }}>
          Fehler: {error}
        </p>
      )}

      {!loading && groups.length === 0 && <p style={{ marginTop: 16 }}>Keine Gruppen gefunden 🎉</p>}

      {!loading &&
        groups.map((g) => {
          const master = g.list.find((x) => x.is_master) ?? g.list[0];
          const groupBusy = busyGroupKey === g.key;

          return (
            <section
              key={g.key}
              style={{
                marginTop: 28,
                paddingTop: 16,
                borderTop: "2px solid #ddd",
                opacity: groupBusy ? 0.6 : 1,
              }}
            >
              <h3 style={{ margin: 0 }}>
                {master?.name}
                {master?.city ? ` – ${master.city}` : ""}
                <span style={{ fontWeight: 400, opacity: 0.7 }}>
                  {" "}
                  (Datensätze: {g.list.length}) · {g.reason === "exact" ? "Exakt" : "Fuzzy"}
                </span>
              </h3>

              {g.hasPostalWarning && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    background: "#fff3cd",
                    border: "1px solid #ffe69c",
                    borderRadius: 4,
                    color: "#664d03",
                  }}
                >
                  ⚠️ <strong>Achtung:</strong> Unterschiedliche PLZ in dieser Gruppe ({g.postalCodes.join(", ")}).
                  Vermutlich mehrere Filialen – bitte prüfen, bevor du zusammenführst.
                </div>
              )}

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                <thead>
                  <tr>
                    <th align="left">ID</th>
                    <th align="left">PLZ</th>
                    <th align="left">Stadt</th>
                    <th align="left">Straße</th>
                    <th align="left">Quelle</th>
                    <th align="left">Status</th>
                    <th align="left">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {g.list.map((d) => (
                    <tr key={d.id}>
                      <td>{d.id}</td>
                      <td>{d.postal_code ?? "-"}</td>
                      <td>{d.city ?? "-"}</td>
                      <td>{d.street ?? "-"}</td>
                      <td>{d.source ?? "-"}</td>
                      <td>
                        {d.is_master ? <strong>Master</strong> : <>Duplikat → {d.duplicate_of ?? "?"}</>}
                      </td>
                      <td>
                        {!d.is_master ? (
                          <button
                            onClick={() => setMaster(d.id, g.key, g)}
                            disabled={groupBusy}
                            style={{ cursor: "pointer", padding: "4px 8px" }}
                          >
                            Als Master setzen
                          </button>
                        ) : (
                          <span style={{ opacity: 0.6 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
    </main>
  );
}
