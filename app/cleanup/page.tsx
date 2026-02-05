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
  parent_dealer_id?: string | null;
  branch_label?: string | null;
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
  const [nameGroups, setNameGroups] = useState<any[]>([]);
  const [q, setQ] = useState("");

  const [mergeMaster, setMergeMaster] = useState<Record<string, string>>({}); // group.key -> master_id
  const [mergeSelected, setMergeSelected] = useState<Record<string, Record<string, boolean>>>({}); // group.key -> {dealerId: bool}
  const [groupMarked, setGroupMarked] = useState<Record<string, boolean>>({}); // group.key -> bool

  const [nameMaster, setNameMaster] = useState<Record<string, string>>({}); // base_name -> master_id
  const [nameSelected, setNameSelected] = useState<Record<string, Record<string, boolean>>>({}); // base_name -> {dealerId: bool}
  const [hideLinkedBranches, setHideLinkedBranches] = useState(true);
  const [branchSelected, setBranchSelected] = useState<Record<string, Record<string, boolean>>>({}); // base_name -> {dealerId: bool}
  const [branchLabel, setBranchLabel] = useState<Record<string, string>>({}); // base_name -> label


  const [progress, setProgress] = useState<string>("");

  async function normalizeAddresses() {
    if (!confirm("Adressen vereinheitlichen?\n\nDabei werden norm_* und identity_key aktualisiert (bessere Dubletten-Erkennung).")) return;
    setProgress("Normalisiere…");
    try {
      const res = await fetch("/api/dealers/normalize", { method: "POST" });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error ?? "Normalisierung fehlgeschlagen");
      setProgress(`Fertig. Geprüft: ${js.scanned}, aktualisiert: ${js.updated}.`);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Normalisierung fehlgeschlagen");
    } finally {
      setTimeout(() => setProgress(""), 1500);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/duplicates", { cache: "no-store" });
      const js = await res.json();
      setAddrGroups(js.address_duplicates ?? []);
      setBranchGroups(js.branch_suggestions ?? []);
      setNameGroups(js.name_duplicates ?? []);
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
    let groups = branchGroups;

    const pickParentId = (g: BranchGroup): string => {
      const chosen = mergeMaster[g.base_name];
      if (chosen) return chosen;
      if (g.suggested_parent_id) return g.suggested_parent_id;
      const main = g.dealers.find((d) => !d.parent_dealer_id);
      return main?.id ?? (g.dealers?.[0]?.id ?? "");
    };

    if (hideLinkedBranches) {
      groups = groups.filter((g) => {
        const parentId = pickParentId(g);
        // show group only if there is at least one *unlinked* potential branch (excluding parent)
        return g.dealers.some((d) => d.id !== parentId && !d.parent_dealer_id);
      });
    }

    if (!s) return groups;
    return groups.filter((g) => g.dealers.some((d) => (d.name ?? "").toLowerCase().includes(s)));
  }, [branchGroups, q, hideLinkedBranches, mergeMaster]);


  const filteredName = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return nameGroups;
    return nameGroups.filter((g:any) => (g.base_name ?? "").toLowerCase().includes(s) || (g.dealers ?? []).some((d:any)=>String(d.name??"").toLowerCase().includes(s)));
  }, [nameGroups, q]);


  
  function isBranchGroupMarked(base: string) {
    const sel = branchSelected[base] ?? {};
    return Object.values(sel).some(Boolean);
  }

  async function linkMarkedBranchGroups(force = false) {
    const groups = filteredBranch.filter((g) => isBranchGroupMarked(g.base_name));
    if (groups.length === 0) return alert("Keine markierten Filial-Gruppen ausgewählt.");
    if (!confirm(`Markierte Filial-Gruppen verknüpfen?\n\nGruppen: ${groups.length}${force ? "\n\nFORCE: Verknüpfungen werden überschrieben." : ""}`)) return;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const parentId = (mergeMaster[g.base_name] ?? g.suggested_parent_id ?? g.dealers?.[0]?.id) as any;
      setProgress(`Filial-Gruppen ${i + 1}/${groups.length}…`);
      if (force) {
        const ids = g.dealers.filter((d) => d.id !== parentId).map((d) => d.id);
        await linkBranchGroup(g, parentId, ids, { skipConfirm: true });
      } else {
        await linkBranchGroup(g, parentId, undefined, { skipConfirm: true });
      }
    }
    setProgress("");
    await load();
  }

  async function linkAllBranchGroups(force = false) {
    const groups = filteredBranch;
    if (groups.length === 0) return alert("Keine Filial-Vorschläge vorhanden.");
    if (!confirm(`Alle Filial-Gruppen verknüpfen?\n\nGruppen: ${groups.length}${force ? "\n\nFORCE: Verknüpfungen werden überschrieben." : ""}`)) return;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const parentId = (mergeMaster[g.base_name] ?? g.suggested_parent_id ?? g.dealers.find((d)=>!d.parent_dealer_id)?.id ?? g.dealers?.[0]?.id) as any;
      // One-click bulk: link *all* possible branches automatically.
      // - if force=false: only those without parent_dealer_id
      // - if force=true: override existing links
      const ids = g.dealers
        .filter((d) => d.id !== parentId)
        .filter((d) => (force ? true : !d.parent_dealer_id))
        .map((d) => d.id);
      if (ids.length === 0) continue;
      setProgress(`Filial-Gruppen ${i + 1}/${groups.length}…`);
      await linkBranchGroup(g, parentId, ids, { skipConfirm: true });
    }
    setProgress("");
    await load();
  }

  function setSel(groupKey: string, dealerId: string, checked: boolean) {
    setMergeSelected((prev) => {
      const g = { ...(prev[groupKey] ?? {}) };
      g[dealerId] = checked;
      return { ...prev, [groupKey]: g };
    });
  }

  async function runGroupMerge(group: AddrGroup, force = false) {
    const master = mergeMaster[group.key] ?? group.suggested_master_id;
    const picks = mergeSelected[group.key] ?? {};
    const merge_ids = Object.entries(picks)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .filter((x) => x !== master);
    if (merge_ids.length === 0) return alert("Bitte mindestens eine Dublette auswählen");
    if (!confirm(`Zusammenführen?\n\nMaster bleibt: ${group.dealers.find(d=>d.id===master)?.name ?? master}\nDubletten: ${merge_ids.length}\n\n${force ? "FORCE-Merge: ignoriert Land/PLZ/Ort-Checks (Adresse-Gruppe bleibt trotzdem gleich)." : "Nur möglich, wenn Adresse identisch ist."}`)) return;
    const res = await fetch("/api/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ master_id: master, merge_ids, reason: "cleanup_address_duplicates", force }),
    });
    const js = await res.json();
    if (!res.ok) return alert(js?.error ?? "Merge fehlgeschlagen");
    await load();
  }

  
  async function bulkMerge(groups: AddrGroup[], label: string, force = false) {
    if (groups.length === 0) return alert("Keine Gruppen vorhanden");
    if (!confirm(`${label}?\n\nGruppen: ${groups.length}\n\nPro Gruppe werden alle Einträge (außer Master) zusammengeführt.\n${force ? "FORCE-Merge: ignoriert Land/PLZ/Ort-Checks (Adresse-Gruppe bleibt trotzdem gleich)." : "Merge nur, wenn Adresse identisch ist."}`)) return;

    setProgress("Starte Bulk-Merge…");
    let okCount = 0;
    let failCount = 0;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const master = mergeMaster[g.key] ?? g.suggested_master_id;
      const merge_ids = g.dealers.map((d) => d.id).filter((id) => id !== master);
      if (merge_ids.length === 0) continue;

      setProgress(`Merge ${i + 1}/${groups.length}: ${g.address || g.key}`);

      try {
        const res = await fetch("/api/merge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ master_id: master, merge_ids, reason: "cleanup_bulk_address_duplicates", force }),
        });
        const js = await res.json();
        if (!res.ok) {
          failCount++;
          console.warn("Bulk merge failed", g.key, js);
        } else {
          okCount++;
        }
      } catch (e) {
        failCount++;
        console.warn("Bulk merge error", g.key, e);
      }
    }

    setProgress(`Fertig. OK: ${okCount} · Fehler: ${failCount}`);
    await load();
    setTimeout(() => setProgress(""), 2000);
  }

  function toggleGroupMarked(groupKey: string, checked: boolean) {
    setGroupMarked((p) => ({ ...p, [groupKey]: checked }));
  }

  function setBranchSel(groupKey: string, dealerId: string, checked: boolean) {
    setBranchSelected((prev) => {
      const g = { ...(prev[groupKey] ?? {}) };
      g[dealerId] = checked;
      return { ...prev, [groupKey]: g };
    });
  }

  async function linkBranchGroup(
    group: BranchGroup,
    parentId?: string | null,
    explicitBranchIds?: string[],
    opts?: { skipConfirm?: boolean }
  ) {
    const inferredParentId =
      parentId ||
      mergeMaster[group.base_name] ||
      group.suggested_parent_id ||
      group.dealers.find((d) => !d.parent_dealer_id)?.id ||
      group.dealers?.[0]?.id;

    if (!inferredParentId) return alert("Bitte einen Hauptbetrieb auswählen");
    const picks = branchSelected[group.base_name] ?? {};
    const selectedIds = Object.entries(picks).filter(([, v]) => v).map(([k]) => k);
    let branchIds = (explicitBranchIds ?? selectedIds).filter((id) => id !== inferredParentId);

    // Bulk actions ("Alle verknüpfen" / "Markierte verknüpfen") should work without manual selection
    if (branchIds.length === 0 && !explicitBranchIds) {
      branchIds = group.dealers.map((d) => d.id).filter((id) => id !== inferredParentId);
    }
    if (branchIds.length === 0) return alert("Keine Filialen zum Verknüpfen gefunden.");
    const label = (branchLabel[group.base_name] ?? "").trim() || null;

    if (!opts?.skipConfirm) {
      if (!confirm(`Filialen verknüpfen?\n\nHauptbetrieb bleibt: ${group.dealers.find(d=>d.id===inferredParentId)?.name ?? inferredParentId}\nFilialen: ${branchIds.length}`)) return;
    }

    setProgress("Verknüpfe Filialen…");

    for (let i = 0; i < branchIds.length; i++) {
      const id = branchIds[i];
      setProgress(`Filiale ${i + 1}/${branchIds.length}…`);
      const res = await fetch(`/api/dealers/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dealer: {
            name: group.dealers.find(d=>d.id===id)?.name ?? "Unbekannt",
            street: group.dealers.find(d=>d.id===id)?.street ?? null,
            zip: group.dealers.find(d=>d.id===id)?.zip ?? null,
            city: group.dealers.find(d=>d.id===id)?.city ?? null,
            country: group.dealers.find(d=>d.id===id)?.country ?? null,
            parent_dealer_id: inferredParentId,
            branch_label: label,
          },
        }),
      });
      const js = await res.json();
      if (!res.ok) {
        console.warn("Branch link failed", id, js);
        alert(js?.error ?? "Filiale verknüpfen fehlgeschlagen");
        break;
      }
    }

    setProgress("Fertig.");
    await load();
    setTimeout(() => setProgress(""), 1500);
  }


  function setNameSel(groupKey: string, dealerId: string, checked: boolean) {
    setNameSelected((prev) => {
      const g = { ...(prev[groupKey] ?? {}) };
      g[dealerId] = checked;
      return { ...prev, [groupKey]: g };
    });
  }

  function isNameGroupMarked(base: string) {
    const sel = nameSelected[base] ?? {};
    return Object.values(sel).some(Boolean);
  }

  async function bulkForceNameMerge(groups: any[], label: string, onlyMarked: boolean) {
    if (groups.length === 0) return alert("Keine Namens-Dubletten vorhanden");
    const markedCount = groups.filter((g: any) => isNameGroupMarked(String(g.base_name ?? ""))).length;
    if (onlyMarked && markedCount === 0) return alert("Keine markierten Namens-Dubletten ausgewählt");

    if (
      !confirm(
        `${label}?\n\nGruppen: ${onlyMarked ? markedCount : groups.length}\n\nHinweis: Force-Merge ignoriert Adresse/Land/PLZ-Checks.\nBitte nur nutzen, wenn du die Dubletten wirklich zusammenführen willst.`
      )
    )
      return;

    setProgress("Starte Force-Merge…");
    let okCount = 0;
    let failCount = 0;

    for (let i = 0; i < groups.length; i++) {
      const g: any = groups[i];
      const key = String(g.base_name ?? "");
      if (!key) continue;
      if (onlyMarked && !isNameGroupMarked(key)) continue;

      const dealers: any[] = g.dealers ?? [];
      const masterId = nameMaster[key] ?? g.suggested_master_id ?? dealers?.[0]?.id;
      if (!masterId) continue;

      let mergeIds: string[];
      if (onlyMarked) {
        const sel = nameSelected[key] ?? {};
        mergeIds = Object.entries(sel)
          .filter(([, v]) => v)
          .map(([id]) => id)
          .filter((id) => id !== masterId);
      } else {
        mergeIds = dealers.map((d: any) => d.id).filter((id: string) => id !== masterId);
      }

      if (!mergeIds.length) continue;
      setProgress(`Force-Merge ${okCount + failCount + 1}/${onlyMarked ? markedCount : groups.length}…`);

      try {
        const res = await fetch("/api/merge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ master_id: masterId, merge_ids: mergeIds, reason: "cleanup_name_duplicates_bulk", force: true }),
        });
        const js = await res.json();
        if (!res.ok) {
          failCount++;
          console.warn("Bulk force name merge failed", key, js);
        } else {
          okCount++;
        }
      } catch (e) {
        failCount++;
        console.warn("Bulk force name merge error", key, e);
      }
    }

    setProgress(`Fertig. OK: ${okCount} · Fehler: ${failCount}`);
    await load();
    setTimeout(() => setProgress(""), 2000);
  }

  async function runNameMerge(groupKey: string) {
    const masterId = nameMaster[groupKey];
    if (!masterId) return alert("Bitte zuerst einen Master auswählen.");
    const ids = Object.entries(nameSelected[groupKey] ?? {}).filter(([,v])=>v).map(([id])=>id).filter((id)=>id!==masterId);
    if (ids.length === 0) return alert("Bitte mindestens einen Händler zum Mergen auswählen.");
    if (!confirm(`Force-Merge durchführen?

Master: ${masterId}
Mergen: ${ids.length} Händler

Hinweis: Dieser Merge ignoriert Adresse/Land/PLZ-Checks.`)) return;
    const res = await fetch("/api/merge", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ master_id: masterId, merge_ids: ids, reason: "cleanup_name_duplicates", force: true }) });
    const js = await res.json();
    if (!res.ok) return alert(js?.error ?? "Merge fehlgeschlagen");
    await load();
  }


return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dubletten & Filialen</h1>
          <p className="text-sm text-slate-600">Adress-Dubletten werden zusammengeführt. Zusätzlich zeigen wir Namens-Dubletten (manuell/Force-Merge) und Filial-Vorschläge (Verknüpfen, kein Merge).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/map"><Button variant="secondary">Zur Karte</Button></Link>
          <Button onClick={load} variant="secondary">Neu laden</Button>
          <Button onClick={normalizeAddresses} variant="secondary">Adressen vereinheitlichen</Button>
          <Button
            onClick={() => bulkMerge(filteredAddr, "Alle Gruppen sofort mergen")}
            variant="secondary"
            disabled={filteredAddr.length === 0 || loading}
          >
            Alle mergen
          </Button>
          <Button
            onClick={() => bulkMerge(filteredAddr.filter((g)=>groupMarked[g.key]), "Markierte Gruppen sofort mergen")}
            disabled={filteredAddr.filter((g)=>groupMarked[g.key]).length === 0 || loading}
          >
            Markierte mergen
          </Button>

          <Button
            variant="secondary"
            onClick={() => bulkMerge(filteredAddr, "Alle Adress-Dubletten FORCE-mergen", true)}
            disabled={filteredAddr.length === 0 || loading}
          >
            Force alle (Adresse)
          </Button>
          <Button
            variant="secondary"
            onClick={() => bulkMerge(filteredAddr.filter((g)=>groupMarked[g.key]), "Markierte Adress-Dubletten FORCE-mergen", true)}
            disabled={filteredAddr.filter((g)=>groupMarked[g.key]).length === 0 || loading}
          >
            Force markierte (Adresse)
          </Button>

          <Button
            variant="secondary"
            onClick={() => bulkForceNameMerge(filteredName, "Alle Namens-Dubletten force-mergen", false)}
            disabled={filteredName.length === 0 || loading}
          >
            Force alle (Namen)
          </Button>
          <Button
            variant="secondary"
            onClick={() => bulkForceNameMerge(filteredName, "Markierte Namens-Dubletten force-mergen", true)}
            disabled={filteredName.filter((g:any)=>isNameGroupMarked(String(g.base_name ?? ""))).length === 0 || loading}
          >
            Force markierte (Namen)
          </Button>
          {progress ? <Badge tone="slate">{progress}</Badge> : null}
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
                        <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={!!groupMarked[g.key]} onChange={(e)=>toggleGroupMarked(g.key, e.target.checked)} />markieren</label><Button onClick={() => runGroupMerge(g)}>Mergen</Button></div>
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
            <CardHeader className="text-sm font-semibold">Namens-Dubletten (manuell / Force Merge)</CardHeader>
            <CardContent className="space-y-4">
              {filteredName.length === 0 ? (
                <div className="text-sm text-slate-600">Keine Namens-Dubletten gefunden.</div>
              ) : (
                filteredName.slice(0, 200).map((g:any) => {
                  const key = g.base_name as string;
                  const masterId = nameMaster[key] ?? g.suggested_master_id ?? (g.dealers?.[0]?.id ?? "");
                  return (
                    <div key={key} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{key}</div>
                          <div className="text-xs text-slate-500">{g.dealers?.length ?? 0} Treffer</div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-600">Master:</span>
                          <select
                            className="rounded-md border border-slate-200 bg-white px-2 py-1"
                            value={masterId}
                            onChange={(e)=>setNameMaster((s)=>({ ...s, [key]: e.target.value }))}
                          >
                            {(g.dealers ?? []).map((d:any)=>(
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                          <Button variant="secondary" onClick={()=>runNameMerge(key)}>Force-Merge</Button>
                        </div>
                      </div>

                      <div className="mt-2 space-y-2">
                        {(g.dealers ?? []).map((d:any)=>(
                          <label key={d.id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={!!(nameSelected[key]?.[d.id])}
                              onChange={(e)=>setNameSel(key, d.id, e.target.checked)}
                            />
                            <div className="flex-1">
                              <div className="text-sm font-semibold">{d.name}</div>
                              <div className="text-xs text-slate-500">{[d.street, `${d.zip ?? ""} ${d.city ?? ""}`, d.country].filter(Boolean).join(", ")}</div>
                            </div>
                            <Link className="text-xs text-blue-600 hover:underline" href={`/dealer/${d.id}`} target="_blank">öffnen</Link>
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
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">Filial-Vorschläge (kein Merge)</div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={hideLinkedBranches} onChange={(e)=>setHideLinkedBranches(e.target.checked)} />
                  verknüpfte ausblenden
                </label>
                <Button variant="secondary" onClick={() => linkMarkedBranchGroups(false)}>Markierte verknüpfen</Button>
                <Button variant="secondary" onClick={() => linkMarkedBranchGroups(true)}>Force (markierte)</Button>
                <Button onClick={() => linkAllBranchGroups(false)}>Alle verknüpfen</Button>
                <Button variant="secondary" onClick={() => linkAllBranchGroups(true)}>Force (alle)</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-slate-500">
                Diese Vorschläge basieren auf ähnlichem Namen, aber unterschiedlichen Adressen. Du kannst hier Filialen direkt mit einem Hauptbetrieb verknüpfen (ohne Merge).
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
                      <div className="text-xs text-slate-500">Hauptbetrieb auswählen</div>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={mergeMaster[g.base_name] ?? g.suggested_parent_id ?? (g.dealers?.[0]?.id ?? "")}
                        onChange={(e)=>setMergeMaster((p)=>({ ...p, [g.base_name]: e.target.value }))}
                      >
                        {g.dealers.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <div className="mt-2 text-xs text-slate-500">Optionaler Filial-Name/Label (z.B. "Filiale Innenstadt")</div>
                      <Input
                        className="mt-1"
                        value={branchLabel[g.base_name] ?? ""}
                        onChange={(e)=>setBranchLabel((p)=>({ ...p, [g.base_name]: e.target.value }))}
                        placeholder="Label (optional)…"
                      />
                    </div>

                    <div className="mt-3 max-h-56 overflow-auto rounded-xl border border-slate-200">
                      {g.dealers.map((d) => {
                        const parentId = (mergeMaster[g.base_name] ?? g.suggested_parent_id ?? g.dealers?.[0]?.id) as any;
                        return (
                          <label key={d.id} className="flex items-start gap-3 px-3 py-2 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={!!(branchSelected[g.base_name]?.[d.id])}
                              onChange={(e)=>setBranchSel(g.base_name, d.id, e.target.checked)}
                              disabled={d.id === parentId}
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link href={`/dealer/${d.id}`} className="text-sm font-semibold hover:underline">{d.name}</Link>
                                {d.id === parentId && <Badge tone="blue">Hauptbetrieb</Badge>}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{[d.street, `${d.zip ?? ""} ${d.city ?? ""}`].filter(Boolean).join(", ")}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>


                    <div className="mt-3 flex justify-end">
                      <Button onClick={() => linkBranchGroup(g, mergeMaster[g.base_name] ?? g.suggested_parent_id ?? (g.dealers?.[0]?.id ?? null))}>Filialen verknüpfen</Button>
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