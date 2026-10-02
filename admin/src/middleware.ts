import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// Routes exempt from CSRF / session checks
const PUBLIC_API_ROUTES = new Set([
  "/api/v1/cron/verify", // Authenticated via Bearer token
  "/api/v1/auth/login",  // Unauthenticated credential exchange
  "/api/v1/auth/logout", // Session termination
]);

function isOriginAllowed(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin) {
    // If no Origin, check Referer
    const referer = request.headers.get("referer");
    if (!referer) {
      // In non-browser API client environments without Origin/Referer,
      // require a custom header like X-Requested-With to prevent simple form CSRF
      const customHeader = request.headers.get("x-requested-with");
      return customHeader === "XMLHttpRequest" || customHeader === "AnantaCMS";
    }
    try {
      const refererUrl = new URL(referer);
      return refererUrl.host === host;
    } catch {
      return false;
    }
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.host === host) {
      return true;
    }
    // Allow explicitly configured public or admin URLs
    const allowedAdminUrl = process.env.ADMIN_SITE_URL || process.env.NEXT_PUBLIC_ADMIN_URL;
    if (allowedAdminUrl) {
      const allowedOrigin = new URL(allowedAdminUrl).origin;
      if (origin === allowedOrigin) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // 1. Clickjacking, CSP, and Security Headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
  );

  // 2. Strict CORS & Preflight handling for /api/v1
  if (pathname.startsWith("/api/v1")) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin) {
      let isAllowed = false;
      try {
        const originUrl = new URL(origin);
        isAllowed = originUrl.host === host;
      } catch {
        isAllowed = false;
      }

      if (isAllowed) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Access-Control-Allow-Credentials", "true");
        response.headers.set(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS"
        );
        response.headers.set(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, If-Match, X-Requested-With"
        );
      }
    }

    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: response.headers,
      });
    }
  }

  // 3. CSRF Protection on Mutating Admin API Routes
  if (
    pathname.startsWith("/api/v1") &&
    MUTATING_METHODS.has(request.method) &&
    !PUBLIC_API_ROUTES.has(pathname)
  ) {
    if (!isOriginAllowed(request)) {
      return NextResponse.json(
        {
          error: "Cross-site request forgery protection: origin mismatch",
          code: "CSRF_DETECTED",
        },
        { status: 403, headers: response.headers }
      );
    }
  }

  // 4. Session & Profile Verification
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          })
        );
      },
    },
  });

  // Skip auth check for public endpoints
  if (PUBLIC_API_ROUTES.has(pathname)) {
    return response;
  }

  // Server-side user verification via Supabase Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is authenticated, verify their profile and active role in database
  let profile = null;
  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();
    profile = profileData;
  }

  // Protect /dashboard routes: redirect unauthenticated or invalid users to /login
  if (pathname.startsWith("/dashboard")) {
    if (!user || !profile) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      // Sanitize redirect parameter to avoid open-redirect vulnerabilities
      const safeRedirect = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/dashboard";
      loginUrl.searchParams.set("redirect", safeRedirect);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protect /api/v1 routes: return 401 for unauthenticated or non-profile users
  if (pathname.startsWith("/api/v1")) {
    if (!user || !profile) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401, headers: response.headers }
      );
    }
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/v1/:path*"],
};

// Re-export as proxy for backward compatibility if invoked by experimental Next.js runners
export const proxy = middleware;
