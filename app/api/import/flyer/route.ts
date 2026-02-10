import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { normText } from "@/lib/normalize";
import { ok, bad } from "@/app/api/_util";

// Accept already-mapped minimal rows (client handles field selection + mapping).
const InvoiceLine = z.object({
  customer_name: z.string().min(1),
  street: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),

  rep_name: z.string().nullable().optional(),

  invoice_date: z.string().nullable().optional(),
  invoice_no: z.string().min(1),
  invoice_pos: z.string().nullable().optional(),
  follow_no: z.string().nullable().optional(),

  article: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  series: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  model_year: z.string().nullable().optional(),
  id_number: z.string().nullable().optional(),

  qty: z.number().nullable().optional(),
  amount_eur: z.number().nullable().optional(),
  discount_eur: z.number().nullable().optional(),

  raw: z.any().optional(),
});

const OrderLine = z.object({
  customer_name: z.string().min(1),
  street: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),

  rep_name: z.string().nullable().optional(),

  order_no: z.string().min(1),
  order_pos: z.string().nullable().optional(),
  follow_no: z.string().nullable().optional(),
  order_date: z.string().nullable().optional(),

  status: z.string().nullable().optional(),
  planned_delivery: z.string().nullable().optional(),
  delivery_date: z.string().nullable().optional(),
  requested_delivery: z.string().nullable().optional(),

  article: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  series: z.string().nullable().optional(),
  model_year: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  id_number: z.string().nullable().optional(),

  open_qty: z.number().nullable().optional(),
  open_value_eur: z.number().nullable().optional(),

  raw: z.any().optional(),
});

const Body = z.object({
  invoices: z.object({
    rows: z.array(InvoiceLine).default([]),
    file_name: z.string().optional(),
  }).default({ rows: [] }),
  orders: z.object({
    rows: z.array(OrderLine).default([]),
    file_name: z.string().optional(),
  }).default({ rows: [] }),
});

function makeDealerKey(name: string, street: string | null | undefined, zip: string | null | undefined, city: string | null | undefined) {
  return [normText(name), normText(street ?? ""), (zip ?? "").trim(), normText(city ?? "")].join("|");
}

async function mapDealerIds(supabase: any, keys: Array<{ key: string; name: string; street: string | null; zip: string | null; city: string | null }>) {
  const unique = new Map<string, any>();
  for (const k of keys) unique.set(k.key, k);
  const list = [...unique.values()];
  if (!list.length) return new Map<string, string>();

  // Fetch all matching dealers in one go (best effort).
  // We do a broad select and then map client-style (since supabase doesn't support composite IN nicely).
  // For typical datasets this is fine; if it grows, we can switch to RPC.
  const { data, error } = await supabase
    .from("dealers")
    .select("id,norm_name,norm_street,zip,norm_city");

  if (error) throw new Error(error.message);

  const dealerMap = new Map<string, string>();
  for (const d of data ?? []) {
    const k = [d.norm_name, d.norm_street, d.zip ?? "", d.norm_city].join("|");
    dealerMap.set(k, d.id);
  }
  return dealerMap;
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseService();
    const body = Body.parse(await req.json());

    const invRows = body.invoices.rows ?? [];
    const ordRows = body.orders.rows ?? [];

    // Build dealer key list
    const keys: Array<{ key: string; name: string; street: string | null; zip: string | null; city: string | null }> = [];
    for (const r of invRows) keys.push({ key: makeDealerKey(r.customer_name, r.street, r.zip, r.city), name: r.customer_name, street: r.street ?? null, zip: r.zip ?? null, city: r.city ?? null });
    for (const r of ordRows) keys.push({ key: makeDealerKey(r.customer_name, r.street, r.zip, r.city), name: r.customer_name, street: r.street ?? null, zip: r.zip ?? null, city: r.city ?? null });

    const dealerIds = await mapDealerIds(supabase, keys);

    const invoiceToInsert = invRows.map((r) => ({
      dealer_id: dealerIds.get(makeDealerKey(r.customer_name, r.street, r.zip, r.city)) ?? null,
      customer_name: r.customer_name,
      street: r.street ?? null,
      zip: r.zip ?? null,
      city: r.city ?? null,
      country: r.country ?? null,
      rep_name: r.rep_name ?? null,
      invoice_date: r.invoice_date ?? null,
      invoice_no: r.invoice_no,
      invoice_pos: r.invoice_pos ?? null,
      follow_no: r.follow_no ?? null,
      article: r.article ?? null,
      brand: r.brand ?? null,
      series: r.series ?? null,
      color: r.color ?? null,
      model_year: r.model_year ?? null,
      id_number: r.id_number ?? null,
      qty: r.qty ?? null,
      amount_eur: r.amount_eur ?? null,
      discount_eur: r.discount_eur ?? null,
      raw: r.raw ?? null,
    }));

    const orderToInsert = ordRows.map((r) => ({
      dealer_id: dealerIds.get(makeDealerKey(r.customer_name, r.street, r.zip, r.city)) ?? null,
      customer_name: r.customer_name,
      street: r.street ?? null,
      zip: r.zip ?? null,
      city: r.city ?? null,
      country: r.country ?? null,
      rep_name: r.rep_name ?? null,
      order_no: r.order_no,
      order_pos: r.order_pos ?? null,
      follow_no: r.follow_no ?? null,
      order_date: r.order_date ?? null,
      status: r.status ?? null,
      planned_delivery: r.planned_delivery ?? null,
      delivery_date: r.delivery_date ?? null,
      requested_delivery: r.requested_delivery ?? null,
      article: r.article ?? null,
      brand: r.brand ?? null,
      model: r.model ?? null,
      series: r.series ?? null,
      model_year: r.model_year ?? null,
      color: r.color ?? null,
      id_number: r.id_number ?? null,
      open_qty: r.open_qty ?? null,
      open_value_eur: r.open_value_eur ?? null,
      raw: r.raw ?? null,
    }));

    let insertedInvoices = 0;
    let insertedOrders = 0;

    if (invoiceToInsert.length) {
      const { error } = await supabase
        .from("flyer_invoice_lines")
        .insert(invoiceToInsert, { defaultToNull: true });
      if (error) return bad(error.message, 500);
      insertedInvoices = invoiceToInsert.length;
    }

    if (orderToInsert.length) {
      const { error } = await supabase
        .from("flyer_order_lines")
        .insert(orderToInsert, { defaultToNull: true });
      if (error) return bad(error.message, 500);
      insertedOrders = orderToInsert.length;
    }

    return ok({ invoices: insertedInvoices, orders: insertedOrders });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}
