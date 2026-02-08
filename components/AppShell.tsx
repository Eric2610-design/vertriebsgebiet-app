"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { NAV_ITEMS, ADMIN_SUB_ITEMS, isAllowed } from "@/components/nav";
import { Button } from "@/components/ui";
import { useUser } from "@/components/useUser";

function NavLink({ href, active, ...props }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        "flex items-center rounded-xl px-3 py-2 text-sm font-medium transition " +
        (active
          ? "bg-white/15 text-white"
          : "text-slate-200 hover:bg-white/10 hover:text-white")
      }
      {...props as any}
    />
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, loading } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // We only want the "Topbar" UX on iOS. On other platforms, navigation lives in the sidebar.
  // This prevents the mobile/topbar UI from showing up on laptop Chrome when the window is narrow.
  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    setIsIOS(/iPad|iPhone|iPod/i.test(ua));
  }, []);

  const visibleItems = useMemo(() => {
    const role = me?.role ?? null;
    const base = NAV_ITEMS.filter((it) => isAllowed(role, it));
    // UX: Außendienstler sollen direkt zu ihrem Gebiet springen (statt die Admin-Übersicht /ad)
    if ((role as any) === "aussendienst" && me?.email) {
      const myHref = `/ad/${encodeURIComponent(me.email)}`;
      const withoutAd = base.filter((it) => it.key !== "ad");
      // falls später jemand "ad" doch freischaltet, ersetzen wir ihn konsequent
      return [...withoutAd, { key: "my_area", label: "Mein Gebiet", href: myHref } as any];
    }
    return base;
  }, [me]);

  const visibleAdminItems = useMemo(() => {
    const role = me?.role ?? null;
    return ADMIN_SUB_ITEMS.filter((it) => isAllowed(role, it));
  }, [me]);

  const adminActive = (pathname?.startsWith("/admin") ?? false);

  const logout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  const userLabel = loading ? "…" : me?.email || "";

  return (
    <div className="min-h-screen">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col md:border-r md:border-black md:bg-black">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="rounded-2xl bg-white/10 px-2 py-1 text-xs font-semibold text-white">
            hat geklappt
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Dealer Tool</div>
            <div className="text-xs text-slate-300">Händlerkarte</div>
          </div>
        </div>

        <div className="px-3 pb-2">
          <button
            className="w-full flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white transition"
            onClick={() => router.back()}
            type="button"
            aria-label="Zurück"
          >
            ← Zurück
          </button>
        </div>

        <nav className="flex-1 px-3">
          <div className="space-y-1">
            {visibleItems.map((it) => (
              <div key={it.key}>
                <NavLink
                  href={it.href}
                  active={pathname === it.href || pathname?.startsWith(it.href + "/")}
                >
                  {it.label}
                </NavLink>

                {/* Admin-Untermenü: nur sichtbar, wenn man im Admin-Bereich ist */}
                {it.key === "admin" && adminActive ? (
                  <div className="mt-1 ml-3 space-y-1">
                    {visibleAdminItems.map((ai) => (
                      <NavLink
                        key={ai.key}
                        href={ai.href}
                        active={pathname === ai.href || pathname?.startsWith(ai.href + "/")}
                      >
                        <span className="text-xs">{ai.label}</span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </nav>
        <div className="border-t border-white/10 px-4 py-4">
          <div className="truncate text-xs text-slate-300">{userLabel}</div>
          <Button variant="secondary" className="mt-2 w-full" onClick={logout}>
            Logout
          </Button>
        </div>
      </aside>

      {/* Topbar (iOS only) */}
      {isIOS && (
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-black bg-black px-4 py-3 md:hidden">
          <button
            className="inline-flex h-10 px-3 items-center justify-center rounded-xl bg-white/10 text-white"
            onClick={() => router.back()}
            type="button"
            aria-label="Zurück"
          >
            ←
          </button>
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-white/10 px-2 py-1 text-xs font-semibold text-white">
              hat geklappt
            </div>
            <div className="text-sm font-semibold text-white">Dealer Tool</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"
              onClick={() => setMobileOpen(true)}
              type="button"
              aria-label="Menü"
            >
              ☰
            </button>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"
              onClick={logout}
              type="button"
              aria-label="Logout"
            >
              ⎋
            </button>
          </div>
        </header>
      )}

      {/* Non-iOS small screens: no topbar, but still allow opening the sidebar as an overlay */}
      {!isIOS && (
        <button
          className="fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow md:hidden"
          onClick={() => setMobileOpen(true)}
          type="button"
          aria-label="Menü"
        >
          ☰
        </button>
      )}

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-black shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <div>
                <div className="text-sm font-semibold text-white">Menü</div>
                <div className="truncate text-xs text-slate-300">{userLabel}</div>
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"
                onClick={() => setMobileOpen(false)}
                type="button"
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>
            <div className="px-3 pb-2">
              <button
                className="w-full flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium bg-white/10 text-white"
                onClick={() => {
                  setMobileOpen(false);
                  router.back();
                }}
                type="button"
              >
                ← Zurück
              </button>
            </div>
            <nav className="px-3 pb-4">
              <div className="space-y-1">
                {visibleItems.map((it) => (
                  <div key={it.key}>
                    <Link
                      href={it.href}
                      className={
                        "flex items-center rounded-xl px-3 py-2 text-sm font-medium transition " +
                        ((pathname === it.href || pathname?.startsWith(it.href + "/"))
                          ? "bg-white/15 text-white"
                          : "text-slate-200 hover:bg-white/10 hover:text-white")
                      }
                      onClick={() => setMobileOpen(false)}
                    >
                      {it.label}
                    </Link>

                    {it.key === "admin" && adminActive ? (
                      <div className="mt-1 ml-3 space-y-1">
                        {visibleAdminItems.map((ai) => (
                          <Link
                            key={ai.key}
                            href={ai.href}
                            className={
                              "flex items-center rounded-xl px-3 py-2 text-xs font-medium transition " +
                              ((pathname === ai.href || pathname?.startsWith(ai.href + "/"))
                                ? "bg-white/15 text-white"
                                : "text-slate-200 hover:bg-white/10 hover:text-white")
                            }
                            onClick={() => setMobileOpen(false)}
                          >
                            {ai.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button variant="secondary" className="mt-4 w-full" onClick={logout}>
                Logout
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="md:pl-64">
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
