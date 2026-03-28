import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─── Protected routes configuration ──────────────────────────────────────────

const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

const AUTH_ROUTES = ["/login", "/forgot-password"];

// ─── Middleware ───────────────────────────────────────────────────────────────

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip Next.js internals and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // static assets
  ) {
    return NextResponse.next();
  }

  // Check for access token in cookies (set after login)
  // The token is also stored in localStorage, but middleware runs on the edge
  // so we check a cookie we set alongside localStorage.
  const accessToken =
    req.cookies.get("hfh_access_token")?.value ??
    req.headers.get("x-access-token");

  const isPublicRoute = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );
  const isAuthRoute = AUTH_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );

  // If the user is authenticated and tries to access login/register, redirect to calendar
  if (accessToken && isAuthRoute) {
    return NextResponse.redirect(new URL("/calendar", req.url));
  }

  // If the route is protected and the user is not authenticated, redirect to login
  if (!accessToken && !isPublicRoute) {
    const loginUrl = new URL("/login", req.url);
    // Preserve the original destination so we can redirect back after login
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
