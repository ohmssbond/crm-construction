import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionRole, roleFromClaims } from "@/lib/auth";

// Next.js 16 renamed the `middleware` convention to `proxy`. Same job:
// run before routes render. Here it refreshes the Supabase session and
// gates the two worlds by role.

// /auth covers the recovery code-exchange handler; /forgot-password + /reset-password
// are the password-reset screens (reachable while signed out).
const PUBLIC = ["/login", "/invite", "/forgot-password", "/reset-password", "/auth"];

// Roles are stamped into app_metadata at provisioning (scripts/stamp-roles.mjs,
// scripts/seed-contact-login.mjs), so gating is enforced.
const ENFORCE_AUTH = true;

// Route ownership per world — used for the artisan↔contact separation.
const PORTAL_PREFIXES = ["/my-projects", "/account"];
const ARTISAN_PREFIXES = ["/dashboard", "/projects", "/customers", "/contacts", "/settings"];

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = matches(pathname, PUBLIC);

  const go = (to: string) => NextResponse.redirect(new URL(to, request.url));

  if (!ENFORCE_AUTH) {
    if (pathname === "/") return go("/dashboard");
    return response;
  }

  // Role: prefer the fresh JWT claim from the access-token hook; fall back to
  // app_metadata for tokens minted before the hook was enabled.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;

  // The contact portal home; everyone else (artisan, or unstamped) lands on the
  // artisan dashboard.
  const role = roleFromClaims(claims) ?? getSessionRole(user);
  const home = role === "contact" ? "/my-projects" : "/dashboard";

  // Unauthenticated → only public routes; everything else bounces to login.
  if (!user) {
    return isPublic ? response : go("/login");
  }

  // Authenticated users have no business on the login screen or bare root.
  if (pathname === "/" || pathname === "/login") return go(home);

  // World separation: keep each role inside its own surface.
  if (role === "contact" && matches(pathname, ARTISAN_PREFIXES)) return go("/my-projects");
  if (role === "artisan" && matches(pathname, PORTAL_PREFIXES)) return go("/dashboard");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
