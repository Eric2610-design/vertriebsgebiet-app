"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Dealer = {
  id: number;
  name: string;
  city: string | null;
  source: string | null;
  is_master: boolean;
  duplicate_of: number | null;
};

const supabase = createClient();

export default function DealersAdminPage() {
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
      .order("name");

    if (error) {
      setError(error.message);
    } else {
      setDealers(data || []);
    }

    setLoading(false);
  }

  async function setMaster(dealerId: number) {
    // 1. Gewählten Dealer zum Master machen
    const { error: masterError } = await supabase
      .from("dealers")
      .update({
        is_master: true,
        duplicate_of: null,
      })
      .eq("id", dealerId);

    if (masterError) {
      alert(masterError.message);
      return;
    }

    // 2. Alle anderen gleichen Namen auf diesen Master zeigen lassen
    const masterDealer = dealers.find((d) => d.id === dealerId);
    if (!masterDealer) return;

    await supabase
      .from("dealers")
      .update({
        is_master: false,
        duplicate_of: dealerId,
      })
      .eq("name", masterDealer.name)
      .neq("id", dealerId);

    // 3. Neu laden
    loadDealers();
  }

  if (loading) return <p>Lade Händler …</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Dublettenkontrolle</h1>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 16,
        }}
      >
        <thead>
          <tr>
            <th align="left">ID</th>
            <th align="left">Name</th>
            <th align="left">Stadt</th>
            <th align="left">Quelle</th>
            <th align="left">Status</th>
          </tr>
        </thead>
        <tbody>
          {dealers.map((dealer) => (
            <tr key={dealer.id}>
              <td>{dealer.id}</td>
              <td>{dealer.name}</td>
              <td>{dealer.city ?? "-"}</td>
              <td>{dealer.source ?? "-"}</td>
              <td>
                {dealer.is_master ? (
                  <strong>Master</strong>
                ) : (
                  <button
                    onClick={() => setMaster(dealer.id)}
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
    </div>
  );
}
