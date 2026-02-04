"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Dealer = {
  id: number;
  name: string;
  city: string;
  street?: string;
  source_file?: string;
  is_master: boolean;
  duplicate_of?: number | null;
  norm_name: string;
  norm_city: string;
};

export default function DealerAdmin() {
  const [rows, setRows] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("dealer_duplicates")
      .select("*")
      .order("norm_name")
      .order("is_master", { ascending: false });

    if (!error && data) setRows(data as Dealer[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function setMaster(masterId: number, group: Dealer[]) {
    const dupIds = group
      .filter((d) => d.id !== masterId)
      .map((d) => d.id);

    await supabase.from("dealers").update({
      is_master: true,
      duplicate_of: null,
    }).eq("id", masterId);

    if (dupIds.length) {
      await supabase.from("dealers").update({
        is_master: false,
        duplicate_of: masterId,
      }).in("id", dupIds);
    }

    await load();
  }

  if (loading) return <p>Lade…</p>;

  // Gruppen bilden
  const groups = Object.values(
    rows.reduce((acc: any, r) => {
      const key = `${r.norm_name}|${r.norm_city}`;
      acc[key] ??= [];
      acc[key].push(r);
      return acc;
    }, {})
  ) as Dealer[][];

  return (
    <main style={{ padding: 24 }}>
      <h1>Dublettenkontrolle</h1>

      {groups.map((group, i) => {
        const master = group.find((g) => g.is_master) ?? group[0];
        return (
          <section key={i} style={{ marginBottom: 24, borderBottom: "1px solid #ddd" }}>
            <h3>
              {master.name} – {master.city}
            </h3>

            <table style={{ width: "100%", marginTop: 8 }}>
              <thead>
                <tr>
                  <th align="left">ID</th>
                  <th align="left">Name</th>
                  <th align="left">Straße</th>
                  <th align="left">Quelle</th>
                  <th align="left">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {group.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.name}</td>
                    <td>{d.street}</td>
                    <td>{d.source_file}</td>
                    <td>{d.is_master ? "Master" : `Duplikat → ${d.duplicate_of}`}</td>
                    <td>
                      {!d.is_master && (
                        <button onClick={() => setMaster(d.id, group)}>
                          Als Master setzen
                        </button>
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
