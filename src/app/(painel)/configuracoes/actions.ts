"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { contaReal } from "@/lib/account";
import { exigirSessao } from "@/lib/auth";
import { decifrar } from "@/lib/crypto";
import { db } from "@/lib/db";
import { assinarWebhooks } from "@/lib/instagram/graph";
import { salvarConfiguracoes } from "@/lib/settings";

const inteiro = (v: FormDataEntryValue | null, min: number, max: number, padrao: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

export async function salvarLimites(form: FormData) {
  await exigirSessao();
  const min = inteiro(form.get("atrasoMin"), 0, 600, 4);
  await salvarConfiguracoes({
    limiteDmsHora: inteiro(form.get("limiteDms"), 1, 1000, 180),
    limiteRespostasPublicasHora: inteiro(form.get("limitePublicas"), 1, 1000, 150),
    atrasoRespostaPublicaMin: min,
    atrasoRespostaPublicaMax: Math.max(min, inteiro(form.get("atrasoMax"), 0, 600, 25)),
    pausarAoResponderManual: form.get("pausarManual") === "on",
  });
  revalidatePath("/configuracoes");
  redirect("/configuracoes?salvo=1");
}

export async function reassinarWebhooks() {
  await exigirSessao();
  const conta = await contaReal();
  if (!conta) redirect("/configuracoes?erro=sem-conta");
  try {
    await assinarWebhooks(decifrar(conta.accessTokenEnc));
    await db.account.update({ where: { id: conta.id }, data: { webhookSubscribedAt: new Date() } });
  } catch (e) {
    redirect(`/configuracoes?erro=${encodeURIComponent(e instanceof Error ? e.message : "Falha ao assinar.")}`);
  }
  redirect("/configuracoes?ok=webhooks");
}

/**
 * Desconecta o Instagram: apaga o token. Automações e contatos ficam (voltam
 * a funcionar quando reconectar a mesma conta).
 */
export async function desconectar() {
  await exigirSessao();
  const conta = await contaReal();
  if (!conta) redirect("/configuracoes");
  await db.account.update({
    where: { id: conta.id },
    data: { simulated: true, accessTokenEnc: "-", webhookSubscribedAt: null, tokenExpiresAt: new Date() },
  });
  redirect("/configuracoes?desconectado=1");
}
