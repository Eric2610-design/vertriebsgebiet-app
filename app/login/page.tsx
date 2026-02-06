import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg px-4 py-10 text-sm text-slate-600">Lade…</div>}>
      <LoginClient />
    </Suspense>
  );
}
