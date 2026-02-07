"use client";

import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";

export default function RootFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login page should stay clean (no shell)
  if (pathname === "/login") return <>{children}</>;

  return <AppShell>{children}</AppShell>;
}
