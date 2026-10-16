import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { contaAtual } from "@/lib/account";
import { guardaApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { PREFIXO_SIMULADO } from "@/lib/engine/transport";
import type { ItemEntrada } from "@/lib/instagram/webhook";
import { drenarChave } from "@/lib/jobs";
import { enfileirar } from "@/lib/queue";

// Simulador: cria eventos falsos no mesmo formato da Meta e processa na hora
// (sem depender do worker). Contatos simulados têm IGSID "sim_..." e nada sai
// pra Meta.

const acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("novo_contato"), username: z.string().trim().min(1).max(40), segue: z.boolean() }),
  z.object({ acao: z.literal("segue"), contatoId: z.string(), segue: z.boolean() }),
  z.object({ acao: z.literal("apagar"), contatoId: z.string() }),
  z.object({ acao: z.literal("comentar"), contatoId: z.string(), texto: z.string().max(2000), mediaId: z.string().max(64), automacaoId: z.string().optional() }),
  z.object({ acao: z.literal("dm"), contatoId: z.string(), texto: z.string().max(2000), automacaoId: z.string().optional() }),
  z.object({ acao: z.literal("story"), contatoId: z.string(), texto: z.string().max(2000), automacaoId: z.string().optional() }),
  z.object({ acao: z.literal("mencao"), contatoId: z.string(), automacaoId: z.string().optional() }),
  z.object({ acao: z.literal("clique"), contatoId: z.string(), payload: z.string().max(1000), titulo: z.string().max(80) }),
  z.object({ acao: z.literal("rapida"), contatoId: z.string(), payload: z.string().max(1000), titulo: z.string().max(80) }),
]);

const id = (p: string) => `${p}${randomBytes(8).toString("hex")}`;
const chave = (igUserId: string, igsid: string) => `contato:${igUserId}:${igsid}`;

async function contatoSimulado(contaId: string, contatoId: string) {
  const c = await db.contact.findFirst({ where: { id: contatoId, accountId: contaId, igsid: { startsWith: PREFIXO_SIMULADO } } });
  if (!c) throw new Error("Contato simulado não encontrado.");
  return c;
}

export async function GET(req: Request) {
  const barrado = await guardaApi(req);
  if (barrado) return barrado;
  const conta = await contaAtual();
  const contatoId = new URL(req.url).searchParams.get("contato");

  const contatos = await db.contact.findMany({
    where: { accountId: conta.id, igsid: { startsWith: PREFIXO_SIMULADO } },
    orderBy: { createdAt: "desc" },
    select: { id: true, username: true, fields: true, email: true },
  });
  if (!contatoId) return NextResponse.json({ contatos });

  const contato = await db.contact.findFirst({
    where: { id: contatoId, accountId: conta.id, igsid: { startsWith: PREFIXO_SIMULADO } },
    include: { tags: { include: { tag: true } } },
  });
  if (!contato) return NextResponse.json({ contatos, contato: null });

  // Roda o que já venceu (esperas curtas, resposta pública) a cada consulta.
  await drenarChave(chave(conta.igUserId, contato.igsid));

  const [mensagens, comentarios, execucoes, pendentes] = await Promise.all([
    db.message.findMany({ where: { contactId: contato.id }, orderBy: { createdAt: "asc" }, take: 300 }),
    db.comment.findMany({ where: { accountId: conta.id, fromIgsid: contato.igsid }, orderBy: { createdAt: "asc" }, take: 50 }),
    db.flowRun.findMany({ where: { contactId: contato.id }, orderBy: { createdAt: "desc" }, take: 10, include: { automation: { select: { name: true } } } }),
    db.job.count({ where: { lockKey: chave(conta.igUserId, contato.igsid), status: "PENDING" } }),
  ]);

  return NextResponse.json({
    contatos,
    contato: {
      id: contato.id,
      username: contato.username,
      email: contato.email,
      phone: contato.phone,
      fields: contato.fields,
      segue: (contato.fields as Record<string, unknown>)?.sim_segue === true,
      tags: contato.tags.map((t) => t.tag.name),
    },
    mensagens: mensagens.map((m) => ({ id: m.id, direction: m.direction, kind: m.kind, text: m.text, payload: m.payload, error: m.error, createdAt: m.createdAt })),
    comentarios: comentarios.map((c) => ({ id: c.id, text: c.text, publicReplyText: c.publicReplyText, createdAt: c.createdAt })),
    execucoes: execucoes.map((r) => ({ id: r.id, automacao: r.automation.name, status: r.status, error: r.error, createdAt: r.createdAt })),
    pendentes,
  });
}

