import { auth } from "@/auth";
import { NextResponse } from "next/server";

const DEMO_MODE = process.env.DEMO_MODE === "true";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/v1/directory",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    DEMO_MODE ||
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  if (!req.auth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
