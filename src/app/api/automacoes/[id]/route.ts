import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { contaAtual } from "@/lib/account";
import { guardaApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { esquemaSalvar } from "@/lib/engine/schema";
import { TRIGGER_NODE_ID, type Flow, type TriggerConfig } from "@/lib/engine/types";
import { temErro, validarAutomacao } from "@/lib/engine/validate";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const barrado = await guardaApi(req);
  if (barrado) return barrado;
  const { id } = await params;
  const conta = await contaAtual();
  const atual = await db.automation.findFirst({ where: { id, accountId: conta.id } });
  if (!atual) return NextResponse.json({ erro: "Automação não encontrada." }, { status: 404 });

  const r = esquemaSalvar.safeParse(await req.json().catch(() => null));
  if (!r.success) {
    return NextResponse.json({ erro: `Dados inválidos: ${r.error.issues[0]?.path.join(".")} — ${r.error.issues[0]?.message}` }, { status: 400 });
  }
  const { name, triggerType, triggerConfig, flow, priority } = r.data;
  if (!flow.nodes.some((n) => n.id === TRIGGER_NODE_ID && n.type === "trigger")) {
    return NextResponse.json({ erro: "O fluxo precisa do nó de gatilho." }, { status: 400 });
  }

  // Ativa com erro não roda: pausa e avisa.
  const problemas = validarAutomacao(triggerType, triggerConfig as TriggerConfig, flow as Flow);
  const pausar = atual.status === "ACTIVE" && temErro(problemas);

  const salvo = await db.automation.update({
    where: { id },
    data: {
      name,
      triggerType,
      triggerConfig: triggerConfig as Prisma.InputJsonValue,
      flow: flow as unknown as Prisma.InputJsonValue,
      ...(priority !== undefined ? { priority } : {}),
      ...(pausar ? { status: "PAUSED" } : {}),
    },
  });
  return NextResponse.json({
    ok: true,
    status: salvo.status,
    problemas,
    aviso: pausar ? "Salvo, mas a automação foi PAUSADA porque tem erro. Corrija e ative de novo." : undefined,
  });
}
