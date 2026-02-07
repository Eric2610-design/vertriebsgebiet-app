"use client";

import Link from "next/link";
import { useUser, type UserRole } from "@/components/useUser";
import { Card, CardContent, Button } from "@/components/ui";

export default function RequireRole({
  allow,
  children,
}: {
  allow: Array<Exclude<UserRole, null>>;
  children: React.ReactNode;
}) {
  const { me, loading } = useUser();

  if (loading) return null;
  const role = me?.role ?? null;
  if (!role || !allow.includes(role as any)) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="p-6">
          <div className="text-lg font-semibold">Keine Berechtigung</div>
          <div className="mt-1 text-sm text-slate-600">
            Du hast keine Rechte, diese Seite zu öffnen.
          </div>
          <div className="mt-4 flex gap-2">
            <Link href="/map"><Button>Zur Karte</Button></Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
