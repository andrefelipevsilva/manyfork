import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { temSessao } from "@/lib/auth";
import { env, instagramConfigurado } from "@/lib/env";
import { COOKIE_ESTADO, urlDeAutorizacao } from "@/lib/instagram/oauth";

// Começa o "Login com Instagram": guarda um estado aleatório num cookie e
// manda pra tela de autorização do Instagram.
export async function GET() {
  if (!(await temSessao())) return NextResponse.redirect(new URL("/login", env.appUrl()));
  if (!instagramConfigurado()) {
    return NextResponse.redirect(new URL("/configuracoes?erro=faltam-chaves", env.appUrl()));
  }
  const estado = randomBytes(24).toString("base64url");
  const r = NextResponse.redirect(urlDeAutorizacao(estado));
  r.cookies.set(COOKIE_ESTADO, estado, { httpOnly: true, secure: env.cookieSecure(), sameSite: "lax", path: "/api/instagram", maxAge: 600 });
  return r;
}
