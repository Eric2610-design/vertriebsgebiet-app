"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button, Input, Badge } from "@/components/ui";

type D = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  manufacturer_keys: string[];
  invoice_lines: number;
  order_lines: number;
};

type AddrGroup = { key: string; address: string; dealers: D[]; suggested_master_id: string };

type BranchGroup = { base_name: string; dealers: D[]; suggested_parent_id: string };

export default function CleanupPage() {
  const [loading, setLoading] = useState(true);
  const [addrGroups, setAddrGroups] = useState<AddrGroup[]>([]);
  const [branchGroups, setBranchGroups] = useState<BranchGroup[]>([]);
  const [q, setQ] = useState("");

  const [branchParent, setBranchParent] = useState<Record<string, string>>({}); // base_name -> parent_id
const [branchSelected, setBranchSelected] = useState<Record<string, Record<string, boolean>>>({}); // base_name -> {dealerId: bool}
const [branchLabel, setBranchLabel] = useState<Record<string, string>>({}); // base_name -> label
const [mergeMaster, setMergeMaster] = useState<Record<string, string>>({}); // group.key -> master_id
  const [mergeSelected, setMergeSelected] = useState<Record<string, Record<string, boolean>>>({}); // group.key -> {dealerId: bool}

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/duplicates", { cache: "no-store" });
      const js = await res.json();
      setAddrGroups(js.address_duplicates ?? []);
      setBranchGroups(js.branch_suggestions ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredAddr = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return addrGroups;
    return addrGroups.filter((g) =>
      g.dealers.some((d) => (d.name ?? "").toLowerCase().includes(s)) ||
      (g.address ?? "").toLowerCase().includes(s)
    );
  }, [addrGroups, q]);

  const filteredBranch = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return branchGroups;
    return branchGroups.filter((g) =>
      g.dealers.some((d) => (d.name ?? "").toLowerCase().includes(s))
    );
  }, [branchGroups, q]);

  function setSel(groupKey: string, dealerId: string, checked: boolean) {
    setMergeSelected((prev) => {
      const g = { ...(prev[groupKey] ?? {}) };
      g[dealerId] = checked;
      return { ...prev, [groupKey]: g };
    });
  }

  
  function setBranchSel(groupKey: string, dealerId: string, checked: boolean) {
    setBranchSelected((prev) => {
      const g = { ...(prev[groupKey] ?? {}) };
      g[dealerId] = checked;
      return { ...prev, [groupKey]: g };
    });
  }

  async function runBranchGroup(g: BranchGroup) {
    const parent = branchParent[g.base_name] ?? g.suggested_parent_id;
    const picks = branchSelected[g.base_name] ?? {};
    const child_ids = Object.entries(picks).filter(([,v])=>v).map(([k])=>k).filter((id)=>id!==parent);
    if (child_ids.length === 0) return alert("Bitte mindestens eine Filiale auswählen");
    if (!confirm(`Als Filialen speichern?

Hauptfirma: ${g.dealers.find(d=>d.id===parent)?.name ?? parent}
Filialen: ${child_ids.length}`)) return;
    const res = await fetch("/api/branches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parent_id: parent, child_ids, branch_label: branchLabel[g.base_name] ?? null }),
    });
    const js = await res.json();
    if (!res.ok) return alert(js?.error ?? "Speichern fehlgeschlagen");
    await load();
  }

  async function runGroupMerge(group: AddrGroup) {
    const master = mergeMaster[group.key] ?? group.suggested_master_id;
    const picks = mergeSelected[group.key] ?? {};
    const merge_ids = Object.entries(picks)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .filter((x) => x !== master);
    if (merge_ids.length === 0) return alert("Bitte mindestens eine Dublette auswählen");
    if (!confirm(`Zusammenführen?\n\nMaster bleibt: ${group.dealers.find(d=>d.id===master)?.name ?? master}\nDubletten: ${merge_ids.length}\n\nNur möglich, wenn Adresse identisch ist.`)) return;
    const res = await fetch("/api/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ master_id: master, merge_ids, reason: "cleanup_address_duplicates" }),
    });
    const js = await res.json();
    if (!res.ok) return alert(js?.error ?? "Merge fehlgeschlagen");
    await load();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dubletten & Filialen</h1>
          <p className="text-sm text-slate-600">Zusammenführen nur bei exakt gleicher Adresse. Filialen werden nur gruppiert (kein Merge).</p>
        </div>
        <div className="flex gap-2">
          <Link href="/map"><Button variant="secondary">Zur Karte</Button></Link>
          <Button onClick={load} variant="secondary">Neu laden</Button>
        </div>
      </div>

      <div className="mt-4">
        <Input placeholder="Suchen (Name oder Adresse)…" value={q} onChange={(e)=>setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="p-6 text-sm text-slate-600">Lade…</div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="text-sm font-semibold">Adress-Dubletten (merge-fähig)</CardHeader>
            <CardContent className="space-y-4">
              {filteredAddr.length === 0 ? (
                <div className="text-sm text-slate-600">Keine Adress-Dubletten gefunden.</div>
              ) : (
                filteredAddr.slice(0, 80).map((g) => {
                  const master = mergeMaster[g.key] ?? g.suggested_master_id;
                  return (
                    <div key={g.key} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{g.address || "(Adresse fehlt)"}</div>
                          <div className="mt-1 text-xs text-slate-500">{g.dealers.length} Einträge</div>
                        </div>
                        <Button onClick={() => runGroupMerge(g)}>Mergen</Button>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs text-slate-500">Master auswählen</div>
                        <select
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={master}
                          onChange={(e)=>setMergeMaster((p)=>({ ...p, [g.key]: e.target.value }))}
                        >
                          {g.dealers.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-slate-200">
                        {g.dealers.map((d) => (
                          <label key={d.id} className="flex items-start gap-3 px-3 py-2 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={!!(mergeSelected[g.key]?.[d.id])}
                              onChange={(e)=>setSel(g.key, d.id, e.target.checked)}
                              disabled={d.id === master}
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link href={`/dealer/${d.id}`} className="text-sm font-semibold hover:underline">{d.name}</Link>
                                {d.id === master && <Badge tone="blue">Master</Badge>}
                                {(d.manufacturer_keys ?? []).includes("flyer") && <Badge tone="blue">FLYER</Badge>}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{[d.street, `${d.zip ?? ""} ${d.city ?? ""}`].filter(Boolean).join(", ")}</div>
                              <div className="mt-1 text-xs text-slate-500">Aktivität: Aufträge {d.order_lines ?? 0} · Rechnungen {d.invoice_lines ?? 0}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-sm font-semibold">Filial-Vorschläge (kein Merge)</CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-slate-500">
                Diese Vorschläge basieren auf ähnlichem Namen, aber unterschiedlichen Adressen. Hier kannst du direkt festlegen, welche Einträge Filialen einer Hauptfirma sind (kein Merge).
              </div>
              {filteredBranch.length === 0 ? (
                <div className="text-sm text-slate-600">Keine Filial-Vorschläge gefunden.</div>
              ) : (
                filteredBranch.slice(0, 80).map((g) => (
                  <div key={g.base_name} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">Ähnlicher Name</div>
                        <div className="text-xs text-slate-500">{g.dealers.length} Einträge</div>
                      </div>
                      <Badge tone="slate">Vorschlag</Badge>
                    </div>
                    <div className="mt-3">
                      <div className="text-xs text-slate-500">Hauptfirma auswählen</div>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={(branchParent[g.base_name] ?? g.suggested_parent_id)}
                        onChange={(e)=>setBranchParent((p)=>({ ...p, [g.base_name]: e.target.value }))}
                      >
                        {g.dealers.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <div className="mt-2 text-xs text-slate-500">Optionaler Filial-Label (wird bei ausgewählten Filialen gesetzt)</div>
                      <Input
                        className="mt-1"
                        placeholder="z.B. Filiale Innenstadt"
                        value={branchLabel[g.base_name] ?? ""}
                        onChange={(e)=>setBranchLabel((p)=>({ ...p, [g.base_name]: e.target.value }))}
                      />
                      <div className="mt-2">
                        <Button onClick={()=>runBranchGroup(g)} variant="secondary">Als Filialen speichern</Button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {g.dealers.map((d) => (
                        <Link key={d.id} href={`/dealer/${d.id}`} className="rounded-xl border border-slate-200 bg-white p-2 hover:bg-slate-50">
                          <div className="text-sm font-semibold">{d.name}</div>
                          <div className="text-xs text-slate-500">{[d.street, `${d.zip ?? ""} ${d.city ?? ""}`].filter(Boolean).join(", ")}</div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
