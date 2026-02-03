import { createClient } from "@supabase/supabase-js";

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function createSupabaseAdmin() {
  return createClient(
    must("NEXT_PUBLIC_SUPABASE_URL"),
    must("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
      db: { schema: "app" }, // <-- wichtig
    }
  );
}
