import { NextRequest, NextResponse } from "next/server";
import { unmatchedRewrite } from "./lib/unmatched-route";

const cookieName = "cumsevoteaza_access";

export function proxy(request: NextRequest) {
  const password = process.env.CUMSEVOTEAZA_SITE_PASSWORD;
  const rewriteTo = unmatchedRewrite(request.nextUrl.pathname);
  const pass = () => (rewriteTo ? NextResponse.rewrite(new URL(rewriteTo, request.url)) : NextResponse.next());
  if (request.nextUrl.pathname === "/api/cron/daily-import" && process.env.CRON_SECRET && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`) return pass();

  if (!password || isPublicAsset(request.nextUrl.pathname)) {
    return pass();
  }

  if (request.cookies.get(cookieName)?.value === password) {
    return pass();
  }

  const access = request.nextUrl.searchParams.get("access");
  if (access === password) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("access");
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(cookieName, password, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/"
    });
    return response;
  }

  return new NextResponse(privateGateHtml(), {
    status: 401,
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};

function isPublicAsset(pathname: string) {
  return pathname.startsWith("/_next") || pathname === "/favicon.ico" || /\.[a-z0-9]+$/i.test(pathname);
}

function privateGateHtml() {
  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>cumsevoteaza — privat</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      form { width: min(420px, 100%); border: 1px solid #cbd5e1; background: #fff; padding: 24px; border-radius: 8px; }
      h1 { font-size: 24px; margin: 0 0 8px; }
      p { color: #475569; margin: 0 0 20px; }
      input, button { width: 100%; box-sizing: border-box; font: inherit; border-radius: 6px; }
      input { border: 1px solid #94a3b8; padding: 10px 12px; margin-bottom: 12px; }
      button { border: 0; background: #0f172a; color: #fff; padding: 10px 12px; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <form method="GET">
        <h1>cumsevoteaza</h1>
        <p>Acces privat</p>
        <input type="password" name="access" autocomplete="current-password" autofocus />
        <button type="submit">Intră</button>
      </form>
    </main>
  </body>
</html>`;
}
