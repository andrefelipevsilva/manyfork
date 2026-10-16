import { NextResponse } from "next/server";
import { z } from "zod";
import { contaAtual } from "@/lib/account";
import { guardaApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { janelaAberta } from "@/lib/engine/runner";
import { PREFIXO_SIMULADO } from "@/lib/engine/transport";
import { drenarChave } from "@/lib/jobs";
import { enfileirar } from "@/lib/queue";

async function contatoDaConta(id: string) {
  const conta = await contaAtual();
  const contato = await db.contact.findFirst({ where: { id, accountId: conta.id } });
  return { conta, contato };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const barrado = await guardaApi(req);
  if (barrado) return barrado;
  const { contato } = await contatoDaConta((await params).id);
  if (!contato) return NextResponse.json({ erro: "Contato não encontrado." }, { status: 404 });
  const mensagens = await db.message.findMany({ where: { contactId: contato.id }, orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({
    janelaAberta: janelaAberta(contato),
    pausada: contato.automationPaused,
    mensagens: mensagens.reverse().map((m) => ({
      id: m.id,
      direction: m.direction,
      kind: m.kind,
      text: m.text,
      payload: m.payload,
      error: m.error,
      external: m.external,
      enviada: m.direction === "IN" || Boolean(m.mid) || Boolean(m.error),
      createdAt: m.createdAt,
    })),
  });
}

const corpo = z.object({ texto: z.string().trim().min(1).max(1000) });

/** Resposta manual pela caixa de entrada. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const barrado = await guardaApi(req);
  if (barrado) return barrado;
  const { conta, contato } = await contatoDaConta((await params).id);
  if (!contato) return NextResponse.json({ erro: "Contato não encontrado." }, { status: 404 });
  const r = corpo.safeParse(await req.json().catch(() => null));
  if (!r.success) return NextResponse.json({ erro: "Mensagem vazia ou longa demais." }, { status: 400 });
  if (!janelaAberta(contato)) {
    return NextResponse.json({ erro: "Passaram 24 h desde a última mensagem da pessoa: a Meta só deixa responder depois que ela escrever de novo." }, { status: 409 });
  }
  const simulado = conta.simulated || contato.igsid.startsWith(PREFIXO_SIMULADO);
  const m = await db.message.create({
    data: { accountId: conta.id, contactId: contato.id, direction: "OUT", kind: "manual", text: r.data.texto, simulated: simulado },
  });
  const chave = `contato:${conta.igUserId}:${contato.igsid}`;
  await enfileirar("manual.send", { messageId: m.id }, { lockKey: chave, maxAttempts: 3 });
  if (simulado) await drenarChave(chave);
  return NextResponse.json({ ok: true, id: m.id });
}

/** Pausa ou retoma a automação pra este contato. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const barrado = await guardaApi(req);
  if (barrado) return barrado;
  const { contato } = await contatoDaConta((await params).id);
  if (!contato) return NextResponse.json({ erro: "Contato não encontrado." }, { status: 404 });
  const j = (await req.json().catch(() => ({}))) as { pausada?: boolean };
  await db.contact.update({ where: { id: contato.id }, data: { automationPaused: Boolean(j.pausada) } });
  return NextResponse.json({ ok: true });
}
