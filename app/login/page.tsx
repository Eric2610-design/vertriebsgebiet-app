import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-black/60">Lade…</div>}>
      <LoginClient />
    </Suspense>
  );
}

