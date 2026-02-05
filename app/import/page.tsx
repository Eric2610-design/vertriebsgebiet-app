"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";
import type { DealerDraft, ManufacturerKey, Profile, Territory } from "@/lib/types";
import { normText, splitFlyerCustomer } from "@/lib/normalize";

const makeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

type ImportFile = { id: string; file: File };
type Group = { key: string; items: DealerDraft[] };

type FlyerKind = "invoice" | "order";
type FlyerDataset = {
  kind: FlyerKind;
  fileName: string;
  cols: string[];
  rows: any[];
  selected: Record<string, boolean>;
};

function normHeader(h: string) {
  return String(h ?? "")
    .replace(/\s+/g, " ")
    .replace(/\u00ad/g, "")
    // Avoid String.prototype.replaceAll for older browsers.
    .replace(/\n/g, " ")
    .trim()
    .toLowerCase();
}

function detectFlyerKind(cols: string[]): FlyerKind | null {
  const n = cols.map(normHeader);
  const has = (rx: RegExp) => n.some((c) => rx.test(c));
  // invoices
  if (has(/rechnungs.*nummer/) && has(/rechnungs.*datum/) && has(/rechnungs.*position/)) return "invoice";
  // orders
  if (has(/auftragsnummer/) && has(/auftragsposition/) && has(/auftragsdatum/)) return "order";
  return null;
}

function detectManufacturer(rows: any[], cols: string[]): ManufacturerKey | null {
  const c = cols.map((x) => String(x));
  const has = (k: string) => c.includes(k);
  if (has("Experience Store") && has("Profil URL")) return "riese_mueller";
  if (has("Bundesland") && has("Händler_URL")) return "bergamont";
  if (has("MglNr") && has("Homepage")) return "zeg";
  if (has("Kunden Straße/Hausnummer") && has("Kunden PLZ")) return "flyer";
  if (has("Adressart") && has("PLZ-Code")) return "bico";
  if (has("opening_hours") && has("dealer_url")) return "kalkhoff";
  // AD/PLZ mapping
  if (has("PLZ_Bereiche") && (has("E-Mail") || has("E-Mail-Adresse"))) return "__ad_mapping__" as any;
  return null;
}

function parsePlzRanges(raw: string): Array<{ from: number; to: number }> {
  const s = String(raw ?? "")
    // Avoid String.prototype.replaceAll for older browsers.
    .replace(/,/g, ";")
    .replace(/\|/g, ";")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return [];
  const parts = s.split(";").map((x) => x.trim()).filter(Boolean);
  const out: Array<{ from: number; to: number }> = [];
  for (const p of parts) {
    const m = p.match(/(\d{1,2})\s*(?:-\s*(\d{1,2}))?/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const from = Math.max(0, Math.min(99, Math.min(a, b)));
    const to = Math.max(0, Math.min(99, Math.max(a, b)));
    out.push({ from, to });
  }
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

    for (const c of countries) {
      for (const rg of ranges.length ? ranges : isAdmin ? [{ from: 0, to: 99 }] : []) {
        territories.push({ id: "", profile_email: email, country: c, plz2_from: rg.from, plz2_to: rg.to });
      }
    }
  }

  const pmap = new Map<string, Profile>();
  for (const p of profiles) pmap.set(p.email, p);
  const uniqueProfiles = [...pmap.values()];

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
          zip: pick(r, ["Kunden PLZ", "Kunden Postleitzahl"]),
          city: pick(r, ["Kunden Ort"]),
          country: pick(r, ["Kunden Land"]) ?? "DE",
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
  return [normText(d.name), normText(d.street ?? ""), normText(d.zip ?? ""), normText(d.city ?? "")].join("|");
}

