"use client";

import { useEffect, useMemo, useState } from "react";

export type UserRole = "aussendienst" | "admin" | "superadmin" | null;

export type MePayload = {
  authed: boolean;
  email: string | null;
  role: UserRole;
  is_admin: boolean;
};

export function useUser() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const j = await res.json();
        if (!cancelled) {
          setMe({
            authed: !!j?.authed,
            email: j?.email ?? null,
            role: (j?.role ?? null) as UserRole,
            is_admin: !!j?.is_admin,
          });
        }
      } catch {
        if (!cancelled) setMe({ authed: false, email: null, role: null, is_admin: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const can = useMemo(() => {
    const role = me?.role;
    const isAdmin = role === "admin" || role === "superadmin" || me?.is_admin;
    const isSuper = role === "superadmin";
    return {
      role,
      isAdmin,
      isSuper,
      isRep: role === "aussendienst",
    };
  }, [me]);

  return { me, loading, can };
}
