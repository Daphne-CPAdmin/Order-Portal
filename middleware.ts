import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "default-secret-change-me-in-production"
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /admin/* but allow /admin (login page) and /api/auth
  if (pathname.startsWith("/admin") && pathname !== "/admin") {
    const token = req.cookies.get("admin_session")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }

    try {
      await jwtVerify(token, SECRET);
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
