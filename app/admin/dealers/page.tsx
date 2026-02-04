"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Dealer = {
  id: number;
  name: string;
  city: string | null;
  street: string | null;
  source_file: string | null;
  is_master: boolean;
  duplicate_of: number | null;
};

const supabase = createClient();

export default function DealersAdminPage() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDealers();
  }, []);

  async function loadDealers() {
    setLoading(true);

    const { data } = await supabase
      .from("dealers")
      .select("*")
      .order("name");

    setDealers(data || []);
    setLoading(false);
  }

  async function setMaster(masterId: number, group: Dealer[]) {
    const otherIds = group
      .filter((d) => d.id !== masterId)
      .map((d) => d.id);

    // Master setzen
    await supabase
      .from("dealers")
      .update({ is_master: true, duplicate_of: null })
      .eq("id", masterId);

    // Alle anderen zu Duplikaten machen
    if (otherIds.length > 0) {
      await supabase
        .from("dealers")
        .update({ is_master: false, duplicate_of: masterId })
        .in("id", otherIds);
    }

    loadDealers();
  }

  if (loading) return <p>Lade Dubletten …</p>;

  // 🔹 Gruppieren nach Name + Stadt
  function norm(v?: string | null) {
  return (v ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

const groups = Object.values(
  dealers.reduce((acc: any, d) => {
    const key = `${norm(d.name)}|${norm(d.city)}`;
    acc[key] ??= [];
    acc[key].push(d);
    return acc;
  }, {})
).filter((g: Dealer[]) => g.length > 1);


  return (
    <main style={{ padding: 24 }}>
      <h1>Dublettenkontrolle</h1>

      {groups.length === 0 && (
        <p>Keine Dubletten gefunden 🎉</p>
      )}

      {groups.map((group, idx) => {
        const master =
          group.find((g) => g.is_master) ?? group[0];

        return (
          <section
            key={idx}
            style={{
              marginBottom: 32,
              paddingBottom: 16,
              borderBottom: "1px solid #ddd",
            }}
          >
            <h3>
              {master.name} – {master.city}
            </h3>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: 8,
              }}
            >
              <thead>
                <tr>
                  <th align="left">ID</th>
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
                    <td>{d.street ?? "-"}</td>
                    <td>{d.source_file ?? "-"}</td>
                    <td>
                      {d.is_master ? (
                        <strong>Master</strong>
                      ) : (
                        `Duplikat → ${d.duplicate_of}`
                      )}
                    </td>
                    <td>
                      {!d.is_master && (
                        <button
                          onClick={() =>
                            setMaster(d.id, group)
                          }
                          style={{
                            cursor: "pointer",
                            padding: "4px 8px",
                          }}
                        >
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

