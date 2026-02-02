import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Niemals im Browser hart crashen – lieber null zurückgeben
  if (!url || !anon) return null;

  return createBrowserClient(url, anon);
}
