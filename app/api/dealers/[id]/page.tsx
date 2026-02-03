import React from "react";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";
import DealerClient from "./DealerClient";

export const dynamic = "force-dynamic";

function pickDealerName(d: any) {
  return d?.name ?? d?.dealer_name ?? d?.display_name ?? d?.canonical_name ?? d?.company ?? "Unbenannter Händler";
}

function pickLocationLabel(l: any) {
  const street = l?.street ?? l?.address ?? null;
  const zip = l?.zipcode ?? l?.zip ?? null;
  const city = l?.city ?? null;
  return [street, [zip, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export default async function DealerPage({ params }: { params: { id: string } }) {
  const supa = createSupabaseServer();
  const { data } = await supa.auth.getUser();
  if (!data.user) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Händler</h2>
        <p>Du bist nicht eingeloggt.</p>
        <a className="btn" href="/login">Login</a>
      </div>
    );
  }

  const dealerId = params.id;

  // Wir nutzen Admin für stabile Reads (und prüfen Zugriff sauber)
  const admin = createSupabaseAdmin();
  const db = admin.schema("app");

  const { data: dealer, error: dErr } = await db.from("dealers").select("*").eq("id", dealerId).maybeSingle();
  if (dErr) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Händler</h2>
        <p style={{ color: "crimson" }}>{dErr.message}</p>
      </div>
    );
  }
  if (!dealer) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Händler</h2>
        <p>Händler nicht gefunden.</p>
        <a className="btn secondary" href="/app/map">Zur Karte</a>
      </div>
    );
  }

  const workspaceId = (dealer as any).workspace_id as string | undefined;
  if (!workspaceId) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Händler</h2>
        <p style={{ color: "crimson" }}>dealer.workspace_id fehlt – kann Zugriff nicht prüfen.</p>
      </div>
    );
  }

  const { data: mem, error: mErr } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (mErr || !mem) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Händler</h2>
        <p style={{ color: "crimson" }}>Kein Zugriff auf Workspace.</p>
        <a className="btn secondary" href="/app/map">Zur Karte</a>
      </div>
    );
  }

  const { data: locations, error: lErr } = await db
    .from("dealer_locations")
    .select("*")
    .eq("dealer_id", dealerId);

  if (lErr) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{pickDealerName(dealer)}</h2>
        <p style={{ color: "crimson" }}>{lErr.message}</p>
      </div>
    );
  }

  const locs = locations ?? [];
  const primary =
    locs.find((x: any) => x?.is_primary === true) ??
    locs.find((x: any) => x?.primary === true) ??
    locs[0] ??
    null;

  // Quellen grob aus möglichen Feldern ableiten
  const sources = Array.from(
    new Set(
      locs
        .map((l: any) => l?.source_type_code ?? l?.source_code ?? l?.source ?? l?.source_type ?? null)
        .filter(Boolean)
        .map((x: any) => String(x))
    )
  );

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>{pickDealerName(dealer)}</h2>
          <small>{primary ? pickLocationLabel(primary) : "Keine Adresse vorhanden"}</small>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="badge green">ID: {dealerId}</span>
            {sources.map((s) => (
              <span key={s} className="badge">{s}</span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <a className="btn secondary" href="/app/map">Zur Karte</a>
          <a className="btn secondary" href="/app">Dashboard</a>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <DealerClient dealer={dealer as any} locations={locs as any} />
      </div>
    </div>
  );
}
