"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { contaAtual } from "@/lib/account";
import { exigirSessao } from "@/lib/auth";
import { db } from "@/lib/db";
import { MODELOS } from "@/lib/engine/templates";
import type { Flow, TriggerConfig } from "@/lib/engine/types";
import { temErro, validarAutomacao } from "@/lib/engine/validate";

export async function criarDeModelo(form: FormData) {
  await exigirSessao();
  const modelo = MODELOS.find((m) => m.id === form.get("modelo"));
  if (!modelo) throw new Error("Modelo desconhecido.");
  const conta = await contaAtual();
  const a = await db.automation.create({
    data: {
      accountId: conta.id,
      name: modelo.nome,
      triggerType: modelo.triggerType,
      triggerConfig: modelo.triggerConfig as Prisma.InputJsonValue,
      flow: modelo.flow as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
    },
  });
  redirect(`/automacoes/${a.id}`);
}

export async function alternarStatus(id: string): Promise<{ erro?: string }> {
  await exigirSessao();
  const a = await db.automation.findUnique({ where: { id } });
  if (!a) return { erro: "Automação não encontrada." };
  if (a.status !== "ACTIVE") {
    const problemas = validarAutomacao(a.triggerType, a.triggerConfig as unknown as TriggerConfig, a.flow as unknown as Flow);
    if (temErro(problemas)) return { erro: "Corrija os erros no editor antes de ativar." };
  }
  await db.automation.update({ where: { id }, data: { status: a.status === "ACTIVE" ? "PAUSED" : "ACTIVE" } });
  revalidatePath("/automacoes");
  revalidatePath("/");
  return {};
}

export async function duplicar(id: string) {
  await exigirSessao();
  const a = await db.automation.findUnique({ where: { id } });
  if (!a) return;
  const nova = await db.automation.create({
    data: {
      accountId: a.accountId,
      name: `${a.name} (cópia)`,
      triggerType: a.triggerType,
      triggerConfig: a.triggerConfig as Prisma.InputJsonValue,
      flow: a.flow as Prisma.InputJsonValue,
      priority: a.priority,
      status: "DRAFT",
    },
  });
  redirect(`/automacoes/${nova.id}`);
}

export async function excluir(id: string) {
  await exigirSessao();
  await db.automation.delete({ where: { id } }).catch(() => undefined);
  revalidatePath("/automacoes");
  redirect("/automacoes");
}
