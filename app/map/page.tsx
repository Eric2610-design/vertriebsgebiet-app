import dynamic from "next/dynamic";
import { supabaseService } from "@/lib/supabase";

const MapClient = dynamic(() => import("./MapClient"), { ssr: false });

export default async function MapPage() {
  const sb = supabaseService();

  // load all dealers (paginate)
  let from = 0;
  const step = 2000;
  const dealers: any[] = [];
  while (true) {
    const { data, error } = await sb
      .from("dealers")
      .select("id,name,street,zip,city,country,lat,lng")
      .order("name", { ascending: true })
      .range(from, from + step - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    dealers.push(...data);
    if (data.length < step) break;
    from += step;
  }

  // flyer ids
  let ffrom = 0;
  const flyerIds: string[] = [];
  while (true) {
    const { data } = await sb
      .from("dealer_manufacturers")
      .select("dealer_id")
      .eq("manufacturer_key", "flyer")
      .range(ffrom, ffrom + step - 1);
    if (!data || data.length === 0) break;
    flyerIds.push(...data.map((r:any)=>r.dealer_id));
    if (data.length < step) break;
    ffrom += step;
  }

  return (
    <main className="container">
      {/* @ts-expect-error Async Server Component */}
      <MapClient dealers={dealers} flyerIds={new Set(flyerIds)} />
    </main>
  );
}
