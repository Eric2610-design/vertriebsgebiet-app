import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function supabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  );
}

export async function middleware(request: NextRequest) {
  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = supabaseKey();
  if (!key) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)");

  // Wichtig: response MUSS die von Supabase gesetzten Cookies tragen
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 1) Request-Cookies aktualisieren (wichtig für den laufenden Middleware-Flow)
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        // 2) Response neu bauen und Cookies setzen
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // NICHTS zwischen createServerClient und getClaims() machen!
  const {
    data: { claims },
  } = await supabase.auth.getClaims();

  const isProtected = request.nextUrl.pathname.startsWith("/app");

  // Login & Auth callback NIE blockieren
  const isLogin = request.nextUrl.pathname.startsWith("/login");
  const isAuth = request.nextUrl.pathname.startsWith("/auth");

  if (isProtected && !claims && !isLogin && !isAuth) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search
    );
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// Matcht alles außer Next static/image + assets
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
