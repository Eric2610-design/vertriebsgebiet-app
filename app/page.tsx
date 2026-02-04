import Link from "next/link";
import MapClient from "@/components/MapClient";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createSupabaseServer();

  // Nur Händler mit Geo laden
  const { data: dealers, error } = await supabase
    .from("dealers")
    .select("id,name,street,zipcode,city,country,lat,lng,source")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .limit(20000);

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Händlerkarte</h1>
        <p style={{ color: "crimson" }}>
          Fehler beim Laden aus Supabase: {error.message}
        </p>
        <p>
          <Link href="/upload">→ Upload</Link> ·{" "}
          <Link href="/admin/dealers">→ Dublettenkontrolle</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <h1 style={{ margin: 0 }}>Händlerkarte</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/admin/dealers">→ Dublettenkontrolle</Link>
          <Link href="/upload">→ Upload</Link>
        </nav>
      </div>

      <div style={{ marginTop: 16 }}>
        <MapClient dealers={dealers ?? []} />
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        Hinweis: OpenStreetMap ist rate-limited. Bei sehr vielen Händlern ggf.
        clustern/später optimieren.
      </div>
    </main>
  );
}
