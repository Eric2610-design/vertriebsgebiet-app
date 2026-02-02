import { createBrowserClient } from "@supabase/ssr";
import { mustGetEnv } from "./env";

export function createSupabaseBrowser() {
  return createBrowserClient(
    mustGetEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustGetEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { db: { schema: "app" } }
  );
}
