"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Input, Select } from "@/components/ui";
import type { Dealer, Territory } from "@/lib/types";

type Market = "DE_AT" | "CH";

type ApiStockItem = {
  id: string;
  sku: string;
  name: string | null;
  model_year: number | null;
  series: string | null;
  model: string | null;
  color: string | null;
  frame_size: string | null;
  frame_type: string | null;
  battery: string | null;
  motor_type: string | null;
  motor_brand: string | null;
  motor: "BOSCH" | "PANASONIC" | "OTHER";
  price_kind: "STANDARD" | "FIXPREIS" | "SONDERPREIS";
  vk: number;
  currency: "EUR" | "CHF";
  avail_now: number;
  avail_total: number;
  status: "SOFORT" | "ZUKUNFT";
  eta_month: string | null;
  max_order_qty: number;
  availability_plan: any;
};

type ThresholdRule = {
  market: Market;
  motor: "BOSCH" | "PANASONIC";
  requiresFixprice: boolean;
  minQty: number;
  factor: number;
  active: boolean;
};

type BootstrapResponse = {
  market: Market;
  run: { id: string; created_at: string } | null;
  items: ApiStockItem[];
  thresholds: { version: number; rules: ThresholdRule[] };
};

type DealerListItem = Dealer & {
  customer_no?: string | null;
};

function MarketBadge({ market }: { market: Market }) {
  if (market === "CH") return <Badge tone="blue">CH</Badge>;
  return <Badge tone="emerald">DE/AT</Badge>;
}

