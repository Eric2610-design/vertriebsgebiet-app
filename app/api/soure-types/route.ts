import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function supa() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: "", ...options });
      },
    },
  });
}

async function requireMember(supabase: any, workspaceId: string, userId: string) {
  const m = await supabase
    .schema("app")
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return !!m.data;
}

export async function GET(req: Request) {
  const supabase = supa();

  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr || !u?.user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId_missing" }, { status: 400 });
  }

  const okMember = await requireMember(supabase, workspaceId, u.user.id);
  if (!okMember) {
    return NextResponse.json({ ok: false, error: "no_access" }, { status: 403 });
  }

  const st = await supabase
    .schema("app")
    .from("source_types")
    .select("id, code, display_name, is_enabled, deleted_at, created_at")
    .is("deleted_at", null)
    .order("display_name", { ascending: true });

  if (st.error) {
    return NextResponse.json({ ok: false, error: st.error }, { status: 500 });
  }

  const sourceTypes = st.data ?? [];
  const ids = sourceTypes.map((x: any) => x.id);

  // Stats: records pro source_type
  const rec = ids.length
    ? await supabase
        .schema("app")
        .from("source_records")
        .select("source_type_id")
        .eq("workspace_id", workspaceId)
        .in("source_type_id", ids)
    : { data: [] as any[], error: null as any };

  if ((rec as any).error) {
    return NextResponse.json({ ok: false, error: (rec as any).error }, { status: 500 });
  }

  const recCount: Record<string, number> = {};
  ((rec as any).data ?? []).forEach((r: any) => {
    recCount[r.source_type_id] = (recCount[r.source_type_id] ?? 0) + 1;
  });

  // Stats: dealers pro source_type (distinct)
  // Wir lösen das über source_links + source_records mapping
  const sr = ids.length
    ? await supabase
        .schema("app")
        .from("source_records")
        .select("id, source_type_id")
        .eq("workspace_id", workspaceId)
        .in("source_type_id", ids)
    : { data: [] as any[], error: null as any };

  if ((sr as any).error) {
    return NextResponse.json({ ok: false, error: (sr as any).error }, { status: 500 });
  }

  const srMap = new Map<string, string>();
  ((sr as any).data ?? []).forEach((x: any) => srMap.set(x.id, x.source_type_id));

  const sl = (srMap.size > 0)
    ? await supabase
        .schema("app")
        .from("source_links")
        .select("dealer_id, source_record_id")
    : { data: [] as any[], error: null as any };

  if ((sl as any).error) {
    return NextResponse.json({ ok: false, error: (sl as any).error }, { status: 500 });
  }

  const dealerSets: Record<string, Set<string>> = {};
  ((sl as any).data ?? []).forEach((l: any) => {
    const stid = srMap.get(l.source_record_id);
    if (!stid) return;
    if (!dealerSets[stid]) dealerSets[stid] = new Set();
    dealerSets[stid].add(l.dealer_id);
  });

  const out = sourceTypes.map((x: any) => ({
    ...x,
    stats: {
      records: recCount[x.id] ?? 0,
      dealers: dealerSets[x.id]?.size ?? 0,
    },
  }));

  return NextResponse.json({ ok: true, source_types: out });
}

export async function POST(req: Request) {
  const supabase = supa();

  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr || !u?.user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const workspaceId = (body?.workspaceId ?? "").toString();
  const displayName = (body?.display_name ?? "").toString().trim();
  const codeRaw = (body?.code ?? "").toString().trim();

  if (!workspaceId || !displayName) {
    return NextResponse.json({ ok: false, error: "workspaceId/display_name_missing" }, { status: 400 });
  }

  const okMember = await requireMember(supabase, workspaceId, u.user.id);
  if (!okMember) {
    return NextResponse.json({ ok: false, error: "no_access" }, { status: 403 });
  }

  const code =
    codeRaw ||
    displayName
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const ins = await supabase
    .schema("app")
    .from("source_types")
    .insert({ code, display_name: displayName, is_enabled: true })
    .select("id, code, display_name, is_enabled, deleted_at, created_at")
    .single();

  if (ins.error) {
    return NextResponse.json({ ok: false, error: ins.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source_type: ins.data });
}
