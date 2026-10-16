import type { Job, Prisma } from "@prisma/client";
import { contaReal } from "./account";
import { cifrar, decifrar } from "./crypto";
import { db } from "./db";
import { processarItem } from "./engine/router";
import { STATUS_TERMINAIS, avancar, type Entrada } from "./engine/runner";
import { ehSimulado, transportePara } from "./engine/transport";
import type { TriggerConfig } from "./engine/types";
import { GraphError } from "./instagram/graph";
import { renovarToken } from "./instagram/oauth";
import { chaveDoContato, extrairItens, type ItemEntrada } from "./instagram/webhook";
import { concluir, enfileirar, falhar, pegarProximoDaChave } from "./queue";
import { lerConfiguracoes } from "./settings";

// O que cada tipo de job faz. O laço que pega da fila fica em src/worker.

export async function executarJob(job: Job): Promise<void> {
  const p = job.payload as Record<string, unknown>;
  switch (job.type) {
    case "webhook":
      return jobWebhook(String(p.webhookEventId));
    case "inbound":
      return processarItem(p.item as ItemEntrada);
    case "run.advance":
      return jobAvancar(p as { runId: string; entrada?: Entrada; esperado?: { noId: string; status: string } });
    case "comment.reply":
      return jobRespostaPublica(String(p.commentId), String(p.automationId));
    case "contact.profile":
      return jobPerfil(String(p.contactId));
    case "manual.send":
      return jobEnvioManual(String(p.messageId));
    default:
      throw new Error(`Tipo de job desconhecido: ${job.type}`);
  }
}

/** Quebra o webhook em itens e enfileira um job por item, travado por contato. */
async function jobWebhook(id: string) {
  const ev = await db.webhookEvent.findUnique({ where: { id } });
  if (!ev || ev.processedAt) return;
  const itens = extrairItens(ev.payload);
  for (const item of itens) {
    await enfileirar("inbound", { item } as unknown as Prisma.InputJsonValue, { lockKey: chaveDoContato(item) });
  }
  await db.webhookEvent.update({ where: { id }, data: { processedAt: new Date() } });
}

async function jobAvancar(p: { runId: string; entrada?: Entrada; esperado?: { noId: string; status: string } }) {
  if (p.esperado) {
    const run = await db.flowRun.findUnique({ where: { id: p.runId } });
    // Job de espera velho (o fluxo já andou ou foi cancelado): ignora.
    if (!run || run.currentNodeId !== p.esperado.noId || run.status !== p.esperado.status) return;
    return avancar(p.runId, p.entrada ?? { tipo: "retomar" });
  }
  return avancar(p.runId, p.entrada);
}