const plz2 = (zip?: string | null) => {
  if (!zip) return null;
  const m = String(zip).match(/(\d{2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
};

function normStr(v: any) {
  return String(v ?? "").trim();
}

function uniqSorted(values: Array<string | null | undefined>) {
  const s = new Set<string>();
  for (const v of values) {
    const x = normStr(v);
    if (x) s.add(x);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, "de"));
}

function bucketAvail(n: number) {
  const x = Math.floor(Number(n) || 0);
  if (x <= 0) return "0";
  if (x <= 10) return String(x);
  if (x <= 49) return "10+";
  if (x <= 100) return "49+";
  return "100+";
}

function normalizeHex(h: string) {
  const s = normStr(h);
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (m) return `#${m[1].toLowerCase()}`;
  return "";
}

function colorToHex(name: string) {
  const n = normStr(name).toLowerCase();
  if (!n) return "#cbd5e1";
  if (n.includes("frosty sage") || (n.includes("frosty") && n.includes("sage"))) return "#dfeae1";
  if (n.includes("curcuma") || n.includes("kurkuma")) return "#d4b000";
  const has = (arr: string[]) => arr.some((k) => n.includes(k));
  if (has(["schwarz", "black", "anthrazit", "anthracite", "carbon"])) return "#111827";
  if (has(["weiß", "weiss", "white", "ivory", "elfenbein", "creme", "cream"])) return "#f9fafb";
  if (has(["grau", "gray", "grey", "silber", "silver", "steel", "stone"])) return "#9ca3af";
  if (has(["rot", "red", "ruby", "crimson"])) return "#ef4444";
  if (has(["blau", "blue", "navy", "enzian", "azure", "cobalt", "indigo"])) return "#2563eb";
  if (has(["grün", "gruen", "green", "olive", "sage", "mint"])) return "#16a34a";
  if (has(["gelb", "yellow", "gold", "sun", "amber"])) return "#f59e0b";
  if (has(["orange", "coral"])) return "#f97316";
  if (has(["pink", "rose", "magenta"])) return "#ec4899";
  if (has(["violett", "purple", "lila", "lavender"])) return "#7c3aed";
  if (has(["braun", "brown", "copper", "bronze"])) return "#92400e";
  return "#cbd5e1";
}

function etaLabel(ym: string | null, market: Market) {
  if (!ym) return null;
  const m = String(ym).match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return ym;
  const dt = new Date(Date.UTC(y, mo - 1, 1));
  const locale = "de-DE";
  const month = dt.toLocaleString(locale, { month: "short" });
  return `${month} ${y}`;
}

function priceKindLabel(kind: ApiStockItem["price_kind"]) {
  if (kind === "FIXPREIS") return "Fixpreis";
  if (kind === "SONDERPREIS") return "Sonderpreis";
  return "Standard";
}

function getAutosaveKey(market: Market) {
  return market === "CH" ? "FLYER_ORDER_AUTOSAVE_V1_CH" : "FLYER_ORDER_AUTOSAVE_V1_DE";
}

export default function OrdertoolPage() {
  // market
  const [market, setMarket] = useState<Market>("DE_AT");

  // dealers
  const [dealers, setDealers] = useState<DealerListItem[]>([]);
  const [dealerQuery, setDealerQuery] = useState("");
  const [selectedDealerId, setSelectedDealerId] = useState("");
  const [customerNo, setCustomerNo] = useState("");
  const [dealerLoading, setDealerLoading] = useState(false);
  const [dealerError, setDealerError] = useState<string | null>(null);
  const [dealerRestricted, setDealerRestricted] = useState(false);

  // stock
  const [stock, setStock] = useState<BootstrapResponse | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  // filters
  const [q, setQ] = useState("");
  const [fFamily, setFFamily] = useState("");
  const [fModel, setFModel] = useState("");
  const [fMotor, setFMotor] = useState("");
  const [fMotorType, setFMotorType] = useState("");
  const [fFrameType, setFFrameType] = useState("");
  const [fFrameSize, setFFrameSize] = useState("");
  const [fColor, setFColor] = useState("");
  const [fBattery, setFBattery] = useState("");
  const [fPriceKind, setFPriceKind] = useState("");
  const [fStatus, setFStatus] = useState("");

  // cart (sku -> qty)
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [cartUpdatedAt, setCartUpdatedAt] = useState<number | null>(null);

  // Load dealers
  useEffect(() => {
    let cancelled = false;
    const loadDealers = async () => {
      try {
        setDealerLoading(true);
        setDealerError(null);
        const [authRes, repsRes, dealerRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/reps/list", { cache: "no-store" }),
          fetch("/api/dealers/list", { cache: "no-store" }),
        ]);
        const auth = await authRes.json();
        const reps = await repsRes.json();
        const dealerData = await dealerRes.json();
        if (cancelled) return;

        const role = String(auth?.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "superadmin" || auth?.is_admin;
        const email = String(auth?.email || "").trim().toLowerCase();
        const territories = (reps?.territories ?? []) as Territory[];
        const items = (dealerData?.items ?? []) as DealerListItem[];

        if (!isAdmin && email) {
          const userTerritories = territories.filter((t) => String(t.profile_email || "").toLowerCase() === email);
          if (userTerritories.length > 0) {
            const filtered = items.filter((dealer) => {
              const zipGroup = plz2(dealer.zip);
              if (zipGroup == null) return false;
              return userTerritories.some((t) => {
                if (t.country && dealer.country && t.country !== dealer.country) return false;
                return zipGroup >= t.plz2_from && zipGroup <= t.plz2_to;
              });
            });
            setDealers(filtered);
            setDealerRestricted(true);
          } else {
            setDealers([]);
            setDealerRestricted(true);
          }
        } else {
          setDealers(items);
          setDealerRestricted(false);
        }
      } catch (e: any) {
        if (!cancelled) setDealerError(e?.message ?? "Händler konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setDealerLoading(false);
      }
    };
    loadDealers();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load stock (visible items are filtered server-side in /api/ordertool/bootstrap)
  useEffect(() => {
    let cancelled = false;
    const loadStock = async () => {
      try {
        setStockLoading(true);
        setStockError(null);
        const url = `/api/ordertool/bootstrap?market=${market === "CH" ? "CH" : "DE_AT"}&limit=5000`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Stock-Load fehlgeschlagen (${res.status})`);
        const json = (await res.json()) as BootstrapResponse;
        if (cancelled) return;
        setStock(json);
      } catch (e: any) {
        if (!cancelled) setStockError(e?.message ?? "Lagerbestand konnte nicht geladen werden.");
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    };
    loadStock();
    return () => {
      cancelled = true;
    };
  }, [market]);

  // Restore dealer + customer
  useEffect(() => {
    try {
      const raw = localStorage.getItem("FLYER_ORDERTOOL_PREFILL_V1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.dealerId) setSelectedDealerId(String(parsed.dealerId));
      if (parsed?.customerNo) setCustomerNo(String(parsed.customerNo));
    } catch {
      // ignore
    }
  }, []);

  // Restore cart per market
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getAutosaveKey(market));
      if (!raw) {
        setCart({});
        setCartUpdatedAt(null);
        return;
      }
      const parsed = JSON.parse(raw);
      const c = parsed?.cart ?? {};
      const next: Record<string, number> = {};
      for (const [sku, entry] of Object.entries(c)) {
        const q = Number((entry as any)?.q ?? entry);
        if (Number.isFinite(q) && q > 0) next[String(sku)] = Math.floor(q);
      }
      setCart(next);
      const ts = Number(parsed?.updatedAt ?? null);
      setCartUpdatedAt(Number.isFinite(ts) ? ts : null);
    } catch {
      setCart({});
      setCartUpdatedAt(null);
    }
  }, [market]);

  // Persist dealer + cart
  useEffect(() => {
    try {
      const dealer = dealers.find((d) => d.id === selectedDealerId);
      const payload = {
        dealerId: dealer?.id ?? "",
        dealerName: dealer?.name ?? "",
        customerNo: customerNo.trim(),
      };
      localStorage.setItem("FLYER_ORDERTOOL_PREFILL_V1", JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [dealers, selectedDealerId, customerNo]);

  useEffect(() => {
    try {
      const updatedAt = Date.now();
      localStorage.setItem(
        getAutosaveKey(market),
        JSON.stringify({ version: 1, market, updatedAt, cart: Object.fromEntries(Object.entries(cart).map(([k, q]) => [k, { q }])) })
      );
      setCartUpdatedAt(updatedAt);
    } catch {
      // ignore
    }
  }, [cart, market]);

  const filteredDealers = useMemo(() => {
    const query = dealerQuery.trim().toLowerCase();
    if (!query) return dealers;
    return dealers.filter((dealer) => dealer.name?.toLowerCase().includes(query));
  }, [dealers, dealerQuery]);

  const selectedDealer = useMemo(() => {
    return dealers.find((dealer) => dealer.id === selectedDealerId) ?? null;
  }, [dealers, selectedDealerId]);

  const items = stock?.items ?? [];

  const filterOptions = useMemo(() => {
    return {
      families: uniqSorted(items.map((i) => i.series)),
      models: uniqSorted(items.map((i) => i.model ?? i.name)),
      motors: uniqSorted(items.map((i) => i.motor_brand)),
      motorTypes: uniqSorted(items.map((i) => i.motor_type)),
      frameTypes: uniqSorted(items.map((i) => i.frame_type)),
      frameSizes: uniqSorted(items.map((i) => i.frame_size)),
      colors: uniqSorted(items.map((i) => i.color)),
      batteries: uniqSorted(items.map((i) => i.battery)),
      priceKinds: uniqSorted(items.map((i) => priceKindLabel(i.price_kind))),
      statuses: uniqSorted(items.map((i) => i.status)),
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((it) => {
      if (query) {
        const hay = [it.sku, it.name, it.series, it.model, it.motor_brand, it.motor_type, it.frame_type, it.color, it.frame_size, it.battery]
          .map((x) => normStr(x).toLowerCase())
          .join(" ");
        if (!hay.includes(query)) return false;
      }
      if (fFamily && normStr(it.series) !== fFamily) return false;
      if (fModel && normStr(it.model ?? it.name) !== fModel) return false;
      if (fMotor && normStr(it.motor_brand) !== fMotor) return false;
      if (fMotorType && normStr(it.motor_type) !== fMotorType) return false;
      if (fFrameType && normStr(it.frame_type) !== fFrameType) return false;
      if (fFrameSize && normStr(it.frame_size) !== fFrameSize) return false;
      if (fColor && normStr(it.color) !== fColor) return false;
      if (fBattery && normStr(it.battery) !== fBattery) return false;
      if (fStatus && normStr(it.status) !== fStatus) return false;
      if (fPriceKind && priceKindLabel(it.price_kind) !== fPriceKind) return false;
      return true;
    });
  }, [items, q, fFamily, fModel, fMotor, fMotorType, fFrameType, fFrameSize, fColor, fBattery, fStatus, fPriceKind]);

  type Tile = {
    key: string;
    family: string;
    title: string;
    motor_brand: string;
    motor_type: string;
    frame_type: string;
    battery: string;
    price_kind: ApiStockItem["price_kind"];
    vk: number;
    currency: ApiStockItem["currency"];
    rows: ApiStockItem[];
  };

  const tiles = useMemo(() => {
    const map = new Map<string, Tile>();
    for (const it of filteredItems) {
      const family = normStr(it.series) || "—";
      const title = normStr(it.model) || normStr(it.name) || it.sku;
      const key = [family, title, normStr(it.motor_brand), normStr(it.motor_type), normStr(it.frame_type), normStr(it.battery), it.price_kind, String(it.vk)].join("|");
      const existing = map.get(key);
      if (existing) {
        existing.rows.push(it);
      } else {
        map.set(key, {
          key,
          family,
          title,
          motor_brand: normStr(it.motor_brand),
          motor_type: normStr(it.motor_type),
          frame_type: normStr(it.frame_type),
          battery: normStr(it.battery),
          price_kind: it.price_kind,
          vk: Number(it.vk || 0),
          currency: it.currency,
          rows: [it],
        });
      }
    }
    const out = Array.from(map.values());
    for (const t of out) {
      t.rows.sort((a, b) => {
        const c = normStr(a.color).localeCompare(normStr(b.color), "de");
        if (c !== 0) return c;
        return normStr(a.frame_size).localeCompare(normStr(b.frame_size), "de");
      });
    }
    out.sort((a, b) => {
      const f = a.family.localeCompare(b.family, "de");
      if (f !== 0) return f;
      return a.title.localeCompare(b.title, "de");
    });
    return out;
  }, [filteredItems]);

  const cartLines = useMemo(() => {
    const bySku = new Map<string, ApiStockItem>();
    for (const it of items) bySku.set(it.sku, it);
    const lines: Array<{ sku: string; q: number; item: ApiStockItem }> = [];
    for (const [sku, q0] of Object.entries(cart)) {
      const q = Math.floor(Number(q0) || 0);
      if (q <= 0) continue;
      const item = bySku.get(sku);
      if (!item) continue;
      lines.push({ sku, q, item });
    }
    lines.sort((a, b) => {
      const s = normStr(a.item.model ?? a.item.name).localeCompare(normStr(b.item.model ?? b.item.name), "de");
      if (s !== 0) return s;
      return a.sku.localeCompare(b.sku, "de");
    });
    return lines;
  }, [cart, items]);

  const cartTotals = useMemo(() => {
    const rules = (stock?.thresholds?.rules ?? []).filter((r) => r && r.active !== false);

    const qtyByMotor = {
      BOSCH: 0,
      PANASONIC: 0,
    } as Record<"BOSCH" | "PANASONIC", number>;
    for (const l of cartLines) {
      if (l.item.motor === "BOSCH") qtyByMotor.BOSCH += l.q;
      if (l.item.motor === "PANASONIC") qtyByMotor.PANASONIC += l.q;
    }

    const pickFactor = (motor: "BOSCH" | "PANASONIC", isFixprice: boolean) => {
      const total = qtyByMotor[motor];
      const candidates = rules
        .filter((r) => r.market === market && r.motor === motor && r.requiresFixprice === isFixprice)
        .sort((a, b) => a.minQty - b.minQty);
      let best: ThresholdRule | null = null;
      for (const r of candidates) {
        if (total >= (Number(r.minQty) || 0)) best = r;
      }
      return best?.factor ?? null;
    };

    let totalQty = 0;
    let boschFix = 0;
    let panaFix = 0;
    let value = 0;
    for (const l of cartLines) {
      totalQty += l.q;
      const isFix = l.item.price_kind === "FIXPREIS" || l.item.price_kind === "SONDERPREIS";
      if (l.item.motor === "BOSCH" && isFix) boschFix += l.q;
      if (l.item.motor === "PANASONIC" && isFix) panaFix += l.q;

      // EK-Schätzung: VK / Faktor (wenn Regel vorhanden), sonst VK.
      const factor = (l.item.motor === "BOSCH" || l.item.motor === "PANASONIC")
        ? pickFactor(l.item.motor, isFix)
        : null;
      const unit = factor && Number.isFinite(factor) && factor > 0 ? l.item.vk / factor : l.item.vk;
      value += unit * l.q;
    }
    return { totalQty, boschFix, panaFix, value };
  }, [cartLines, stock?.thresholds?.rules, market]);

  const onQtyChange = (sku: string, qty: number) => {
    setCart((prev) => {
      const next = { ...prev };
      const q = Math.max(0, Math.floor(Number(qty) || 0));
      if (q <= 0) delete next[sku];
      else next[sku] = q;
      return next;
    });
  };

  const clearCart = () => setCart({});

  const exportCsv = () => {
    const dealerName = selectedDealer?.name ?? "";
    const now = new Date();
    const dt = now.toISOString();
    const rows = [
      ["market", market],
      ["dealer", dealerName],
      ["customer_no", customerNo.trim()],
      ["created_at", dt],
      [],
      ["sku", "qty", "model", "color", "size", "vk", "currency", "status", "eta_month"],
      ...cartLines.map((l) => [
        l.sku,
        String(l.q),
        normStr(l.item.model ?? l.item.name),
        normStr(l.item.color),
        normStr(l.item.frame_size),
        String(l.item.vk),
        l.item.currency,
        l.item.status,
        l.item.eta_month ?? "",
      ]),
    ];

    const csv = rows
      .map((r) => r.map((c) => {
        const s = String(c ?? "");
        if (s.includes("\"")) return `"${s.replace(/\"/g, '""')}"`;
        if (s.includes(",") || s.includes("\n") || s.includes("\r")) return `"${s}"`;
        return s;
      }).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeDealer = dealerName ? dealerName.replace(/[^A-Za-z0-9_-]+/g, "_") : "dealer";
    a.download = `flyer_order_${market}_${safeDealer}_${now.toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ordertool</h1>
          <div className="text-sm text-slate-600">
            Sichtbarkeit basiert auf dem neuesten Lagerbestand-Snapshot (serverseitig gefiltert nach <span className="font-semibold">avail_total &gt; 0</span> und passender VK-Währung).
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MarketBadge market={market} />
          <Select value={market} onChange={(e) => setMarket(e.target.value as Market)} className="w-[140px]">
            <option value="DE_AT">🇩🇪 DE / AT</option>
            <option value="CH">🇨🇭 CH</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* LEFT: Bikes */}
        <div className="space-y-4">
          {stockLoading ? (
            <Card>
              <CardContent className="py-10 text-sm text-slate-600">Lade Lagerbestand…</CardContent>
            </Card>
          ) : stockError ? (
            <Card>
              <CardContent className="py-10 text-sm text-rose-600">{stockError}</CardContent>
            </Card>
          ) : tiles.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-sm text-slate-600">Keine passenden Artikel.</CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {tiles.map((t) => (
                <div key={t.key} className="rounded-2xl border border-slate-200 bg-white shadow-soft">
                  <div className="px-5 pt-5">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">{t.family}</div>
                    <div className="mt-1 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{t.title}</div>
                        <div className="mt-1 text-xs text-slate-600">
                          {t.motor_brand ? `${t.motor_brand}` : ""}
                          {t.motor_type ? ` · ${t.motor_type}` : ""}
                          {t.frame_type ? ` · ${t.frame_type}` : ""}
                          {t.battery ? ` · ${t.battery}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge tone={t.price_kind === "FIXPREIS" ? "blue" : t.price_kind === "SONDERPREIS" ? "amber" : "slate"}>
                          {priceKindLabel(t.price_kind)}
                        </Badge>
                        <div className="text-xs font-semibold text-slate-900">
                          {Math.round(t.vk).toLocaleString("de-DE")} {t.currency}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-100 px-5 pb-5 pt-4">
                    <div className="grid grid-cols-[34px_70px_1fr_110px] items-center gap-2 text-xs font-semibold text-slate-500">
                      <div />
                      <div>Größe</div>
                      <div>Verfügbar</div>
                      <div className="text-right">Menge</div>
                    </div>
                    <div className="mt-2 space-y-1">
                      {t.rows.map((r) => {
                        const dot = normalizeHex("") || colorToHex(r.color ?? "");
                        const qty = cart[r.sku] ?? 0;
                        const eta = r.status === "SOFORT" ? "sofort" : etaLabel(r.eta_month, market) ?? "(ohne Datum)";
                        return (
                          <div key={r.id} className="grid grid-cols-[34px_70px_1fr_110px] items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
                            <div className="flex items-center justify-center">
                              <span className="inline-block h-5 w-5 rounded-full border border-slate-200" style={{ background: dot }} />
                            </div>
                            <div className="text-xs font-semibold text-slate-900">{normStr(r.frame_size) || "—"}</div>
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  "inline-flex h-2.5 w-2.5 rounded-full border-2 " +
                                  (r.status === "SOFORT" ? "border-emerald-500 bg-emerald-500" : "border-emerald-500 bg-transparent")
                                }
                              />
                              <span className="text-xs font-semibold text-slate-900">{bucketAvail(r.avail_total)}</span>
                              <span className="text-xs text-slate-500">· {r.status === "SOFORT" ? "SOFORT" : `ZUKUNFT (${eta})`}</span>
                            </div>
                            <div className="flex justify-end">
                              <input
                                className="h-8 w-[90px] rounded-xl border border-slate-200 bg-white px-3 text-right text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-300"
                                type="number"
                                min={0}
                                max={Math.max(0, r.max_order_qty)}
                                value={qty}
                                onChange={(e) => onQtyChange(r.sku, Number(e.target.value))}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Sticky */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {/* Filter */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div className="text-sm font-semibold">Filter</div>
              <Button
                variant="secondary"
                className="h-9 px-3"
                onClick={() => {
                  setQ("");
                  setFFamily("");
                  setFModel("");
                  setFMotor("");
                  setFMotorType("");
                  setFFrameType("");
                  setFFrameSize("");
                  setFColor("");
                  setFBattery("");
                  setFPriceKind("");
                  setFStatus("");
                }}
              >
                Reset
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen (Artikel, Modell, Farbe …)" />
              <div className="grid grid-cols-2 gap-2">
                <Select value={fFamily} onChange={(e) => setFFamily(e.target.value)}>
                  <option value="">Familie: alle</option>
                  {filterOptions.families.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Select value={fModel} onChange={(e) => setFModel(e.target.value)}>
                  <option value="">Modell: alle</option>
                  {filterOptions.models.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Select value={fMotor} onChange={(e) => setFMotor(e.target.value)}>
                  <option value="">Motor: alle</option>
                  {filterOptions.motors.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Select value={fMotorType} onChange={(e) => setFMotorType(e.target.value)}>
                  <option value="">Motortyp: alle</option>
                  {filterOptions.motorTypes.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Select value={fFrameType} onChange={(e) => setFFrameType(e.target.value)}>
                  <option value="">Rahmenform: alle</option>
                  {filterOptions.frameTypes.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Select value={fFrameSize} onChange={(e) => setFFrameSize(e.target.value)}>
                  <option value="">Rahmengröße: alle</option>
                  {filterOptions.frameSizes.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Select value={fColor} onChange={(e) => setFColor(e.target.value)}>
                  <option value="">Farbe: alle</option>
                  {filterOptions.colors.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Select value={fBattery} onChange={(e) => setFBattery(e.target.value)}>
                  <option value="">Akku: alle</option>
                  {filterOptions.batteries.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Select value={fPriceKind} onChange={(e) => setFPriceKind(e.target.value)}>
                  <option value="">Preisart: alle</option>
                  {filterOptions.priceKinds.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                  <option value="">Verfügbarkeit: alle</option>
                  {filterOptions.statuses.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </div>
              <div className="text-xs text-slate-500">
                Treffer: <span className="font-semibold text-slate-700">{filteredItems.length}</span> (Tiles: {tiles.length})
              </div>
            </CardContent>
          </Card>

          {/* Dealer */}
          <Card>
            <CardHeader className="text-sm font-semibold">Händler / Kunde</CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-slate-500">
                {dealerRestricted ? "Es werden nur Händler aus deinem Gebiet angezeigt." : "Admins sehen alle Händler."}
              </div>
              <Input value={dealerQuery} onChange={(e) => setDealerQuery(e.target.value)} placeholder="Händler suchen…" />
              <Select value={selectedDealerId} onChange={(e) => setSelectedDealerId(e.target.value)}>
                <option value="">{dealerLoading ? "Lade Händler…" : "Händler auswählen…"}</option>
                {filteredDealers.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>
                    {dealer.name} · {dealer.zip ?? "—"} {dealer.city ?? ""}
                  </option>
                ))}
              </Select>
              <Input value={customerNo} onChange={(e) => setCustomerNo(e.target.value)} placeholder="Kundennummer (optional)" />
              {dealerError ? <div className="text-xs text-rose-600">{dealerError}</div> : null}
            </CardContent>
          </Card>

          {/* Cart */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div className="text-sm font-semibold">Warenkorb</div>
              <div className="text-xs text-slate-500">{cartUpdatedAt ? `zuletzt ${new Date(cartUpdatedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Gesamt</span>
                  <span className="font-semibold">{cartTotals.totalQty}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Bosch Fixpreis</span>
                  <span className="font-semibold">{cartTotals.boschFix}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Panasonic Fixpreis</span>
                  <span className="font-semibold">{cartTotals.panaFix}</span>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Wert (EK)</span>
                  <span className="font-semibold">{Math.round(cartTotals.value).toLocaleString("de-DE")} {market === "CH" ? "CHF" : "€"}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setCartOpen(true)} disabled={cartLines.length === 0}>
                  Warenkorb anzeigen
                </Button>
                <Button variant="secondary" onClick={clearCart} disabled={cartLines.length === 0}>
                  Leeren
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cart modal */}
      {cartOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div>
                <div className="text-sm font-semibold">Warenkorb</div>
                <div className="text-xs text-slate-500">
                  {selectedDealer ? selectedDealer.name : "—"}{customerNo.trim() ? ` · Kundennr. ${customerNo.trim()}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" className="h-9" onClick={exportCsv} disabled={cartLines.length === 0}>
                  CSV
                </Button>
                <Button variant="secondary" className="h-9" onClick={() => setCartOpen(false)}>
                  Schließen
                </Button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto px-5 py-4">
              {cartLines.length === 0 ? (
                <div className="py-10 text-sm text-slate-600">Warenkorb ist leer.</div>
              ) : (
                <div className="space-y-2">
                  {cartLines.map((l) => (
                    <div key={l.sku} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{normStr(l.item.model ?? l.item.name) || l.sku}</div>
                          <div className="text-xs text-slate-600">
                            {l.sku}
                            {l.item.color ? ` · ${l.item.color}` : ""}
                            {l.item.frame_size ? ` · ${l.item.frame_size}` : ""}
                            {l.item.status === "SOFORT" ? " · SOFORT" : ` · ZUKUNFT ${l.item.eta_month ? `(${l.item.eta_month})` : ""}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            className="h-9 w-[90px] rounded-xl border border-slate-200 bg-white px-3 text-right text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-300"
                            type="number"
                            min={0}
                            max={Math.max(0, l.item.max_order_qty)}
                            value={l.q}
                            onChange={(e) => onQtyChange(l.sku, Number(e.target.value))}
                          />
                          <Button variant="danger" className="h-9" onClick={() => onQtyChange(l.sku, 0)}>
                            Entfernen
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
