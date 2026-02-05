"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";
import type { DealerDraft, ManufacturerKey, Profile, Territory } from "@/lib/types";
import { normText, splitFlyerCustomer } from "@/lib/normalize";

const makeId = () => {
  // Prefer browser-native UUID (works on iPhone/iPad modern browsers)
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};


type ImportFile = { id: string; file: File };

type Group = { key: string; items: DealerDraft[] };

function detectManufacturer(rows: any[], cols: string[]): ManufacturerKey | null {
  const c = cols.map((x) => String(x));
  const has = (k: string) => c.includes(k);
  if (has("Experience Store") && has("Profil URL")) return "riese_mueller";
  if (has("Bundesland") && has("Händler_URL")) return "bergamont";
  if (has("MglNr") && has("Homepage")) return "zeg";
  if (has("Kunden Straße/Hausnummer") && has("Kunden PLZ")) return "flyer";
  if (has("Adressart") && has("PLZ-Code")) return "bico";
  if (has("opening_hours") && has("dealer_url")) return "kalkhoff";
  // AD/PLZ mapping (profiles/territories)
  if (has("PLZ_Bereiche") && (has("E-Mail") || has("E-Mail-Adresse"))) return "__ad_mapping__";
  return null;
}

function parsePlzRanges(raw: string): Array<{ from: number; to: number }> {
  const s = String(raw ?? "")
    .replaceAll(",", ";")
    .replaceAll("|", ";")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return [];
  const parts = s.split(";").map((x) => x.trim()).filter(Boolean);
  const out: Array<{ from: number; to: number }> = [];
  for (const p of parts) {
    // match "30-33" or "34"
    const m = p.match(/(\d{1,2})\s*(?:-\s*(\d{1,2}))?/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const from = Math.max(0, Math.min(99, Math.min(a, b)));
    const to = Math.max(0, Math.min(99, Math.max(a, b)));
    out.push({ from, to });
  }
  // de-dup
  const key = (r: any) => `${r.from}-${r.to}`;
  const uniq = new Map<string, any>();
  for (const r of out) uniq.set(key(r), r);
  return [...uniq.values()];
}

function rowsToRepData(rows: any[]): { profiles: Profile[]; territories: Territory[] } {
  const pick = (r: any, keys: string[]) => {
    for (const k of keys) if (r?.[k] != null && String(r[k]).trim() !== "") return String(r[k]).trim();
    return "";
  };
  const profiles: Profile[] = [];
  const territories: Territory[] = [];
  for (const r of rows) {
    const email = pick(r, ["E-Mail", "E-Mail-Adresse"]).toLowerCase();
    const display_name = pick(r, ["Name"]).trim();
    if (!email || !display_name) continue;

    const isAdmin = ["d.heise@flyer.ch", "e.fuhrmann@flyer.ch"].includes(email);
    profiles.push({ id: "", display_name, email, role: isAdmin ? "admin" : "rep" });

    const Gebiet = pick(r, ["Gebiet"]).toUpperCase();
    const rawRanges = pick(r, ["PLZ_Bereiche"]);
    const ranges = parsePlzRanges(rawRanges);
    const countries: string[] = [];
    if (Gebiet.includes("DE")) countries.push("DE");
    if (Gebiet.includes("AT")) countries.push("AT");
    if (!countries.length) countries.push("DE");

    // Special: David "00-99 (DE) + AT"
    if (isAdmin && rawRanges.includes("AT") && !countries.includes("AT")) countries.push("AT");

    for (const c of countries) {
      for (const rg of ranges.length ? ranges : isAdmin ? [{ from: 0, to: 99 }] : []) {
        territories.push({ id: "", profile_email: email, country: c, plz2_from: rg.from, plz2_to: rg.to });
      }
    }
  }

  // de-dup profiles by email
  const pmap = new Map<string, Profile>();
  for (const p of profiles) pmap.set(p.email, p);
  const uniqueProfiles = [...pmap.values()];

  // de-dup territories
  const tkey = (t: Territory) => `${t.profile_email}|${t.country}|${t.plz2_from}|${t.plz2_to}`;
  const tmap = new Map<string, Territory>();
  for (const t of territories) tmap.set(tkey(t), t);
  const uniqueTerritories = [...tmap.values()];

  return { profiles: uniqueProfiles, territories: uniqueTerritories };
}

function rowsToDrafts(manu: ManufacturerKey, rows: any[]): DealerDraft[] {
  const pick = (r: any, keys: string[]) => {
    for (const k of keys) if (r?.[k] != null && String(r[k]).trim() !== "") return String(r[k]).trim();
    return null;
  };

  return rows
    .map((r) => {
      if (manu === "riese_mueller") {
        return {
          source: manu,
          name: pick(r, ["Name"]) ?? "",
          street: pick(r, ["Straße"]),
          zip: pick(r, ["PLZ"]),
          city: pick(r, ["Ort"]),
          country: "DE",
          phone: pick(r, ["Telefon"]),
          source_url: pick(r, ["Profil URL"]),
        } satisfies DealerDraft;
      }
      if (manu === "bergamont") {
        return {
          source: manu,
          name: pick(r, ["Händler"]) ?? "",
          street: pick(r, ["Straße"]),
          zip: pick(r, ["PLZ"]),
          city: pick(r, ["Ort"]),
          country: "DE",
          source_url: pick(r, ["Händler_URL"]),
        } satisfies DealerDraft;
      }
      if (manu === "zeg") {
        const n1 = pick(r, ["Name1"]) ?? "";
        const n2 = pick(r, ["Name2"]);
        return {
          source: manu,
          external_id: pick(r, ["MglNr"]),
          name: (n2 ? `${n1} ${n2}` : n1).trim(),
          street: pick(r, ["Strasse"]),
          zip: pick(r, ["PLZ"]),
          city: pick(r, ["Ort"]),
          country: pick(r, ["LKZ"]) ?? "DE",
          phone: pick(r, ["Telefon"]),
          email: pick(r, ["E-Mail"]),
          website: pick(r, ["Homepage"]),
        } satisfies DealerDraft;
      }
      if (manu === "flyer") {
        const raw = pick(r, ["Kunden"]) ?? "";
        const s = splitFlyerCustomer(raw);
        return {
          source: manu,
          external_id: s.externalId ?? null,
          name: s.name,
          street: pick(r, ["Kunden Straße/Hausnummer"]),
          zip: pick(r, ["Kunden PLZ"]),
          city: pick(r, ["Kunden Ort"]),
          country: "DE",
        } satisfies DealerDraft;
      }
      if (manu === "bico") {
        const n = [pick(r, ["Name"]), pick(r, ["Name2"])].filter(Boolean).join(" ");
        return {
          source: manu,
          external_id: pick(r, ["bi"]),
          name: n.trim(),
          street: pick(r, ["Adresse"]),
          zip: pick(r, ["PLZ-Code"]),
          city: pick(r, ["Ort"]),
          country: pick(r, ["Länder-/Regionscode"]) ?? "DE",
          phone: pick(r, ["Telefonnr."]),
          website: pick(r, ["Homepage"]),
        } satisfies DealerDraft;
      }
      // kalkhoff
      return {
        source: manu,
        name: pick(r, ["name"]) ?? "",
        street: pick(r, ["street"]),
        zip: pick(r, ["zip"]),
        city: pick(r, ["city"]),
        country: pick(r, ["country"]) ?? "DE",
        phone: pick(r, ["phone"]),
        email: pick(r, ["email"]),
        website: pick(r, ["website"]),
        opening_hours: pick(r, ["opening_hours"]),
        source_url: pick(r, ["dealer_url"]),
      } satisfies DealerDraft;
    })
    .filter((d) => d.name.trim().length > 0);
}

function groupKey(d: DealerDraft) {
  return [
    normText(d.name),
    normText(d.street ?? ""),
    normText(d.zip ?? ""),
    normText(d.city ?? "")
  ].join("|");
}

export default function ImportPage() {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [drafts, setDrafts] = useState<DealerDraft[]>([]);
  const [repData, setRepData] = useState<{ profiles: Profile[]; territories: Territory[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ dealers: number; links: number } | null>(null);

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, DealerDraft[]>();
    for (const d of drafts) {
      const k = groupKey(d);
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    const arr = [...m.entries()].map(([key, items]) => ({ key, items }));
    return arr.filter(g => g.items.length > 1).sort((a,b)=>b.items.length-a.items.length);
  }, [drafts]);

  const merged = useMemo(() => {
    // Auto-merge by groupKey; union manufacturer associations; keep first non-empty field
    const m = new Map<string, DealerDraft[]>();
    for (const d of drafts) {
      const k = groupKey(d);
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    const out: any[] = [];
    for (const [k, items] of m) {
      const base = { ...items[0] };
      const fill = (field: keyof DealerDraft) => {
        for (const it of items) {
          const v = it[field];
          if (v != null && String(v).trim() !== "") return v;
        }
        return (base as any)[field] ?? null;
      };
      base.street = fill("street");
      base.zip = fill("zip");
      base.city = fill("city");
      base.country = fill("country");
      base.phone = fill("phone");
      base.email = fill("email");
      base.website = fill("website");
      base.opening_hours = fill("opening_hours");
      base.source_url = fill("source_url");
      base.external_id = fill("external_id");
      // store all sources in a pseudo field via symbol? we send as list later
      (base as any).__sources = items.map(i=>i.source);
      (base as any).__items = items;
      out.push(base);
    }
    return out as (DealerDraft & {__items: DealerDraft[]})[];
  }, [drafts]);

  async function parseAll() {
    setBusy(true);
    setSaved(null);
    try {
      const all: DealerDraft[] = [];
      let reps: { profiles: Profile[]; territories: Territory[] } | null = null;
      for (const f of files) {
        const buf = await f.file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as any[];
        const cols = rows.length ? Object.keys(rows[0]) : [];
        const manu = detectManufacturer(rows, cols);
        if (!manu) continue;
        if (manu === "__ad_mapping__") {
          reps = rowsToRepData(rows);
          continue;
        }
        all.push(...rowsToDrafts(manu as any, rows));
      }
      setDrafts(all);
      setRepData(reps);
    } finally {
      setBusy(false);
    }
  }

  async function saveMerged() {
    setBusy(true);
    setSaved(null);
    try {
      const payload = merged.map((m) => ({
        dealer: {
          name: m.name,
          street: m.street ?? null,
          zip: m.zip ?? null,
          city: m.city ?? null,
          country: m.country ?? null,
          phone: m.phone ?? null,
          email: m.email ?? null,
          website: m.website ?? null,
          opening_hours: m.opening_hours ?? null,
        },
        sources: [...new Set((m as any).__items.map((i: DealerDraft) => ({
          source: i.source,
          external_id: i.external_id ?? null,
          source_url: i.source_url ?? null,
        })))],
      }));
      const res = await fetch("/api/import/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Import fehlgeschlagen");
      setSaved({ dealers: js.dealers ?? 0, links: js.links ?? 0 });

      // Also upsert reps/territories if present
      if (repData && (repData.profiles.length || repData.territories.length)) {
        const r = await fetch("/api/reps/upsert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profiles: repData.profiles.map(p => ({ display_name: p.display_name, email: p.email, role: p.role })), territories: repData.territories.map(t => ({ profile_email: t.profile_email, country: t.country, plz2_from: t.plz2_from, plz2_to: t.plz2_to })) }),
        });
        const rj = await r.json();
        if (!r.ok) throw new Error(rj?.error ?? "AD/Gebiete konnten nicht gespeichert werden");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Import</h1>
          <p className="text-sm text-slate-600">Dateien auswählen, Dubletten prüfen, speichern.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/map"><Button variant="secondary">Zur Karte</Button></Link>
          <Link href="/"><Button variant="secondary">Home</Button></Link>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="text-sm font-semibold">1) Dateien auswählen</CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="file"
              multiple
              accept=".xlsx,.xls"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []).map((file) => ({ id: makeId(), file }));
                setFiles(fs);
              }}
            />
            <div className="flex gap-2">
              <Button onClick={parseAll} disabled={busy || files.length === 0}>
                {busy ? "Lese..." : "Dateien einlesen"}
              </Button>
              <Button variant="secondary" onClick={() => { setFiles([]); setDrafts([]); setSaved(null); }}>
                Zurücksetzen
              </Button>
            </div>

            <div className="text-sm text-slate-600">
              Eingelesen: <span className="font-medium text-slate-900">{drafts.length}</span> Zeilen
            </div>

            {repData && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                AD/Gebiete erkannt: <b>{repData.profiles.length}</b> Profile, <b>{repData.territories.length}</b> PLZ-Bereiche (wird beim Speichern mit übernommen)
              </div>
            )}

            {saved && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Gespeichert: {saved.dealers} Händler, {saved.links} Hersteller-Zuordnungen
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">2) Dubletten-Vorschläge</CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-600">
              Gruppen mit gleichen (Name+Adresse): <span className="font-medium text-slate-900">{groups.length}</span>
            </div>
            <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white">
              {groups.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">Keine offensichtlichen Dubletten gefunden.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {groups.slice(0, 30).map((g) => (
                    <li key={g.key} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">{g.items[0].name}</div>
                        <Badge tone="amber">{g.items.length}x</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {g.items[0].street}, {g.items[0].zip} {g.items[0].city}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {[...new Set(g.items.map(i=>i.source))].map(s => (
                          <Badge key={s} tone={s==="flyer" ? "blue" : "slate"}>{s}</Badge>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button onClick={saveMerged} disabled={busy || drafts.length === 0}>
              {busy ? "Speichere..." : "Gemergte Händler speichern"}
            </Button>
            <p className="text-xs text-slate-500">
              Aktuell: Auto-Merge bei identischem Schlüssel. Manuelle Merge-UI (ähnliche, nicht identische) ist als nächster Schritt vorbereitet.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
