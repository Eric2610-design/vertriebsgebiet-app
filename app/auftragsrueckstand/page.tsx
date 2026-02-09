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
  order_seq: number | null;
  frame_size: string | null;
  price_col: string | null;

  col_a: string | null;
  col_m: string | null;
  col_v: string | null;
  col_z: string | null;
  col_aa: string | null;
  col_aa_date: string | null;
  col_ah: string | null;
  col_ak: string | null;
  col_ap: string | null;
};

type Summary = {
  rows: number;
  orders: number;
  articles: number;
  ch: number;
  non_ch: number;
  matched_dealers: number;
  unmatched_dealers: number;
};

export default function AuftragsRueckstandPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [run, setRun] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [headers, setHeaders] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/backorders");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? res.statusText);
      setRun(json.run ?? null);
      setRows(json.rows ?? []);
      setSummary(json.summary ?? null);
      setHeaders(json.headers ?? {});
    } catch (e: any) {
      setErr(e?.message ?? "Fehler");
      setRun(null);
      setRows([]);
      setSummary(null);
      setHeaders({});
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

  const formatDate = (value: string | null) => {
    if (!value) return "";
    const trimmed = String(value).trim();
    if (!trimmed) return "";
    const german = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (german) {
      const d = german[1].padStart(2, "0");
      const m = german[2].padStart(2, "0");
      const y = german[3];
      return `${d}.${m}.${y}`;
    }
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const serial = Number(trimmed);
      if (Number.isFinite(serial)) {
        const jsDate = new Date((serial - 25569) * 86400000);
        if (!Number.isNaN(jsDate.getTime())) return jsDate.toLocaleDateString("de-DE");
      }
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("de-DE");
  };

  const label = (key: string, fallback: string) => {
    const raw = String(headers[key] ?? "").trim();
    return raw || fallback;
  };

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

        {!loading && !err && !run && (
          <Card>
            <CardContent>
              <div className="text-sm text-neutral-600">
                Noch kein Auftragsrückstand vorhanden. Bitte zuerst einen Import im Adminbereich durchführen.
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !err && summary && (
          <Card>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs uppercase text-neutral-500">Zeilen</div>
                  <div className="text-lg font-semibold">{summary.rows}</div>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs uppercase text-neutral-500">Aufträge</div>
                  <div className="text-lg font-semibold">{summary.orders}</div>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs uppercase text-neutral-500">Artikel</div>
                  <div className="text-lg font-semibold">{summary.articles}</div>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs uppercase text-neutral-500">CH / DE-AT</div>
                  <div className="text-lg font-semibold">
                    {summary.ch} / {summary.non_ch}
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs uppercase text-neutral-500">Händler gematcht</div>
                  <div className="text-lg font-semibold">{summary.matched_dealers}</div>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs uppercase text-neutral-500">Händler unbekannt</div>
                  <div className="text-lg font-semibold">{summary.unmatched_dealers}</div>
                </div>
              </div>
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
                      <th className="py-2 pr-3">{label("N", "Artikel")}</th>
                      <th className="py-2 pr-3">{label("D", "Datum")}</th>
                      <th className="py-2 pr-3">Kundennr</th>
                      <th className="py-2 pr-3">Händler</th>
                      <th className="py-2 pr-3">{label("A", "A")}</th>
                      <th className="py-2 pr-3">{label("M", "M")}</th>
                      <th className="py-2 pr-3">{label("V", "V")}</th>
                      <th className="py-2 pr-3">{label("Z", "Z")}</th>
                      <th className="py-2 pr-3">Rahmengröße</th>
                      <th className="py-2 pr-3">{label("AA", "AA")}</th>
                      <th className="py-2 pr-3">{label("AH", "AH")}</th>
                      <th className="py-2 pr-3">{label("AK", "AK")}</th>
                      <th className="py-2 pr-3">{label("AP", "AP")}</th>
                      <th className="py-2 pr-3">
                        Preis ({label("AR", "AR")} / {label("AS", "AS")})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-3 font-semibold">{r.order_seq ?? ""}</td>
                        <td className="py-2 pr-3">{r.article_no}</td>
                        <td className="py-2 pr-3">{formatDate(r.order_date)}</td>
                        <td className="py-2 pr-3">{r.customer_no ?? ""}</td>
                        <td className="py-2 pr-3">{r.dealer_name ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_a ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_m ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_v ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_z ?? ""}</td>
                        <td className="py-2 pr-3">{r.frame_size ?? ""}</td>
                        <td className="py-2 pr-3">{formatDate(r.col_aa_date ?? r.col_aa)}</td>
                        <td className="py-2 pr-3">{r.col_ah ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_ak ?? ""}</td>
                        <td className="py-2 pr-3">{r.col_ap ?? ""}</td>
                        <td className="py-2 pr-3">{r.price_col ?? ""}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={15} className="py-6 text-center text-neutral-500">
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
