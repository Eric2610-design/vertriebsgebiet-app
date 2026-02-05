"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Badge, Input } from "@/components/ui";
import type { Profile, Territory } from "@/lib/types";

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

  const tCount = (email: string) => territories.filter((t) => t.profile_email === email).length;
  const filtered = profiles.filter((p) => {
    const s = `${p.display_name} ${p.email}`.toLowerCase();
    return q.trim() ? s.includes(q.trim().toLowerCase()) : true;
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Außendienst</h1>
          <p className="text-sm text-slate-600">Übersicht je AD: Händler im Gebiet + Besuchsverlauf.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/map"><Button variant="secondary">Karte</Button></Link>
          <Link href="/"><Button variant="secondary">Home</Button></Link>
        </div>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader className="text-sm font-semibold">Suche</CardHeader>
          <CardContent>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name oder E-Mail" />
            <p className="mt-2 text-xs text-slate-500">
              Gebiete kommen aus der AD/PLZ-Excel (2-stellige PLZ-Bereiche).
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {loading ? (
          <div className="text-sm text-slate-600">Lade...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-600">Keine Treffer.</div>
        ) : (
          filtered.map((p) => (
            <Card key={p.email}>
              <CardHeader className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{p.display_name}</div>
                  <div className="text-xs text-slate-600">{p.email}</div>
                </div>
                <Badge tone={p.role === "admin" ? "amber" : "slate"}>{p.role === "admin" ? "Admin" : "AD"}</Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-sm text-slate-600">PLZ-Bereiche: <b>{tCount(p.email)}</b></div>
                <Link href={`/ad/${encodeURIComponent(p.email)}`}>
                  <Button>Öffnen</Button>
                </Link>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
