"use client";

import { useEffect, useState } from "react";

function parseHash(hash: string) {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const sp = new URLSearchParams(h);
  return {
    access_token: sp.get("access_token") || "",
    refresh_token: sp.get("refresh_token") || "",
    type: sp.get("type") || "",
    error_description: sp.get("error_description") || sp.get("error") || "",
  };
}

export default function CallbackPage() {
  const [msg, setMsg] = useState("Anmeldung wird abgeschlossen …");

  useEffect(() => {
    (async () => {
      const { access_token, refresh_token, type, error_description } = parseHash(window.location.hash || "");
      if (error_description) {
        setMsg(error_description);
        return;
      }
      if (!access_token || !refresh_token) {
        setMsg("Kein Token gefunden – bitte den Link erneut öffnen.");
        return;
      }

      const next = type === "invite" || type === "recovery" ? "/set-password" : "/map";
      const res = await fetch("/api/auth/set-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_token, refresh_token, next }),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(js?.error || "Callback fehlgeschlagen");
        return;
      }
      window.location.replace(js?.next || next);
    })();
  }, []);

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="text-sm text-slate-700">{msg}</div>
    </main>
  );
}
