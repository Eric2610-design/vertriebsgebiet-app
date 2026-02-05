"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Badge, Input } from "@/components/ui";

type Summary = {
  profile: { display_name: string; email: string; role: string } | null;
  territories: Array<{ country: string; plz2_from: number; plz2_to: number }>;
  dealers: Array<{ id: string; name: string; zip: string | null; city: string | null; last_visit_at: string | null }>;
  timeline: Array<{ id: string; created_at: string; note: string; dealer: { id: string; name: string; zip: string | null; city: string | null } | null }>;
};

function fmtRange(r: any) {
  return `${r.country} ${String(r.plz2_from).padStart(2, "0")}-${String(r.plz2_to).padStart(2, "0")}`;
}

export default function RepClient({ email }: { email: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/reps/${encodeURIComponent(email)}/summary`, { cache: "no-store" });
        const js = await res.json();
        if (cancelled) return;
        setData(js);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const dealersFiltered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = data?.dealers ?? [];
    if (!query) return list;
    return list.filter((d) => `${d.name} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase().includes(query));
  }, [data, q]);

  const territoryText = useMemo(() => {
    const ranges = data?.territories ?? [];
    if (!ranges.length) return "Keine Gebiete hinterlegt.";
    return ranges.map(fmtRange).join(" · ");
  }, [data]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data?.profile?.display_name ?? email}</h1>
          <p className="text-sm text-slate-600">{email}</p>
          <p className="mt-1 text-xs text-slate-500">{territoryText}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ad"><Button variant="secondary">Zurück</Button></Link>
          <Link href="/map"><Button variant="secondary">Karte</Button></Link>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-slate-600">Lade...</div>
      ) : data?.profile == null ? (
        <div className="mt-4 text-sm text-rose-600">Profil nicht gefunden.</div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex items-start justify-between gap-2">
              <div className="text-sm font-semibold">Händler im Gebiet</div>
              <Badge tone={data.profile.role === "admin" ? "amber" : "slate"}>
                {data.profile.role === "admin" ? "Admin" : "AD"}
              </Badge>
            </CardHeader>
            <CardContent>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Händler suchen…" />
              <div className="mt-2 text-xs text-slate-500">Treffer: {dealersFiltered.length}</div>
              <div className="mt-2 max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-white">
                {dealersFiltered.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">Keine Händler.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {dealersFiltered.slice(0, 800).map((d) => (
                      <li key={d.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold">{d.name}</div>
                            <div className="text-xs text-slate-600">{`${d.zip ?? ""} ${d.city ?? ""}`.trim()}</div>
                            {d.last_visit_at ? (
                              <div className="mt-1 text-xs text-slate-500">Letzter Besuch: {new Date(d.last_visit_at).toLocaleDateString("de-DE")}</div>
                            ) : (
                              <div className="mt-1 text-xs text-slate-500">Noch kein Besuch</div>
                            )}
                          </div>
                          <Link href={`/dealer/${d.id}`} className="text-xs text-blue-700 underline">Öffnen</Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {dealersFiltered.length > 800 ? <div className="mt-2 text-xs text-slate-500">Liste gekürzt auf 800.</div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-sm font-semibold">Besuche (chronologisch)</CardHeader>
            <CardContent>
              <div className="text-xs text-slate-500">
                Besuche werden über Händler im Gebiet aggregiert (vorbereitet für spätere Login-Zuordnung).
              </div>
              <div className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-white">
                {(data.timeline ?? []).length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">Noch keine Besuche.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.timeline.slice(0, 1200).map((v) => (
                      <li key={v.id} className="p-3">
                        <div className="text-xs text-slate-500">{new Date(v.created_at).toLocaleString("de-DE")}</div>
                        {v.dealer ? (
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold">{v.dealer.name}</div>
                            <Link href={`/dealer/${v.dealer.id}`} className="text-xs text-blue-700 underline">Details</Link>
                          </div>
                        ) : null}
                        <div className="mt-1 text-sm">{v.note}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {(data.timeline ?? []).length > 1200 ? <div className="mt-2 text-xs text-slate-500">Timeline gekürzt auf 1200.</div> : null}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
