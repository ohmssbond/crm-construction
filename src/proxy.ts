import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed the `middleware` convention to `proxy`. Same job:
// run before routes render. Here it refreshes the Supabase session and
// (once enabled) gates the two worlds.

const PUBLIC = ["/login", "/invite"];

// Auth gating is staged off until roles are stamped into app_metadata at
// sign-in (see docs/next-steps.md). Flip on to enforce login + world split.
const ENFORCE_AUTH = false;

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
  const isPublic = PUBLIC.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Send the root to the artisan home for now.
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (ENFORCE_AUTH) {
    if (!user && !isPublic) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    // TODO: role-based world separation via getSessionRole(user)
    // (artisan → /dashboard, contact → /my-projects) once metadata is stamped.
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
