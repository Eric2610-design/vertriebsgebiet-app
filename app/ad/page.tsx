"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Badge, Input } from "@/components/ui";
import type { Profile, Territory } from "@/lib/types";

function fmtTerritory(t: Territory) {
  return `${t.country} ${String(t.plz2_from).padStart(2, "0")}-${String(t.plz2_to).padStart(2, "0")}`;
}

export default function ADListPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/reps/list", { cache: "no-store" });
        const js = await res.json();
        if (cancelled) return;
        setProfiles(js.profiles ?? []);
        setTerritories(js.territories ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tFor = useMemo(() => {
    const m = new Map<string, Territory[]>();
    for (const t of territories) {
      if (!m.has(t.profile_email)) m.set(t.profile_email, []);
      m.get(t.profile_email)!.push(t);
    }
    for (const [k, v] of m) v.sort((a, b) => (a.plz2_from - b.plz2_from));
    return m;
  }, [territories]);

  const filtered = profiles.filter((p) => {
    const s = `${p.display_name} ${p.email}`.toLowerCase();
    return q.trim() ? s.includes(q.trim().toLowerCase()) : true;
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Außendienst</h1>
          <p className="text-sm text-slate-600">Je AD: Händler im Gebiet, Termine, Demo-Räder, Besuchs-/Berichtsverlauf.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/map"><Button variant="secondary">Karte</Button></Link>
          <Link href="/import"><Button variant="secondary">Import</Button></Link>
          <Link href="/"><Button variant="secondary">Home</Button></Link>
        </div>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader className="text-sm font-semibold">Suche</CardHeader>
          <CardContent>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name oder E-Mail…" />
            <div className="mt-2 text-xs text-slate-500">
              Tipp: AD-Gebiete kommen aus der Excel (FLYER_AD_PLZ.xlsx) und werden über Import eingelesen.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-3">
        {loading ? (
          <div className="text-sm text-slate-600">Lade...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-600">Keine Treffer.</div>
        ) : (
          filtered.map((p) => {
            const ranges = tFor.get(p.email) ?? [];
            const preview = ranges.slice(0, 6).map(fmtTerritory).join(" · ");
            return (
              <Card key={p.email}>
                <CardHeader className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{p.display_name}</div>
                    <div className="text-xs text-slate-600">{p.email}</div>
                  </div>
                  <Badge tone={p.role === "admin" ? "amber" : "slate"}>{p.role === "admin" ? "Admin" : "AD"}</Badge>
                </CardHeader>
                <CardContent className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-600">PLZ-Bereiche: <b>{ranges.length}</b></div>
                    <div className="mt-1 text-xs text-slate-500">
                      {ranges.length ? preview : "(noch keine Gebiete)"}
                      {ranges.length > 6 ? " …" : ""}
                    </div>
                  </div>
                  <Link href={`/ad/${encodeURIComponent(p.email)}`}>
                    <Button>Öffnen</Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </main>
  );
}
