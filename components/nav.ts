import type { UserRole } from "@/components/useUser";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  roles?: Array<Exclude<UserRole, null>>; // if omitted: visible for all authed users
};

export const NAV_ITEMS: NavItem[] = [
  { key: "map", label: "Karte", href: "/map" },
  { key: "ad", label: "Außendienst", href: "/ad", roles: ["admin", "superadmin"] },
  { key: "import", label: "Import", href: "/import", roles: ["admin", "superadmin"] },
  { key: "cleanup", label: "Cleanup", href: "/cleanup", roles: ["admin", "superadmin"] },
  { key: "bg", label: "Einkaufsverbände", href: "/admin/buying-groups", roles: ["admin", "superadmin"] },
  { key: "nogeo", label: "Ohne Geodaten", href: "/admin/no-geo", roles: ["admin", "superadmin"] },
  { key: "admin", label: "Admin", href: "/admin", roles: ["admin", "superadmin"] },
];

export function isAllowed(role: UserRole, item: NavItem) {
  if (!item.roles || !item.roles.length) return true;
  if (!role) return false;
  return item.roles.includes(role as any);
}
