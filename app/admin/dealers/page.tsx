"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Dealer = {
  id: number;
  name: string;
  city: string | null;
  street: string | null;
  source: string | null;
  created_at: string;
};

export default function AdminDealersPage() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDealers();
  }, []);

  async function loadDealers() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("dealers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setDealers([]);
    } else {
      setDealers(data || []);
    }

    setLoading(false);
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Admin – Händler</h1>

      {loading && <p>Lade Händler …</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && (
        <>
          <p>{dealers.length} Händler gefunden</p>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 20,
            }}
          >
            <thead>
              <tr>
                <th align="left">ID</th>
                <th align="left">Name</th>
                <th align="left">Stadt</th>
                <th align="left">Straße</th>
                <th align="left">Quelle</th>
              </tr>
            </thead>
            <tbody>
              {dealers.map((d) => (
                <tr key={d.id}>
                  <td>{d.id}</td>
                  <td>{d.name}</td>
                  <td>{d.city ?? "-"}</td>
                  <td>{d.street ?? "-"}</td>
                  <td>{d.source ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
