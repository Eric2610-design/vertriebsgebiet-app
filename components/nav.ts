import type { UserRole } from "@/components/useUser";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  roles?: Array<Exclude<UserRole, null>>; // if omitted: visible for all authed users
};

export const NAV_ITEMS: NavItem[] = [
  { key: "map", label: "Karte", href: "/map" },
  { key: "ordertool", label: "Ordertool", href: "/ordertool", roles: ["aussendienst", "admin", "superadmin"] },
  { key: "ad", label: "Außendienst", href: "/ad", roles: ["admin", "superadmin"] },
  { key: "admin", label: "Admin", href: "/admin", roles: ["admin", "superadmin"] },
];

// Admin-Untermenü: wird in der Sidebar nur angezeigt, wenn "Admin" aktiv ist.
export const ADMIN_SUB_ITEMS: NavItem[] = [
  { key: "admin_home", label: "Übersicht", href: "/admin", roles: ["admin", "superadmin"] },
  { key: "admin_geo", label: "Geodaten · Merge", href: "/admin/geo-merge", roles: ["admin", "superadmin"] },
  { key: "admin_geo_overview", label: "Geodaten · Übersicht", href: "/admin/geo-merge/overview", roles: ["admin", "superadmin"] },
  { key: "admin_buying", label: "Einkaufsverbände", href: "/admin/buying-groups", roles: ["admin", "superadmin"] },
  { key: "admin_pricing_thresholds", label: "Schwellen · Preise", href: "/admin/pricing-thresholds", roles: ["admin", "superadmin"] },
  { key: "admin_fixprice_articles", label: "Fixpreise · Artikel", href: "/admin/fixprice-articles", roles: ["admin", "superadmin"] },
  { key: "admin_cleanup", label: "Cleanup", href: "/admin/cleanup", roles: ["admin", "superadmin"] },
];

export function isAllowed(role: UserRole, item: NavItem) {
  if (!item.roles || !item.roles.length) return true;
  if (!role) return false;
  return item.roles.includes(role as any);
}