"use client";

import { useEffect, useMemo, useState } from "react";

import RequireRole from "@/components/RequireRole";
import { Card, CardContent, CardHeader, Input } from "@/components/ui";

type BackorderRow = {
  id: string;
  order_no: string | null;
  pos_no: string | null;
  article_no: string;
  order_date: string | null;
  customer_no: string | null;
  dealer_name: string | null;
  col_m: string | null;
  col_v: string | null;
  col_z: string | null;
  col_aa: string | null;
  col_ah: string | null;
  col_ak: string | null;
  col_ap: string | null;
  col_ar: string | null;
  col_as: string | null;
  dealer_country: string | null;
  order_seq: number | null;
  frame_size: string | null;
  price_col: string | null;
};

function isCH(country: string | null | undefined) {
  return String(country ?? "").toUpperCase() === "CH";
}

function fmtDateISO(value: string | null | undefined) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  // already YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  const d = new Date(t);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

export default function AuftragsrueckstandPage() {
  const [rows, setRows] = useState<BackorderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [runInfo, setRunInfo] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/backorders?limit=10000", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Daten konnten nicht geladen werden.");
        if (!alive) return;
        setRunInfo(json?.run ?? null);
        setRows((json?.rows ?? []) as BackorderRow[]);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Daten konnten nicht geladen werden.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const s = norm(q);
    if (!s) return rows;
    return rows.filter((r) => {
      if (norm(r.article_no).includes(s)) return true;
      if (norm(r.order_no).includes(s)) return true;
      if (norm(r.customer_no).includes(s)) return true;
      if (norm(r.dealer_name).includes(s)) return true;
      return false;
    });
  }, [rows, q]);

  return (
    <RequireRole allow={[("aussendienst" as any), "admin", "superadmin"]}>
      <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Auftragsrückstand</div>
                <div className="text-sm text-slate-600">
                  {runInfo?.created_at ? `Stand: ${fmtDateISO(runInfo.created_at)}` : "Kein Import gefunden."}
                </div>
              </div>
              <div className="w-full sm:w-80">
                <Input placeholder="Suchen (Artikel, Kunde, Händler, Auftrag)…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && <div className="text-sm text-slate-600">Lade…</div>}
            {err && <div className="text-sm text-red-700">{err}</div>}
            {!loading && !err && (
              <div className="text-xs text-slate-600 mb-2">Zeilen: {filtered.length}</div>
            )}

            {!loading && !err && (
              <div className="overflow-auto border rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-2 py-2 border-b">#</th>
                      <th className="text-left px-2 py-2 border-b">Auftrag</th>
                      <th className="text-left px-2 py-2 border-b">Pos</th>
                      <th className="text-left px-2 py-2 border-b">Datum</th>
                      <th className="text-left px-2 py-2 border-b">Kundennr</th>
                      <th className="text-left px-2 py-2 border-b">Händler</th>
                      <th className="text-left px-2 py-2 border-b">Artikel</th>
                      <th className="text-left px-2 py-2 border-b">Rahmen</th>
                      <th className="text-left px-2 py-2 border-b">M</th>
                      <th className="text-left px-2 py-2 border-b">V</th>
                      <th className="text-left px-2 py-2 border-b">Z</th>
                      <th className="text-left px-2 py-2 border-b">AA</th>
                      <th className="text-left px-2 py-2 border-b">AH</th>
                      <th className="text-left px-2 py-2 border-b">AK</th>
                      <th className="text-left px-2 py-2 border-b">AP</th>
                      <th className="text-left px-2 py-2 border-b">Preis</th>
                      <th className="text-left px-2 py-2 border-b">Land</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="px-2 py-2 whitespace-nowrap">{r.order_seq ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.order_no ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.pos_no ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{fmtDateISO(r.order_date)}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.customer_no ?? ""}</td>
                        <td className="px-2 py-2">{r.dealer_name ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.article_no}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.frame_size ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.col_m ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.col_v ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.col_z ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{fmtDateISO(r.col_aa)}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.col_ah ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.col_ak ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.col_ap ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.price_col ?? ""}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{isCH(r.dealer_country) ? "CH" : (r.dealer_country ?? "")}</td>
                      </tr>
                    ))}
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
