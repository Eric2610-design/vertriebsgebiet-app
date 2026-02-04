"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";

type Row = Record<string, any>;

type Mapping = {
  name?: string;
  city?: string;
  street?: string;
};

type Profile = {
  profileName: string; // z.B. "Riese & Müller"
  mapping: Mapping; // Header-Zuordnung
  updatedAt: string; // ISO
};

const LS_KEY = "dealer_upload_mapping_profiles_v1";

function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveProfiles(profiles: Profile[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(profiles));
}

function safeStr(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/* ===============================
   Auto-Mapping (Vorschläge)
   =============================== */
function normalizeHeader(h: string) {
  return h
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

const AUTO_FIELDS = {
  name: [
    "name",
    "haendler",
    "handler",
    "haendlername",
    "firmenname",
    "firma",
    "unternehmen",
    "kunde",
    "shop",
    "partner",
    "betrieb",
    "bezeichnung",
  ],
  city: ["ort", "stadt", "city", "town", "plzort", "ortplz"],
  street: ["strasse", "str", "street", "adresse", "anschrift"],
} as const;

function autoDetectMapping(headers: string[]): Mapping {
  const norm = headers.map((h) => ({
    original: h,
    n: normalizeHeader(h),
  }));

  const result: Mapping = {};

  (Object.keys(AUTO_FIELDS) as (keyof typeof AUTO_FIELDS)[]).forEach((field) => {
    for (const h of norm) {
      if (AUTO_FIELDS[field].some((k) => h.n.includes(k))) {
        (result as any)[field] = h.original;
        break;
      }
    }
  });

  return result;
}

export default function DealerUpload() {
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [status, setStatus] = useState<string>("Bitte Excel-Datei auswählen");
  const [busy, setBusy] = useState(false);

  // Profile State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>(""); // profileName
  const [newProfileName, setNewProfileName] = useState<string>("");

  useEffect(() => {
    const p = loadProfiles();
    setProfiles(p);
  }, []);

  const selectedProfileObj = useMemo(
    () => profiles.find((p) => p.profileName === selectedProfile) ?? null,
    [profiles, selectedProfile]
  );

  /* ===============================
     1️⃣ Datei einlesen
     =============================== */
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setStatus("Lese Datei …");
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data: Row[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

      if (!data.length) {
        setStatus("❌ Datei enthält keine Daten");
        setRows([]);
        setHeaders([]);
        setBusy(false);
        return;
      }

      const hdrs = Object.keys(data[0]);
      setRows(data);
      setHeaders(hdrs);

      // ✅ Vorbelegung:
      // 1) wenn Profil gewählt → Profil-Mapping
      // 2) wenn genau 1 Profil existiert → Profil-Mapping
      // 3) sonst Auto-Mapping
      if (selectedProfileObj) {
        setMapping(selectedProfileObj.mapping);
        setStatus(`Spalten erkannt – Mapping aus Profil „${selectedProfileObj.profileName}“ geladen`);
      } else if (profiles.length === 1) {
        setSelectedProfile(profiles[0].profileName);
        setMapping(profiles[0].mapping);
        setStatus(`Spalten erkannt – Mapping aus Profil „${profiles[0].profileName}“ geladen`);
      } else {
        const auto = autoDetectMapping(hdrs);
        setMapping(auto);
        setStatus(
          auto.name
            ? "Spalten erkannt – Auto-Vorschläge gesetzt (bitte kurz prüfen)"
            : "Spalten erkannt – bitte Mapping wählen"
        );
      }
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Fehler beim Lesen: ${err?.message ?? String(err)}`);
      setRows([]);
      setHeaders([]);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  /* ===============================
     2️⃣ Profil anwenden
     =============================== */
  function applyProfile(profileName: string) {
    setSelectedProfile(profileName);
    const p = profiles.find((x) => x.profileName === profileName);
    if (!p) {
      // Profil "— kein Profil —"
      setStatus("Profil entfernt");
      return;
    }
    setMapping(p.mapping);
    setStatus(`Profil „${profileName}“ angewendet`);
  }

  /* ===============================
     3️⃣ Profil speichern / überschreiben
     =============================== */
  function saveCurrentAsProfile() {
    const name = newProfileName.trim() || selectedProfile.trim();
    if (!name) {
      alert("Bitte Profilnamen eingeben.");
      return;
    }
    if (!mapping.name) {
      alert("Bitte zuerst mindestens den Händlernamen zuordnen, dann Profil speichern.");
      return;
    }

    const next: Profile[] = [
      ...profiles.filter((p) => p.profileName !== name),
      { profileName: name, mapping, updatedAt: new Date().toISOString() },
    ].sort((a, b) => a.profileName.localeCompare(b.profileName));

    setProfiles(next);
    saveProfiles(next);
    setSelectedProfile(name);
    setNewProfileName("");
    setStatus(`✅ Profil „${name}“ gespeichert`);
  }

  /* ===============================
     4️⃣ Profil löschen
     =============================== */
  function deleteSelectedProfile() {
    if (!selectedProfile) return;
    if (!confirm(`Profil „${selectedProfile}“ wirklich löschen?`)) return;

    const next = profiles.filter((p) => p.profileName !== selectedProfile);
    setProfiles(next);
    saveProfiles(next);
    setSelectedProfile("");
    setStatus("Profil gelöscht");
  }

  /* ===============================
     5️⃣ Import starten
     =============================== */
  async function startImport() {
    if (!mapping.name) {
      alert("Bitte eine Spalte für den Händlernamen auswählen.");
      return;
    }

    setBusy(true);
    setStatus("Importiere Händler …");

    try {
      const payload = rows
        .map((r) => ({
          name: safeStr(r[mapping.name!]),
          city: mapping.city ? safeStr(r[mapping.city]) : null,
          street: mapping.street ? safeStr(r[mapping.street]) : null,
          source: selectedProfile || fileName || "upload",
        }))
        .filter((r) => r.name);

      if (!payload.length) {
        setStatus("❌ Keine gültigen Zeilen (kein Händlername nach Mapping).");
        setBusy(false);
        return;
      }

      const { error } = await supabase.from("dealers").insert(payload);

      if (error) {
        setStatus(`❌ Fehler: ${error.message}`);
      } else {
        setStatus(`✅ Import erfolgreich: ${payload.length} Händler`);
      }
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Fehler: ${err?.message ?? String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 900 }}>
      <h1>Händler-Upload</h1>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label>
              <strong>Excel auswählen</strong>
            </label>
            <br />
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={busy} />
          </div>

          <div>
            <label>
              <strong>Profil (optional)</strong>
            </label>
            <br />
            <select
              value={selectedProfile}
              onChange={(e) => applyProfile(e.target.value)}
              disabled={busy || profiles.length === 0}
            >
              <option value="">— kein Profil —</option>
              {profiles.map((p) => (
                <option key={p.profileName} value={p.profileName}>
                  {p.profileName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 220 }}>
            <label>
              <strong>Profil speichern als</strong>
            </label>
            <br />
            <input
              placeholder='z.B. "Riese & Müller"'
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              disabled={busy}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <button onClick={saveCurrentAsProfile} disabled={busy}>
              Profil speichern
            </button>
            <button onClick={deleteSelectedProfile} disabled={busy || !selectedProfile}>
              Profil löschen
            </button>
          </div>
        </div>

        <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{status}</p>

        {headers.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h3>Spalten zuordnen</h3>

            {[
              { key: "name", label: "Händlername (Pflichtfeld)" },
              { key: "city", label: "Stadt" },
              { key: "street", label: "Straße" },
            ].map((f) => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label>{f.label}</label>
                <br />
                <select
                  value={(mapping as any)[f.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}
                  disabled={busy}
                >
                  <option value="">— nicht zuordnen —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button onClick={startImport} disabled={busy}>
                Import starten
              </button>
              <a href="/admin/dealers" style={{ opacity: 0.9 }}>
                → Zur Händlerliste
              </a>
            </div>

            <p style={{ marginTop: 12, opacity: 0.8 }}>
              Tipp: Wähle dein Mapping einmal, klick „Profil speichern“ (z. B. „Riese & Müller“).
              Beim nächsten Upload einfach Profil auswählen → Import ohne Neu-Zuordnung.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
