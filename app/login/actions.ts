"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";

function nextFrom(formData: FormData) {
  const n = (formData.get("next") as string | null) || "/app";
  return n.startsWith("/") ? n : "/app";
}

export async function loginPassword(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = nextFrom(formData);

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const next = nextFrom(formData);

  const origin = headers().get("origin") || "";
  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/login?next=${encodeURIComponent(next)}&sent=1`);
}

export async function logout() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
