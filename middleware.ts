import { auth } from "@/auth";
import { NextResponse } from "next/server";

const ALLOWED_DOMAINS = (process.env.SSO_ALLOWED_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/v1/directory",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico") ||
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

  if (ALLOWED_DOMAINS.length > 0) {
    const email = req.auth.user?.email ?? "";
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain || !ALLOWED_DOMAINS.includes(domain)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Access denied: email domain not allowed" },
          { status: 403 }
        );
      }
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("error", "DomainNotAllowed");
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
