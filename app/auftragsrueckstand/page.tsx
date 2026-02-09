"use client";

import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";

type Row = {
  id: string;
  article_no: string;
  order_date: string | null;
  col_a: string | null;
  col_m: string | null;
  col_v: string | null;
  col_z: string | null;
  col_aa: string | null;
  col_ah: string | null;
  col_ak: string | null;
  col_ap: string | null;
  customer_no: string | null;
  dealer_name: string | null;
  frame_size: string | null;
  order_seq: number | null;
  price_col: string | null;
};

export default function AuftragsRueckstandPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/backorders?limit=5000");
      const json = await res.json().catch(() => ({}));
      if (!alive) return;
      if (!res.ok) {
        setError(json?.error ?? res.statusText);
        setRows([]);
      } else {
        setRows((json?.rows ?? []) as Row[]);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      return (
        String(r.article_no ?? "").toLowerCase().includes(t) ||
        String(r.customer_no ?? "").toLowerCase().includes(t) ||
        String(r.dealer_name ?? "").toLowerCase().includes(t)
      );
    });
  }, [rows, q]);

  return (
    <RequireRole allow={["aussendienst", "admin", "superadmin"]}>
      <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Auftragsrückstand</h1>
            <div className="mt-1 text-sm text-slate-600">
              Reihenfolge-Nummer (pro Artikel) wird global vergeben: ältester Auftrag = kleinste Nummer.
            </div>
          </div>
          <div className="w-full sm:w-72">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suche: Artikel / Kundennr / Händler"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border bg-white p-4">Lade…</div>
        ) : error ? (
          <div className="rounded-2xl border bg-white p-4 text-red-600">Fehler: {error}</div>
        ) : (
          <div className="rounded-2xl border bg-white overflow-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="p-3 text-left">#</th>
                  <th className="p-3 text-left">Artikel</th>
                  <th className="p-3 text-left">Datum (D)</th>
                  <th className="p-3 text-left">Kundennr</th>
                  <th className="p-3 text-left">Händler</th>
                  <th className="p-3 text-left">A</th>
                  <th className="p-3 text-left">M</th>
                  <th className="p-3 text-left">V</th>
                  <th className="p-3 text-left">Z</th>
                  <th className="p-3 text-left">Rahmen</th>
                  <th className="p-3 text-left">AA</th>
                  <th className="p-3 text-left">AH</th>
                  <th className="p-3 text-left">AK</th>
                  <th className="p-3 text-left">AP</th>
                  <th className="p-3 text-left">AR/AS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 font-medium">{r.order_seq ?? ""}</td>
                    <td className="p-3">{r.article_no}</td>
                    <td className="p-3">{r.order_date ?? ""}</td>
                    <td className="p-3">{r.customer_no ?? ""}</td>
                    <td className="p-3">{r.dealer_name ?? ""}</td>
                    <td className="p-3">{r.col_a ?? ""}</td>
                    <td className="p-3">{r.col_m ?? ""}</td>
                    <td className="p-3">{r.col_v ?? ""}</td>
                    <td className="p-3">{r.col_z ?? ""}</td>
                    <td className="p-3">{r.frame_size ?? ""}</td>
                    <td className="p-3">{r.col_aa ?? ""}</td>
                    <td className="p-3">{r.col_ah ?? ""}</td>
                    <td className="p-3">{r.col_ak ?? ""}</td>
                    <td className="p-3">{r.col_ap ?? ""}</td>
                    <td className="p-3">{r.price_col ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequireRole>
  );
}
