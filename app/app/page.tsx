
import { Suspense } from "react";
import AppDashboardClient from "./AppDashboardClient";

export const dynamic = "force-dynamic";

export default function AppPage() {
  return (
    <Suspense fallback={<div className="card">Lade…</div>}>
      <AppDashboardClient />
    </Suspense>
  );
}
