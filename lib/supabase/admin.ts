import { createClient } from "@supabase/supabase-js";
import { mustGetEnv } from "./env";

export function createSupabaseAdmin() {
  return createClient(
    mustGetEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustGetEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
      db: { schema: "app" },
    }
  );
}
