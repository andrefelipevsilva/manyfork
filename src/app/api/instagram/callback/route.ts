import { NextResponse, type NextRequest } from "next/server";
import { migrarDaSimulada } from "@/lib/account";
import { temSessao } from "@/lib/auth";
import { cifrar } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { assinarWebhooks, quemSouEu } from "@/lib/instagram/graph";
import { COOKIE_ESTADO, tokenLongo, trocarCodigo } from "@/lib/instagram/oauth";

function voltar(query: string) {
  const r = NextResponse.redirect(new URL(`/configuracoes?${query}`, env.appUrl()));
  r.cookies.delete({ name: COOKIE_ESTADO, path: "/api/instagram" });
  return r;
}

// Volta do "Login com Instagram": troca o código pelo token de 60 dias,
// grava a conta e assina os webhooks.
export async function GET(req: NextRequest) {
  if (!(await temSessao())) return NextResponse.redirect(new URL("/login", env.appUrl()));
  const u = req.nextUrl;
  if (u.searchParams.get("error")) return voltar(`erro=${encodeURIComponent(u.searchParams.get("error_description") ?? "Autorização negada.")}`);

  const estado = u.searchParams.get("state");
  if (!estado || estado !== req.cookies.get(COOKIE_ESTADO)?.value) return voltar("erro=estado-invalido");
  const code = u.searchParams.get("code")?.replace(/#_$/, "");
  if (!code) return voltar("erro=sem-codigo");

  try {
    const curto = await trocarCodigo(code);
    const longo = await tokenLongo(curto.accessToken);
    const eu = await quemSouEu(longo.accessToken);
    const igUserId = String(eu.user_id ?? curto.userId);

    const outra = await db.account.findFirst({ where: { simulated: false, NOT: { igUserId } } });
    if (outra) return voltar(`erro=${encodeURIComponent(`Já existe outra conta conectada (@${outra.username}). Desconecte antes.`)}`);

    const conta = await db.account.upsert({
      where: { igUserId },
      create: {
        igUserId,
        username: eu.username,
        name: eu.name,
        profilePictureUrl: eu.profile_picture_url,
        accessTokenEnc: cifrar(longo.accessToken),
        tokenExpiresAt: longo.expiraEm,
      },
      update: {
        simulated: false,
        username: eu.username,
        name: eu.name,
        profilePictureUrl: eu.profile_picture_url,
        accessTokenEnc: cifrar(longo.accessToken),
        tokenExpiresAt: longo.expiraEm,
        tokenRefreshedAt: new Date(),
      },
    });
    await migrarDaSimulada(conta.id);

    try {
      await assinarWebhooks(longo.accessToken);
      await db.account.update({ where: { id: conta.id }, data: { webhookSubscribedAt: new Date() } });
    } catch (e) {
      console.error("[instagram] conectou, mas falhou ao assinar webhooks:", e);
      return voltar("ok=1&aviso=webhooks");
    }
    return voltar("ok=1");
  } catch (e) {
    console.error("[instagram] falha ao conectar:", e);
    return voltar(`erro=${encodeURIComponent(e instanceof Error ? e.message : "Falha ao conectar.")}`);
  }
}
