"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { norm } from "@/lib/dealerUtils";

type Dealer = {
  id: number;
  name: string;
  street?: string | null;
  zipcode?: string | null;
  city?: string | null;
  source?: string | null;
  is_master?: boolean | null;
  duplicate_of?: number | null;
  lat?: number | null;
  lng?: number | null;
};

type Group = {
  key: string;
  title: string;
  items: Dealer[];
};

function keyOf(d: Dealer) {
  return `${norm(d.name)}|${norm(d.zipcode)}|${norm(d.city)}`;
}

export default function DuplicateReview() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [onlyUnresolved, setOnlyUnresolved] = useState(true);
  const [msg, setMsg] = useState<string>("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (source.trim()) params.set("source", source.trim());
      params.set("withGeo", "0");
      params.set("limit", "20000");

      const res = await fetch(`/api/dealers/list?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "list failed");
      setDealers(json.dealers ?? []);
    } catch (e: any) {
      setErr(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, source]);

  const groups = useMemo(() => {
    const map = new Map<string, Dealer[]>();
    for (const d of dealers) {
      const k = keyOf(d);
      if (!k || k.startsWith("||")) continue;
      const arr = map.get(k) ?? [];
      arr.push(d);
      map.set(k, arr);
    }

    let g: Group[] = [];
    for (const [k, items] of map.entries()) {
      if (items.length < 2) continue;

      const title = `${items[0]?.name ?? ""} · ${[items[0]?.zipcode, items[0]?.city].filter(Boolean).join(" ")}`.trim();
      g.push({ key: k, title, items: items.slice().sort((a, b) => a.id - b.id) });
    }

    // unresolved filter
    if (onlyUnresolved) {
      g = g.filter((gr) => {
        const masters = gr.items.filter((x) => x.is_master === true && !x.duplicate_of).length;
        const unresolved = masters !== 1; // entweder 0 oder >1
        return unresolved;
      });
    }

    g.sort((a, b) => b.items.length - a.items.length);
    return g;
  }, [dealers, onlyUnresolved]);

  const [selectedMaster, setSelectedMaster] = useState<Record<string, number>>({});

  useEffect(() => {
    // default master selection per group: first is_master==true else first
    const next: Record<string, number> = {};
    for (const gr of groups) {
      const master = gr.items.find((x) => x.is_master === true && !x.duplicate_of) ?? gr.items[0];
      next[gr.key] = master.id;
    }
    setSelectedMaster(next);
  }, [groups]);

  async function mergeGroup(gr: Group) {
    setMsg("");
    const masterId = selectedMaster[gr.key];
    const dupIds = gr.items.map((x) => x.id).filter((id) => id !== masterId);
    if (!masterId || !dupIds.length) return;

    try {
      const res = await fetch("/api/dealers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterId, duplicateIds: dupIds }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "merge failed");
      setMsg(`✅ Merge ok: Master #${masterId} (${dupIds.length} Duplikate)`);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="cardHeader">
          <div>
            <h3 className="cardTitle">Dublettenkontrolle</h3>
            <p className="cardSub">Gruppierung: normalisierter Name + PLZ + Ort. Pro Gruppe genau 1 Master wählen, dann „Merge“.</p>
          </div>
          <div className="row">
            <Link className="pill" href="/">← Zur Karte</Link>
            <span className="badge">Gruppen: {groups.length}</span>
            {loading ? <span className="badge">Lade …</span> : null}
          </div>
        </div>

        <div className="cardBody">
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="input" placeholder="Suche (Name/Ort/PLZ) …" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
            <input className="input" placeholder="Quelle (optional)" value={source} onChange={(e) => setSource(e.target.value)} style={{ minWidth: 220 }} />
            <label className="pill" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={onlyUnresolved} onChange={(e) => setOnlyUnresolved(e.target.checked)} />
              Nur offene Gruppen
            </label>
          </div>

          {err ? <div className="badge danger">{err}</div> : null}
          {msg ? <div className={msg.startsWith("✅") ? "badge ok" : "badge danger"}>{msg}</div> : null}
        </div>
      </div>

      {groups.map((gr) => (
        <div key={gr.key} className="card">
          <div className="cardHeader">
            <div>
              <h3 className="cardTitle">{gr.title || "Dublettengruppe"}</h3>
              <p className="cardSub">Größe: {gr.items.length} · Key: <span className="mono">{gr.key}</span></p>
            </div>
            <div className="row">
              <button className="btnPrimary" onClick={() => mergeGroup(gr)}>
                Merge
              </button>
            </div>
          </div>
          <div className="cardBody">
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Master?</th>
                    <th>Name</th>
                    <th>Adresse</th>
                    <th>Quelle</th>
                    <th>Geo</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {gr.items.map((d) => {
                    const isSelected = selectedMaster[gr.key] === d.id;
                    const addr = [d.street, [d.zipcode, d.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—";
                    const geoOk = d.lat != null && d.lng != null;
                    const status = d.duplicate_of ? `Duplikat von #${d.duplicate_of}` : (d.is_master ? "Master" : "—");

                    return (
                      <tr key={d.id} style={isSelected ? { outline: "2px solid rgba(59,130,246,0.35)" } : undefined}>
                        <td>
                          <input
                            type="radio"
                            name={`master-${gr.key}`}
                            checked={isSelected}
                            onChange={() => setSelectedMaster((s) => ({ ...s, [gr.key]: d.id }))}
                          />
                        </td>
                        <td>
                          <Link href={`/dealers/${d.id}`} style={{ color: "#93c5fd", fontWeight: 800 }}>
                            {d.name}
                          </Link>
                          <div className="small">ID #{d.id}</div>
                        </td>
                        <td>{addr}</td>
                        <td>{d.source || "—"}</td>
                        <td>{geoOk ? <span className="badge ok">OK</span> : <span className="badge warn">Fehlt</span>}</td>
                        <td>{status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="small" style={{ marginTop: 10 }}>
              Tipp: Wähle den Datensatz mit bester Adresse / Geo als Master.
            </div>
          </div>
        </div>
      ))}

      {!groups.length ? (
        <div className="card">
          <div className="cardBody" style={{ opacity: 0.8 }}>
            Keine Dublettengruppen gefunden (oder alles bereits aufgelöst).
          </div>
        </div>
      ) : null}
    </div>
  );
}
