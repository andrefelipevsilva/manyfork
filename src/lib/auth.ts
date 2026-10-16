import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "./env";
import { COOKIE_SESSAO, sessaoValida } from "./session";

// Defesa em profundidade: o middleware já barra quem não tem sessão, mas as
// rotas e ações que mudam dados conferem de novo.

export async function temSessao(): Promise<boolean> {
  const c = await cookies();
  return sessaoValida(c.get(COOKIE_SESSAO)?.value, env.sessionSecret());
}

export async function exigirSessao(): Promise<void> {
  if (!(await temSessao())) throw new Error("Sessão expirada. Entre de novo.");
}

/** IP do cliente atrás de Cloudflare + Caddy. */
export async function ipDoCliente(): Promise<string> {
  const h = await headers();
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "desconhecido"
  );
}

/**
 * Para rotas de API que mudam dados: exige sessão e origem do próprio painel
 * (o cookie é SameSite=Lax, isto fecha o resto do CSRF).
 */
export async function guardaApi(req: Request): Promise<NextResponse | null> {
  if (!(await temSessao())) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origem = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origem && host && new URL(origem).host !== host) {
      return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
    }
  }
  return null;
}
