import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { productRole, isContact, resolveHome } from "@/lib/auth";

// Next.js 16 renamed the `middleware` convention to `proxy`. Same job:
// run before routes render. Here it refreshes the Supabase session and
// gates the two worlds by role.

// /auth covers the recovery code-exchange handler; /forgot-password + /reset-password
// are the password-reset screens (reachable while signed out).
const PUBLIC = ["/login", "/invite", "/forgot-password", "/reset-password", "/auth"];

// Gating reads the per-product `roles` claim from the access-token hook
// (derived live from `memberships`), so no manual provisioning step is needed.
const ENFORCE_AUTH = true;

// Route ownership per world — used for the artisan↔contact separation.
const PORTAL_PREFIXES = ["/my-projects", "/account"];
const ARTISAN_PREFIXES = ["/dashboard", "/projects", "/customers", "/contacts", "/settings"];
const WORKER_PREFIXES = ["/log"];

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

  // Per-product roles from the access-token hook's `roles` claim.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;

  const hasCrm = !!productRole(claims, "crm");
  const isWorker = productRole(claims, "timebilling") === "worker";
  const contact = isContact(claims);
  const home = resolveHome(claims);

  // Unauthenticated → only public routes; everything else bounces to login.
  if (!user) {
    return isPublic ? response : go("/login");
  }

  // Authenticated users have no business on the login screen or bare root.
  if (pathname === "/" || pathname === "/login") return go(home);

  // World separation: keep each surface to the role that owns it.
  if (!hasCrm && matches(pathname, ARTISAN_PREFIXES)) return go(home);
  if (!contact && matches(pathname, PORTAL_PREFIXES)) return go(home);
  if (!isWorker && matches(pathname, WORKER_PREFIXES)) return go(home);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
