"use client";

import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";
import { Card, CardContent, Button, Input } from "@/components/ui";

type Row = {
  id: string;
  article_no: string;
  order_date: string | null;
  customer_no: string | null;
  dealer_name: string | null;
  dealer_country: string | null;
  order_seq: number | null;
  frame_size: string | null;
  price_col: string | null;

  col_a: string | null;
  col_m: string | null;
  col_v: string | null;
  col_z: string | null;
  col_aa: string | null;
  col_ah: string | null;
  col_ak: string | null;
  col_ap: string | null;
};

export default function AuftragsRueckstandPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const url = q ? `/api/backorders?q=${encodeURIComponent(q)}&limit=5000` : `/api/backorders?limit=5000`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? res.statusText);
      setRows(json.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Fehler");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      return (
        String(r.article_no ?? "").toLowerCase().includes(s) ||
        String(r.customer_no ?? "").toLowerCase().includes(s) ||
        String(r.dealer_name ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, q]);

  return (
    <RequireRole allow={["aussendienst", "admin", "superadmin"]}>
      <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Auftragsrückstand</h1>
            <p className="text-sm text-neutral-600">
              Reihenfolge-Nummer je Artikelnummer: 1 = ältester Auftrag, höher = neuer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suche Artikel / Kundennr / Händler" />
            <Button onClick={load}>Aktualisieren</Button>
          </div>
        </div>

        {err && (
          <Card>
            <CardContent>
              <div className="text-sm text-red-600">❌ {err}</div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            {loading ? (
              <div className="text-sm text-neutral-600">Lade …</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left">
                    <tr className="border-b">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Artikel</th>
                      <th className="py-2 pr-3">Datum</th>
                      <th className="py-2 pr-3">Kundennr</th>
                      <th className="py-2 pr-3">Händler</th>
                      <th className="py-2 pr-3">Land</th>
                      <th className="py-2 pr-3">Rahmengröße</th>
                      <th className="py-2 pr-3">A</th>
                      <th className="py-2 pr-3">M</th>
                      <th className="py-2 pr-3">V</th>
                      <th className="py-2 pr-3">Z</th>
                      <th className="py-2 pr-3">AA</th>
                      <th className="py-2 pr-3">AH</th>
                      <th className="py-2 pr-3">AK</th>
                      <th className="py-2 pr-3">AP</th>
                      <th className="py-2 pr-3">AR/AS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-3 font-semibold">{r.order_seq ?? ""}</td>
                        <td className="py-2 pr-3">{r.article_no}</td>
                        <td className="py-2 pr-3">{r.order_date ?? ""}</td>
                        <td className="py-2 pr-3">{r.customer_no ?? ""}</td>
                        <td className="py-2 pr-3">{r.dealer_name ?? ""}</td>
                        <td className="py-2 pr-3">{r.dealer_country ?? ""}</td>
                        <td className="py-2 pr-3">{r.frame_size ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_a ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_m ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_v ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_z ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_aa ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_ah ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_ak ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_ap ?? ""}</td>
                        <td className="py-2 pr-3">{r.price_col ?? ""}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={16} className="py-6 text-center text-neutral-500">
                          Keine Daten (erst Import im Adminbereich machen).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}
