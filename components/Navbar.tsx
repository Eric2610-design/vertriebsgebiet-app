"use client";

import Link from "next/link";

export default function Navbar() {
  return (
    <nav style={{ height: 56, display: "flex", alignItems: "center", gap: 20, padding: "0 20px", background: "#0f172a", color: "white" }}>
      <Link href="/">Dashboard</Link>
      <Link href="/map">Karte</Link>
      <Link href="/upload">Upload</Link>
    </nav>
  );
}