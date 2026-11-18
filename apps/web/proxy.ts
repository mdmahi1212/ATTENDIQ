import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import { canAccess, homeForRole, isPublicPath, isRole } from "@/lib/roles";

// Next.js 16 renamed middleware.ts -> proxy.ts (same role). It (1) refreshes the Supabase session
// cookie on every navigation and (2) redirects by role. It is a UX guard only: every layout,
// Server Action and Route Handler re-checks the role against public.profiles.
export async function proxy(request: NextRequest) {
  const env = publicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Verifies the JWT (and refreshes it if needed). Do not put code between createServerClient and this call.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const roleClaim = claims?.app_metadata?.role ?? "student";
  const role = claims ? (isRole(roleClaim) ? roleClaim : "student") : null;
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!role) {
    return isPublicPath(pathname) ? response : redirectTo("/login", pathname);
  }
  if (pathname === "/" || pathname === "/login" || pathname === "/signup") {
    return redirectTo(homeForRole(role));
  }
  if (!canAccess(pathname, role)) {
    return redirectTo("/forbidden");
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except API routes (they authenticate themselves), Next internals and static files.
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
