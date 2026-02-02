import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { mustGetEnv } from "./env";

export function createSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    mustGetEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustGetEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) { cookieStore.set({ name, value, ...options }); },
        remove(name, options) { cookieStore.set({ name, value: "", ...options }); },
      },
    }
  );
}
