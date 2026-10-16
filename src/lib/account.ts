import type { Account } from "@prisma/client";
import { db } from "./db";

// O manyfork é de uso pessoal: uma conta do Instagram por instalação. Antes de
// conectar o Instagram de verdade (ou depois de desconectar) a conta fica
// "simulada": dá pra montar e testar as automações, mas nada sai pra Meta.

export const IG_ID_SIMULADO = "sim_conta";

export async function contaReal(): Promise<Account | null> {
  return db.account.findFirst({ where: { simulated: false }, orderBy: { createdAt: "asc" } });
}

export async function contaAtual(): Promise<Account> {
  const qualquer = await db.account.findFirst({ orderBy: [{ simulated: "asc" }, { createdAt: "asc" }] });
  if (qualquer) return qualquer;
  try {
    return await db.account.create({
      data: { igUserId: IG_ID_SIMULADO, username: "simulador", name: "Conta de teste", accessTokenEnc: "-", tokenExpiresAt: new Date("2100-01-01"), simulated: true },
    });
  } catch (e) {
    // Layout e página pedem ao mesmo tempo no primeiro acesso: um cria, o outro lê.
    if ((e as { code?: string }).code !== "P2002") throw e;
    return db.account.findUniqueOrThrow({ where: { igUserId: IG_ID_SIMULADO } });
  }
}

/** Ao conectar a conta real: leva automações e etiquetas das contas simuladas e apaga elas. */
export async function migrarDaSimulada(contaRealId: string) {
  const simuladas = await db.account.findMany({ where: { simulated: true, NOT: { id: contaRealId } } });
  for (const sim of simuladas) {
    const nomesReais = new Set((await db.tag.findMany({ where: { accountId: contaRealId } })).map((t) => t.name));
    const tagsSim = await db.tag.findMany({ where: { accountId: sim.id } });
    await db.$transaction([
      db.automation.updateMany({ where: { accountId: sim.id }, data: { accountId: contaRealId } }),
      db.tag.updateMany({ where: { id: { in: tagsSim.filter((t) => !nomesReais.has(t.name)).map((t) => t.id) } }, data: { accountId: contaRealId } }),
      db.account.delete({ where: { id: sim.id } }),
    ]);
  }
}
