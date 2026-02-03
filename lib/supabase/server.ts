import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function createSupabaseServer() {
  const cookieStore = cookies();

  return createServerClient(
    must("NEXT_PUBLIC_SUPABASE_URL"),
    must("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      db: { schema: "app" }, // <-- wichtig
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name, options) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}
