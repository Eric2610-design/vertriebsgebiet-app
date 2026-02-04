"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";
import type { DealerDraft, ManufacturerKey } from "@/lib/types";
import { normText, splitFlyerCustomer } from "@/lib/normalize";

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
  return null;
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
      for (const f of files) {
        const buf = await f.file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as any[];
        const cols = rows.length ? Object.keys(rows[0]) : [];
        const manu = detectManufacturer(rows, cols);
        if (!manu) continue;
        all.push(...rowsToDrafts(manu, rows));
      }
      setDrafts(all);
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
                const fs = Array.from(e.target.files ?? []).map((file) => ({ id: uuidv4(), file }));
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
