"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/admin/uploads", label: "Uploads" },
  { href: "/admin/dealers", label: "Dubletten" },
  { href: "/geocoding", label: "Geocoding" },
  { href: "/dealers", label: "Händler" },
  { href: "/territories", label: "Gebiete" },
];

export default function TopNav() {
  const path = usePathname();

  return (
    <header className="topbar">
      <div className="nav">
        <div className="brand">
          <span className="brandDot" />
          Vertriebsgebiet
        </div>
        <nav className="navlinks">
          {LINKS.map((l) => {
            const active = path === l.href || (l.href !== "/" && path.startsWith(l.href));
            return (
              <Link key={l.href} href={l.href} className={`pill ${active ? "active" : ""}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
