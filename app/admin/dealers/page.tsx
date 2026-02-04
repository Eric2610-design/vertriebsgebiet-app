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

export default function AdminDealersPage() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyGroupKey, setBusyGroupKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadDealers();
  }, []);

  async function loadDealers() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("dealers")
      .select(
        "id,name,city,postal_code,street,source,is_master,duplicate_of,created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setDealers([]);
    } else {
      setDealers((data as Dealer[]) || []);
    }

    setLoading(false);
  }

  /**
   * Gruppierung:
   * 1) Name + Stadt (bewusst OHNE PLZ)
   * 2) Innerhalb der Gruppe prüfen wir, ob mehrere PLZ existieren
   */
  const groups = useMemo(() => {
    const acc = new Map<string, Dealer[]>();

    for (const d of dealers) {
      const key = `${norm(d.name)}|${norm(d.city)}`;
      const arr = acc.get(key) ?? [];
      arr.push(d);
      acc.set(key, arr);
    }

    return Array.from(acc.entries())
      .map(([key, list]) => ({ key, list }))
      .filter(({ list }) => (showAll ? true : list.length > 1))
      .sort((a, b) =>
        (a.list[0]?.name ?? "").localeCompare(b.list[0]?.name ?? "")
      );
  }, [dealers, showAll]);

  async function setMaster(masterId: number, groupKey: string, group: Dealer[]) {
    setBusyGroupKey(groupKey);
    setError(null);

    try {
      const otherIds = group.filter((d) => d.id !== masterId).map((d) => d.id);

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
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
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

      {!loading && groups.length === 0 && (
        <p style={{ marginTop: 16 }}>Keine Dubletten gefunden 🎉</p>
      )}

      {!loading &&
        groups.map(({ key, list }) => {
          const master = list.find((x) => x.is_master) ?? list[0];
          const groupBusy = busyGroupKey === key;

          const postalCodes = Array.from(
            new Set(list.map((d) => norm(d.postal_code)).filter(Boolean))
          );
          const hasPostalWarning = postalCodes.length > 1;

          return (
            <section
              key={key}
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
                  (Datensätze: {list.length})
                </span>
              </h3>

              {hasPostalWarning && (
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
                  ⚠️ <strong>Achtung:</strong> Unterschiedliche PLZ innerhalb dieser Gruppe (
                  {postalCodes.join(", ")}).  
                  Vermutlich mehrere Filialen – bitte genau prüfen, bevor du zusammenführst.
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
                  {list.map((d) => (
                    <tr key={d.id}>
                      <td>{d.id}</td>
                      <td>{d.postal_code ?? "-"}</td>
                      <td>{d.city ?? "-"}</td>
                      <td>{d.street ?? "-"}</td>
                      <td>{d.source ?? "-"}</td>
                      <td>
                        {d.is_master ? (
                          <strong>Master</strong>
                        ) : (
                          <>Duplikat → {d.duplicate_of ?? "?"}</>
                        )}
                      </td>
                      <td>
                        {!d.is_master ? (
                          <button
                            onClick={() => setMaster(d.id, key, list)}
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