function asNum(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\./g, "").replace(",", ".").replace(/[^0-9\-\.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickByHeader(row: any, rx: RegExp) {
  const entries = Object.entries(row ?? {});
  for (const [k, v] of entries) {
    if (rx.test(normHeader(k))) return v;
  }
  return null;
}

function mapInvoiceRow(row: any, selected: Record<string, boolean>) {
  // only include selected fields into raw, but always keep matching keys
  const raw: any = {};
  for (const [k, v] of Object.entries(row)) if (selected[k]) raw[k] = v;

  const customer_name = String(pickByHeader(row, /^kunden$/) ?? "").trim();
  return {
    customer_name,
    street: String(pickByHeader(row, /kunden straße\/hausnummer/) ?? "").trim() || null,
    zip: String(pickByHeader(row, /kunden (postleitzahl|plz)/) ?? "").trim() || null,
    city: String(pickByHeader(row, /kunden ort/) ?? "").trim() || null,
    country: String(pickByHeader(row, /kunden land/) ?? "").trim() || null,
    rep_name: String(pickByHeader(row, /außendienstmitarbeiter/) ?? "").trim() || null,
    invoice_date: String(pickByHeader(row, /rechnungs.*datum/) ?? "").trim() || null,
    invoice_no: String(pickByHeader(row, /rechnungs.*nummer/) ?? "").trim() || "",
    invoice_pos: String(pickByHeader(row, /rechnungs.*position$/) ?? "").trim() || null,
    follow_no: String(pickByHeader(row, /folgenummer/) ?? "").trim() || null,
    article: String(pickByHeader(row, /^artikel$/) ?? "").trim() || null,
    brand: String(pickByHeader(row, /^marke$/) ?? "").trim() || null,
    series: String(pickByHeader(row, /serie\/familie/) ?? "").trim() || null,
    color: String(pickByHeader(row, /^farbe$/) ?? "").trim() || null,
    model_year: String(pickByHeader(row, /modelljahr/) ?? "").trim() || null,
    id_number: String(pickByHeader(row, /id-nummer/) ?? "").trim() || null,
    qty: asNum(pickByHeader(row, /menge in liefereinheit/) ?? null),
    amount_eur: asNum(pickByHeader(row, /vk-rechnung\)/) ?? pickByHeader(row, /vk rechnungsbetrag/) ?? null),
    discount_eur: asNum(pickByHeader(row, /rabattbetrag/) ?? null),
    raw,
  };
}

function mapOrderRow(row: any, selected: Record<string, boolean>) {
  const raw: any = {};
  for (const [k, v] of Object.entries(row)) if (selected[k]) raw[k] = v;

  return {
    customer_name: String(pickByHeader(row, /^kunden$/) ?? "").trim(),
    street: String(pickByHeader(row, /kunden straße\/hausnummer/) ?? "").trim() || null,
    zip: String(pickByHeader(row, /kunden postleitzahl/) ?? "").trim() || null,
    city: String(pickByHeader(row, /kunden ort/) ?? "").trim() || null,
    country: String(pickByHeader(row, /kunden land/) ?? "").trim() || null,
    rep_name: String(pickByHeader(row, /außendienstmitarbeiter/) ?? "").trim() || null,
    order_no: String(pickByHeader(row, /auftragsnummer/) ?? "").trim() || "",
    order_pos: String(pickByHeader(row, /auftragsposition$/) ?? "").trim() || null,
    follow_no: String(pickByHeader(row, /auftragsfolgenummer/) ?? "").trim() || null,
    order_date: String(pickByHeader(row, /auftragsdatum/) ?? "").trim() || null,
    status: String(pickByHeader(row, /^status$/) ?? "").trim() || null,
    planned_delivery: String(pickByHeader(row, /geplanter liefertermin/) ?? "").trim() || null,
    delivery_date: String(pickByHeader(row, /liefertermin$/) ?? "").trim() || null,
    requested_delivery: String(pickByHeader(row, /gewünschter liefertermin/) ?? "").trim() || null,
    article: String(pickByHeader(row, /^artikel$/) ?? "").trim() || null,
    brand: String(pickByHeader(row, /^marke$/) ?? "").trim() || null,
    model: String(pickByHeader(row, /^modell$/) ?? "").trim() || null,
    series: String(pickByHeader(row, /serie\/familie/) ?? "").trim() || null,
    model_year: String(pickByHeader(row, /modelljahr/) ?? "").trim() || null,
    color: String(pickByHeader(row, /^farbe$/) ?? "").trim() || null,
    id_number: String(pickByHeader(row, /id-nummer/) ?? "").trim() || null,
    open_qty: asNum(pickByHeader(row, /auftragsbestand in auftragseinheit/) ?? null),
    open_value_eur: asNum(pickByHeader(row, /auftragsbestand in eur/) ?? null),
    raw,
  };
}

function CheckboxList({ cols, selected, setSelected }: { cols: string[]; selected: Record<string, boolean>; setSelected: (s: Record<string, boolean>) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-600">
        <span>{cols.length} Felder</span>
        <div className="flex gap-2">
          <button
            className="underline"
            onClick={() => {
              const n: Record<string, boolean> = {};
              cols.forEach((c) => (n[c] = true));
              setSelected(n);
            }}
            type="button"
          >
            alle
          </button>
          <button
            className="underline"
            onClick={() => {
              const n: Record<string, boolean> = {};
              cols.forEach((c) => (n[c] = false));
              setSelected(n);
            }}
            type="button"
          >
            keine
          </button>
        </div>
      </div>
      <div className="max-h-56 overflow-auto border-t border-slate-100 p-2">
        {cols.map((c) => (
          <label key={c} className="flex items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              checked={!!selected[c]}
              onChange={(e) => setSelected({ ...selected, [c]: e.target.checked })}
            />
            <span className="truncate">{c}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PreviewTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="p-3 text-sm text-slate-500">Keine Daten</div>;
  const cols = Object.keys(rows[0] ?? {});
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            {cols.map((c) => (
              <th key={c} className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((r, idx) => (
            <tr key={idx} className="odd:bg-white even:bg-slate-50">
              {cols.map((c) => (
                <td key={c} className="border-b border-slate-100 px-2 py-1 text-slate-700">
                  {String((r as any)[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImportPage() {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [drafts, setDrafts] = useState<DealerDraft[]>([]);
  const [repData, setRepData] = useState<{ profiles: Profile[]; territories: Territory[] } | null>(null);

  const [flyerInvoice, setFlyerInvoice] = useState<FlyerDataset | null>(null);
  const [flyerOrder, setFlyerOrder] = useState<FlyerDataset | null>(null);
  const [flyerSaved, setFlyerSaved] = useState<{ invoices: number; orders: number } | null>(null);

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ dealers: number; links: number } | null>(null);

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, DealerDraft[]>();
    for (const d of drafts) {
      const k = groupKey(d);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return [...m.entries()]
      .map(([key, items]) => ({ key, items }))
      .filter((g) => g.items.length > 1)
      .sort((a, b) => b.items.length - a.items.length);
  }, [drafts]);

  const merged = useMemo(() => {
    const byKey = new Map<string, DealerDraft[]>();
    for (const d of drafts) {
      const k = groupKey(d);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(d);
    }
    const out: any[] = [];
    for (const items of byKey.values()) {
      const base = { ...items[0] } as any;
      const fill = (field: keyof DealerDraft) => {
        for (const it of items) {
          const v = (it as any)[field];
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
      (base as any).__items = items;
      out.push(base);
    }
    return out as (DealerDraft & { __items: DealerDraft[] })[];
  }, [drafts]);

  async function parseAll() {
    setBusy(true);
    setSaved(null);
    setFlyerSaved(null);
    try {
      const all: DealerDraft[] = [];
      let reps: { profiles: Profile[]; territories: Territory[] } | null = null;
      let inv: FlyerDataset | null = null;
      let ord: FlyerDataset | null = null;

      for (const f of files) {
        const buf = await f.file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as any[];
        const cols = rows.length ? Object.keys(rows[0]) : [];

        const flyerKind = detectFlyerKind(cols);
        if (flyerKind === "invoice") {
          const selected: Record<string, boolean> = {};
          cols.forEach((c) => (selected[c] = true));
          inv = { kind: "invoice", fileName: f.file.name, cols, rows, selected };
          continue;
        }
        if (flyerKind === "order") {
          const selected: Record<string, boolean> = {};
          cols.forEach((c) => (selected[c] = true));
          ord = { kind: "order", fileName: f.file.name, cols, rows, selected };
          continue;
        }

        const manu = detectManufacturer(rows, cols);
        if (!manu) continue;
        if ((manu as any) === "__ad_mapping__") {
          reps = rowsToRepData(rows);
          continue;
        }
        all.push(...rowsToDrafts(manu as any, rows));
      }

      setDrafts(all);
      setRepData(reps);
      setFlyerInvoice(inv);
      setFlyerOrder(ord);
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

      if (repData && (repData.profiles.length || repData.territories.length)) {
        const r = await fetch("/api/reps/upsert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profiles: repData.profiles.map((p) => ({ display_name: p.display_name, email: p.email, role: p.role })),
            territories: repData.territories.map((t) => ({
              profile_email: t.profile_email,
              country: t.country,
              plz2_from: t.plz2_from,
              plz2_to: t.plz2_to,
            })),
          }),
        });
        const rj = await r.json();
        if (!r.ok) throw new Error(rj?.error ?? "AD/Gebiete konnten nicht gespeichert werden");
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveFlyer() {
    if (!flyerInvoice && !flyerOrder) return;
    setBusy(true);
    setFlyerSaved(null);
    try {
      const invRows = flyerInvoice
        ? flyerInvoice.rows
            .filter((r) => String(pickByHeader(r, /rechnungs.*nummer/) ?? "").trim() !== "")
            .map((r) => mapInvoiceRow(r, flyerInvoice.selected))
            .filter((r) => r.customer_name && r.invoice_no)
        : [];
      const ordRows = flyerOrder
        ? flyerOrder.rows
            .filter((r) => String(pickByHeader(r, /auftragsnummer/) ?? "").trim() !== "")
            .map((r) => mapOrderRow(r, flyerOrder.selected))
            .filter((r) => r.customer_name && r.order_no)
        : [];

      // Chunk upload to avoid payload limits
      const chunk = async (kind: "invoices" | "orders", rows: any[]) => {
        const size = 400;
        let done = 0;
        for (let i = 0; i < rows.length; i += size) {
          const slice = rows.slice(i, i + size);
          const res = await fetch("/api/import/flyer", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              invoices: kind === "invoices" ? { rows: slice, file_name: flyerInvoice?.fileName } : { rows: [] },
              orders: kind === "orders" ? { rows: slice, file_name: flyerOrder?.fileName } : { rows: [] },
            }),
          });
          const js = await res.json();
          if (!res.ok) throw new Error(js?.error ?? "Flyer-Import fehlgeschlagen");
          done += slice.length;
        }
        return done;
      };

      const insInv = invRows.length ? await chunk("invoices", invRows) : 0;
      const insOrd = ordRows.length ? await chunk("orders", ordRows) : 0;
      setFlyerSaved({ invoices: insInv, orders: insOrd });
    } finally {
      setBusy(false);
    }
  }

  const invPreview = useMemo(() => {
    if (!flyerInvoice) return [];
    const mapped = flyerInvoice.rows.slice(0, 25).map((r) => mapInvoiceRow(r, flyerInvoice.selected));
    return mapped.map((m) => ({
      customer_name: m.customer_name,
      invoice_no: m.invoice_no,
      invoice_date: m.invoice_date,
      article: m.article,
      qty: m.qty,
      amount_eur: m.amount_eur,
    }));
  }, [flyerInvoice]);

  const ordPreview = useMemo(() => {
    if (!flyerOrder) return [];
    const mapped = flyerOrder.rows.slice(0, 25).map((r) => mapOrderRow(r, flyerOrder.selected));
    return mapped.map((m) => ({
      customer_name: m.customer_name,
      order_no: m.order_no,
      order_date: m.order_date,
      planned_delivery: m.planned_delivery,
      open_qty: m.open_qty,
      open_value_eur: m.open_value_eur,
    }));
  }, [flyerOrder]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Import</h1>
          <p className="text-sm text-slate-600">Dateien auswählen, Vorschau prüfen, speichern.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/map"><Button variant="secondary">Zur Karte</Button></Link>
          <Link href="/ad"><Button variant="secondary">Außendienst</Button></Link>
          <Link href="/"><Button variant="secondary">Home</Button></Link>
          <Link href="/cleanup"><Button>Cleanup</Button></Link>
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
              <Button
                variant="secondary"
                onClick={() => {
                  setFiles([]);
                  setDrafts([]);
                  setRepData(null);
                  setFlyerInvoice(null);
                  setFlyerOrder(null);
                  setSaved(null);
                  setFlyerSaved(null);
                }}
              >
                Zurücksetzen
              </Button>
            </div>

            <div className="text-sm text-slate-600">
              Händlerzeilen: <span className="font-medium text-slate-900">{drafts.length}</span>
            </div>

            {(flyerInvoice || flyerOrder) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Flyer-Dateien erkannt:{" "}
                {flyerInvoice && <b>Rechnungsposten</b>} {flyerInvoice && flyerOrder ? " + " : ""}{" "}
                {flyerOrder && <b>Auftragsbestand</b>}
              </div>
            )}

            {repData && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                AD/Gebiete erkannt: <b>{repData.profiles.length}</b> Profile, <b>{repData.territories.length}</b> PLZ-Bereiche
              </div>
            )}

            {saved && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Händler gespeichert: {saved.dealers} (Zuordnungen: {saved.links})
              </div>
            )}

            {flyerSaved && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Flyer gespeichert: {flyerSaved.invoices} Rechnungsposten, {flyerSaved.orders} Auftragspositionen
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">2) Dubletten-Vorschläge</CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-600">
              Gruppen (Name+Adresse): <span className="font-medium text-slate-900">{groups.length}</span>
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
                        {[...new Set(g.items.map((i) => i.source))].map((s) => (
                          <Badge key={s} tone={s === "flyer" ? "blue" : "slate"}>
                            {s}
                          </Badge>
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
              Tipp: Erst Händler speichern, dann Flyer-Rechnungen/Aufträge importieren (damit dealer_id sauber matcht).
            </p>
          </CardContent>
        </Card>
      </div>

      {(flyerInvoice || flyerOrder) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {flyerInvoice && (
            <Card>
              <CardHeader className="text-sm font-semibold">3a) Flyer Rechnungsposten – Felder auswählen</CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-slate-600">Datei: <b>{flyerInvoice.fileName}</b> · Zeilen: <b>{flyerInvoice.rows.length}</b></div>
                <CheckboxList cols={flyerInvoice.cols} selected={flyerInvoice.selected} setSelected={(s) => setFlyerInvoice({ ...flyerInvoice, selected: s })} />
                <div className="text-sm font-medium">Vorschau (gemappt)</div>
                <PreviewTable rows={invPreview} />
              </CardContent>
            </Card>
          )}

          {flyerOrder && (
            <Card>
              <CardHeader className="text-sm font-semibold">3b) Flyer Auftragsbestand – Felder auswählen</CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-slate-600">Datei: <b>{flyerOrder.fileName}</b> · Zeilen: <b>{flyerOrder.rows.length}</b></div>
                <CheckboxList cols={flyerOrder.cols} selected={flyerOrder.selected} setSelected={(s) => setFlyerOrder({ ...flyerOrder, selected: s })} />
                <div className="text-sm font-medium">Vorschau (gemappt)</div>
                <PreviewTable rows={ordPreview} />
              </CardContent>
            </Card>
          )}

          <Card className="md:col-span-2">
            <CardHeader className="text-sm font-semibold">4) Flyer Daten speichern</CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                Speichert ausgewählte Felder (als raw) + Kernfelder in <code>flyer_invoice_lines</code> / <code>flyer_order_lines</code>.
              </div>
              <Button onClick={saveFlyer} disabled={busy}>
                {busy ? "Speichere..." : "Flyer Rechnungen/Aufträge speichern"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
