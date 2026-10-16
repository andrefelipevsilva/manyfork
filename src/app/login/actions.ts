"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ipDoCliente } from "@/lib/auth";
import { conferirSenha } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { COOKIE_SESSAO, DURACAO_SESSAO_S, criarSessao } from "@/lib/session";

const JANELA_MS = 15 * 60 * 1000;
const MAX_FALHAS_IP = 5;
const MAX_FALHAS_TOTAL = 30;

export type EstadoLogin = { erro?: string };

export async function entrar(_anterior: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const senha = String(form.get("senha") ?? "");
  const destino = String(form.get("de") ?? "/");
  const ip = await ipDoCliente();
  const desde = new Date(Date.now() - JANELA_MS);

  const [falhasIp, falhasTotal] = await Promise.all([
    db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: desde } } }),
    db.loginAttempt.count({ where: { success: false, createdAt: { gte: desde } } }),
  ]);
  if (falhasIp >= MAX_FALHAS_IP || falhasTotal >= MAX_FALHAS_TOTAL) {
    return { erro: "Muitas tentativas erradas. Espere 15 minutos e tente de novo." };
  }

  const ok = senha.length > 0 && (await conferirSenha(senha, env.adminPasswordHash()));
  await db.loginAttempt.create({ data: { ip, success: ok } });
  if (!ok) return { erro: "Senha incorreta." };

  const c = await cookies();
  c.set(COOKIE_SESSAO, await criarSessao(env.sessionSecret()), {
    httpOnly: true,
    secure: env.cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
  // Só redireciona pra caminho interno (nada de //outro-site).
  redirect(destino.startsWith("/") && !destino.startsWith("//") ? destino : "/");
}

export async function sair() {
  const c = await cookies();
  c.delete(COOKIE_SESSAO);
  redirect("/login");
}
