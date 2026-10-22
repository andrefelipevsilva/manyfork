import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, sessaoValida } from "@/lib/session";

// Tudo exige login, menos: a tela de login, o webhook da Meta, o redirecionador
// de links (/r/...), as páginas públicas exigidas pela Meta e o health check.
const PUBLICAS = [/^\/login$/, /^\/api\/webhooks\//, /^\/r\//, /^\/privacidade$/, /^\/exclusao-de-dados$/, /^\/api\/saude$/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((r) => r.test(pathname))) return NextResponse.next();

  const segredo = process.env.SESSION_SECRET;
  const ok = segredo ? await sessaoValida(req.cookies.get(COOKIE_SESSAO)?.value, segredo) : false;
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?de=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