async function jobRespostaPublica(commentId: string, automationId: string) {
  const comentario = await db.comment.findUnique({ where: { id: commentId } });
  const automacao = await db.automation.findUnique({ where: { id: automationId }, include: { account: true } });
  if (!comentario || !automacao || comentario.publicReplyId) return;
  const frases = ((automacao.triggerConfig as unknown as TriggerConfig).publicReplies ?? []).map((f) => f.trim()).filter(Boolean);
  if (!frases.length) return;

  const conta = automacao.account;
  const contato = await db.contact.findUnique({ where: { accountId_igsid: { accountId: conta.id, igsid: comentario.fromIgsid } } });
  const simulado = ehSimulado(conta, contato);
  if (!simulado) {
    const cfg = await lerConfiguracoes();
    const naHora = await db.event.count({
      where: { accountId: conta.id, type: "PUBLIC_REPLY", simulated: false, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (naHora >= cfg.limiteRespostasPublicasHora) {
      // Passou do limite: tenta mais tarde (sem gastar tentativa).
      await enfileirar("comment.reply", { commentId, automationId }, { runAt: new Date(Date.now() + 10 * 60_000), maxAttempts: 3 });
      return;
    }
  }

  const frase = frases[Math.floor(Math.random() * frases.length)];
  try {
    const r = await transportePara(conta, contato).responderComentario(conta, commentId, frase);
    await db.comment.update({ where: { id: commentId }, data: { publicReplyId: r.id, publicReplyText: frase, publicReplyError: null } });
    await db.event.create({
      data: { accountId: conta.id, automationId, contactId: contato?.id, type: "PUBLIC_REPLY", simulated: simulado, meta: { commentId } },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.comment.update({ where: { id: commentId }, data: { publicReplyError: msg.slice(0, 500) } });
    // Erro passageiro: deixa o job tentar de novo. Erro da Meta (4xx): desiste.
    if (!(e instanceof GraphError) || e.status >= 500 || e.limiteDeTaxa) throw e;
  }
}

async function jobPerfil(contactId: string) {
  const contato = await db.contact.findUnique({ where: { id: contactId }, include: { account: true } });
  if (!contato || ehSimulado(contato.account, contato)) return;
  try {
    const perfil = await transportePara(contato.account, contato).perfil(contato.account, contato);
    await db.contact.update({
      where: { id: contactId },
      data: {
        name: perfil.name ?? contato.name,
        username: perfil.username ?? contato.username,
        profilePic: perfil.profile_pic ?? contato.profilePic,
        followerCount: perfil.follower_count ?? contato.followerCount,
        followsUs: perfil.is_user_follow_business ?? contato.followsUs,
        profileFetchedAt: new Date(),
      },
    });
  } catch (e) {
    // Sem consentimento ainda, conta bloqueada etc.: marca pra não tentar já.
    await db.contact.update({ where: { id: contactId }, data: { profileFetchedAt: new Date() } });
    if (!(e instanceof GraphError)) throw e;
  }
}

/** Mensagem escrita à mão na caixa de entrada do painel. */
async function jobEnvioManual(messageId: string) {
  const m = await db.message.findUnique({ where: { id: messageId }, include: { contact: { include: { account: true } } } });
  if (!m || m.mid || m.error || !m.text) return;
  const conta = m.contact.account;
  try {
    const r = await transportePara(conta, m.contact).enviar(conta, { id: m.contact.igsid }, { text: m.text });
    await db.message.update({ where: { id: m.id }, data: { mid: r.mid ?? null } });
    await db.contact.update({ where: { id: m.contact.id }, data: { lastOutboundAt: new Date() } });
  } catch (e) {
    if (!(e instanceof GraphError) || e.status >= 500) throw e;
    await db.message.update({ where: { id: m.id }, data: { error: `Meta ${e.code ?? e.status}: ${e.message}`.slice(0, 1000) } });
  }
}

/** Executa já os jobs vencidos de uma chave (contato). Usado pelo simulador. */
export async function drenarChave(lockKey: string, limite = 30) {
  for (let i = 0; i < limite; i++) {
    const job = await pegarProximoDaChave(lockKey);
    if (!job) return;
    try {
      await executarJob(job);
      await concluir(job.id);
    } catch (e) {
      await falhar(job, e);
    }
  }
}

// --- manutenção (o worker chama de tempos em tempos) ---

const DIA = 24 * 60 * 60 * 1000;

export async function manutencao(agora = Date.now()) {
  // Prazos de espera vencidos
  await db.flowRun.updateMany({
    where: { status: "WAITING_INPUT", waitingUntil: { lt: new Date(agora) } },
    data: { status: "EXPIRED", finishedAt: new Date(agora), waitingUntil: null },
  });
  await db.flowRun.updateMany({
    where: { status: "WAITING_INBOUND", waitingUntil: { lt: new Date(agora) } },
    data: { status: "EXPIRED", finishedAt: new Date(agora), waitingUntil: null },
  });
  await db.flowRun.updateMany({
    where: { status: "WAITING_BUTTON", updatedAt: { lt: new Date(agora - 30 * DIA) } },
    data: { status: "EXPIRED", finishedAt: new Date(agora) },
  });
  // Execução "RUNNING" sem job pendente há mais de 1 h = o job desistiu.
  const parados = await db.flowRun.findMany({
    where: { status: "RUNNING", updatedAt: { lt: new Date(agora - 60 * 60 * 1000) } },
    select: { id: true },
    take: 200,
  });
  for (const r of parados) {
    const pendente = await db.job.count({
      where: { type: "run.advance", status: { in: ["PENDING", "RUNNING"] }, payload: { path: ["runId"], equals: r.id } },
    });
    if (!pendente) {
      await db.flowRun.update({
        where: { id: r.id },
        data: { status: "FAILED", error: "Parou no meio (o envio falhou várias vezes).", finishedAt: new Date(agora) },
      });
    }
  }

  // Limpeza
  await db.job.deleteMany({ where: { status: "DONE", finishedAt: { lt: new Date(agora - 7 * DIA) } } });
  await db.webhookEvent.deleteMany({ where: { processedAt: { lt: new Date(agora - 30 * DIA) } } });
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(agora - 30 * DIA) } } });

  // Token: renova quando faltar menos de 20 dias (a Meta exige mais de 24 h de idade).
  const conta = await contaReal();
  if (conta && conta.tokenExpiresAt.getTime() - agora < 20 * DIA && agora - conta.tokenRefreshedAt.getTime() > DIA) {
    try {
      const novo = await renovarToken(decifrar(conta.accessTokenEnc));
      await db.account.update({
        where: { id: conta.id },
        data: { accessTokenEnc: cifrar(novo.accessToken), tokenExpiresAt: novo.expiraEm, tokenRefreshedAt: new Date() },
      });
      console.log(`[manutencao] token do @${conta.username} renovado até ${novo.expiraEm.toISOString()}`);
    } catch (e) {
      console.error("[manutencao] falha ao renovar o token:", e);
    }
  }
}

export { STATUS_TERMINAIS };