export async function POST(req: Request) {
  const barrado = await guardaApi(req);
  if (barrado) return barrado;
  const r = acao.safeParse(await req.json().catch(() => null));
  if (!r.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const a = r.data;
  const conta = await contaAtual();

  try {
    if (a.acao === "novo_contato") {
      const c = await db.contact.create({
        data: { accountId: conta.id, igsid: id(PREFIXO_SIMULADO), username: a.username.replace(/^@/, ""), source: "simulador", fields: { sim_segue: a.segue } },
      });
      return NextResponse.json({ contatoId: c.id });
    }

    const contato = await contatoSimulado(conta.id, a.contatoId);

    if (a.acao === "apagar") {
      await db.comment.deleteMany({ where: { accountId: conta.id, fromIgsid: contato.igsid } });
      await db.job.deleteMany({ where: { lockKey: chave(conta.igUserId, contato.igsid) } });
      await db.contact.delete({ where: { id: contato.id } });
      return NextResponse.json({ ok: true });
    }
    if (a.acao === "segue") {
      const campos = { ...((contato.fields ?? {}) as Record<string, unknown>), sim_segue: a.segue };
      await db.contact.update({ where: { id: contato.id }, data: { fields: campos as Prisma.InputJsonValue } });
      return NextResponse.json({ ok: true });
    }

    const agora = Date.now();
    let item: ItemEntrada;
    switch (a.acao) {
      case "comentar":
        item = {
          kind: "comment",
          accountIgId: conta.igUserId,
          commentId: id("sim_c_"),
          mediaId: a.mediaId,
          mediaProductType: "REELS",
          fromId: contato.igsid,
          fromUsername: contato.username ?? undefined,
          text: a.texto,
          timestamp: agora,
          simAutomacaoId: a.automacaoId,
        };
        break;
      case "dm":
        item = { kind: "message", accountIgId: conta.igUserId, senderId: contato.igsid, mid: id("sim_in_"), text: a.texto, timestamp: agora, simAutomacaoId: a.automacaoId };
        break;
      case "story":
        item = {
          kind: "message",
          accountIgId: conta.igUserId,
          senderId: contato.igsid,
          mid: id("sim_in_"),
          text: a.texto,
          replyToStory: { id: "sim_story", url: "" },
          timestamp: agora,
          simAutomacaoId: a.automacaoId,
        };
        break;
      case "mencao":
        item = {
          kind: "message",
          accountIgId: conta.igUserId,
          senderId: contato.igsid,
          mid: id("sim_in_"),
          storyMention: { url: "" },
          attachments: [{ type: "story_mention" }],
          timestamp: agora,
          simAutomacaoId: a.automacaoId,
        };
        break;
      case "clique":
        item = { kind: "postback", accountIgId: conta.igUserId, senderId: contato.igsid, mid: id("sim_pb_"), payload: a.payload, title: a.titulo, timestamp: agora };
        break;
      case "rapida":
        item = { kind: "message", accountIgId: conta.igUserId, senderId: contato.igsid, mid: id("sim_in_"), text: a.titulo, quickReplyPayload: a.payload, timestamp: agora };
        break;
    }
    const k = chave(conta.igUserId, contato.igsid);
    await enfileirar("inbound", { item } as unknown as Prisma.InputJsonValue, { lockKey: k });
    await drenarChave(k);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
