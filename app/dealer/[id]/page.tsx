import { supabaseService } from "@/lib/supabase";
import DealerClient from "./DealerClient";

export default async function DealerPage({ params }: { params: { id: string } }) {
  const sb = supabaseService();
  const { data: dealer } = await sb.from("dealers").select("*").eq("id", params.id).maybeSingle();
  const { data: mans } = await sb
    .from("dealer_manufacturers")
    .select("manufacturer_key, manufacturers(name)")
    .eq("dealer_id", params.id);

  const { data: allMans } = await sb.from("manufacturers").select("*").order("name");
  const { data: contacts } = await sb.from("dealer_contacts").select("*").eq("dealer_id", params.id).order("created_at");
  const { data: visits } = await sb.from("visits").select("*").eq("dealer_id", params.id).order("visited_at", { ascending: false });

  const { data: inv } = await sb.from("flyer_invoice_lines").select("*").eq("dealer_id", params.id).limit(50);
  const { data: ord } = await sb.from("flyer_order_lines").select("*").eq("dealer_id", params.id).limit(50);

  return (
    <main className="container">
      {/* @ts-expect-error Async */}
      <DealerClient
        dealer={dealer}
        manufacturers={mans ?? []}
        allManufacturers={allMans ?? []}
        contacts={contacts ?? []}
        visits={visits ?? []}
        invoices={inv ?? []}
        orders={ord ?? []}
      />
    </main>
  );
}
