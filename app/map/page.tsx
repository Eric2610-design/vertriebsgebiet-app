"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Badge, Input } from "@/components/ui";
import type { Dealer } from "@/lib/types";
import GoogleMapClient from "./GoogleMapClient";

type Filter = { flyer: boolean; others: boolean; q: string };

export default function MapPage() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [filter, setFilter] = useState<Filter>({ flyer: true, others: true, q: "" });
  const [loading, setLoading] = useState(true);
  const [geocodeBusy, setGeocodeBusy] = useState(false);

  async function loadDealers() {
    setLoading(true);
    const res = await fetch("/api/dealers/list", { cache: "no-store" });
    const js = await res.json();
    setDealers(js.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadDealers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return dealers.filter((d: any) => {
      const text = `${d.name} ${d.street ?? ""} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase();
      const matches = q ? text.includes(q) : true;
      const hasFlyer = d.has_flyer === true;
      const passes = (hasFlyer && filter.flyer) || (!hasFlyer && filter.others);
      return matches && passes;
    });
  }, [dealers, filter]);

  async function runGeocode() {
    setGeocodeBusy(true);
    try {
      await fetch("/api/geocode/run", { method: "POST" });
      await loadDealers();
    } finally {
      setGeocodeBusy(false);
    }
  }

  const stats = useMemo(() => {
    const total = dealers.length;
    const withGeo = dealers.filter((d: any) => d.lat != null && d.lng != null).length;
    const flyer = dealers.filter((d: any) => d.has_flyer === true).length;
    return { total, withGeo, flyer };
  }, [dealers]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <Card>
          <CardHeader className="flex items-start justify-between gap-3 flex-col sm:flex-row">
            <div>
              <div className="text-lg font-semibold text-slate-900">Händlerkarte</div>
              <div className="text-sm text-slate-600">
                {loading ? "Lade…" : `${stats.total} Händler • ${stats.withGeo} mit Geo • ${stats.flyer} mit FLYER`}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link href="/import">
                <Button>Import</Button>
              </Link>
              <Button onClick={runGeocode} disabled={geocodeBusy} className="bg-slate-900 text-white">
                {geocodeBusy ? "Geocoding läuft…" : "Geocoding für fehlende starten"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Input
                value={filter.q}
                onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                placeholder="Suche (Name, Ort, PLZ, Straße)…"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                className={filter.flyer ? "bg-emerald-600 text-white" : ""}
                onClick={() => setFilter((f) => ({ ...f, flyer: !f.flyer }))}
              >
                FLYER
              </Button>
              <Button
                className={filter.others ? "bg-slate-700 text-white" : ""}
                onClick={() => setFilter((f) => ({ ...f, others: !f.others }))}
              >
                Andere
              </Button>
              <Badge>{filtered.length} Treffer</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="h-[70vh] sm:h-[72vh]">
          <GoogleMapClient dealers={filtered} />
        </div>
      </div>
    </div>
  );
}
