import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, locales } from "@/i18n/dictionaries";

/** Send bare paths to a locale: cookie first, then Accept-Language, then Persian. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];
  if (isLocale(first)) return NextResponse.next();

  const cookie = request.cookies.get("locale")?.value;
  let locale = cookie && isLocale(cookie) ? cookie : null;
  if (!locale) {
    const header = request.headers.get("accept-language") ?? "";
    const preferred = header
      .split(",")
      .map((part) => part.split(";")[0].trim().slice(0, 2).toLowerCase())
      .find((code) => isLocale(code));
    locale = preferred && isLocale(preferred) ? preferred : defaultLocale;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, static files, the manifest, service worker and socket.io.
  matcher: [
    `/((?!_next|api|socket\\.io|manifest\\.webmanifest|sw\\.js|icons|favicon\\.ico|.*\\..*).*)`,
  ],
};

export { locales };
