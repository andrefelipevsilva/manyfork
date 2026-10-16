import type { Account, Automation, Contact, FlowRun } from "@prisma/client";
import { db } from "../db";
import type { ItemEntrada } from "../instagram/webhook";
import { enfileirar } from "../queue";
import { lerConfiguracoes } from "../settings";
import { bateComPalavraChave, normalizar } from "./keywords";
import { BOTAO_GATE, avancar, destinoDe, iniciarRun, lerPayload } from "./runner";
import { PREFIXO_SIMULADO, ehSimulado } from "./transport";
import type { Flow, NodeDataMap, TriggerConfig } from "./types";

// Decide o que fazer com cada evento que chega da Meta (ou do simulador).
// Roda dentro da trava do contato (job "inbound").

const PERFIL_VALIDADE_MS = 24 * 60 * 60 * 1000;

export async function processarItem(item: ItemEntrada): Promise<void> {
  const conta = await db.account.findUnique({ where: { igUserId: item.accountIgId } });
  if (!conta) return;
  switch (item.kind) {
    case "comment":
      return tratarComentario(conta, item);
    case "message":
      return tratarMensagem(conta, item);
    case "postback":
      return tratarPostback(conta, item);
    case "echo":
      return tratarEco(conta, item);
  }
}

async function contatoPor(conta: Account, igsid: string, dados: { username?: string; source: string }): Promise<Contact> {
  return db.contact.upsert({
    where: { accountId_igsid: { accountId: conta.id, igsid } },
    create: { accountId: conta.id, igsid, username: dados.username, source: dados.source },
    update: dados.username ? { username: dados.username } : {},
  });
}

async function marcarEntrada(contato: Contact, quando: number): Promise<Contact> {
  const t = new Date(Math.min(quando, Date.now()));
  if (contato.lastInboundAt && contato.lastInboundAt >= t) return contato;
  return db.contact.update({ where: { id: contato.id }, data: { lastInboundAt: t } });
}

async function talvezBuscarPerfil(conta: Account, contato: Contact) {
  if (ehSimulado(conta, contato)) return;
  if (contato.profileFetchedAt && Date.now() - contato.profileFetchedAt.getTime() < PERFIL_VALIDADE_MS) return;
  await enfileirar("contact.profile", { contactId: contato.id }, { maxAttempts: 2 });
}

/**
 * Automações que podem disparar. No simulador, a automação em teste entra
 * mesmo em rascunho/pausada (só pro contato simulado).
 */
async function ativas(conta: Account, triggerType: Automation["triggerType"], emTeste?: string) {
  const lista = await db.automation.findMany({
    where: { accountId: conta.id, triggerType, OR: [{ status: "ACTIVE" }, ...(emTeste ? [{ id: emTeste }] : [])] },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  // A automação em teste tem preferência sobre as outras.
  return emTeste ? [...lista.filter((a) => a.id === emTeste), ...lista.filter((a) => a.id !== emTeste)] : lista;
}

function automacaoEmTeste(item: ItemEntrada, contato: Contact): string | undefined {
  return contato.igsid.startsWith(PREFIXO_SIMULADO) && "simAutomacaoId" in item ? item.simAutomacaoId : undefined;
}

async function emEspera(automacao: Automation, contato: Contact): Promise<boolean> {
  const cfg = automacao.triggerConfig as unknown as TriggerConfig;
  const minutos = cfg.cooldownMinutes ?? (automacao.triggerType === "DEFAULT_REPLY" ? 24 * 60 : 0);
  if (!minutos) return false;
  const recente = await db.flowRun.findFirst({
    where: { automationId: automacao.id, contactId: contato.id, createdAt: { gte: new Date(Date.now() - minutos * 60_000) } },
    select: { id: true },
  });
  return Boolean(recente);
}

// --- comentário ---

async function tratarComentario(conta: Account, item: Extract<ItemEntrada, { kind: "comment" }>) {
  // A própria conta respondendo (inclusive a resposta pública do manyfork).
  if (item.fromId === conta.igUserId || (item.fromUsername && item.fromUsername === conta.username)) return;
  if (await db.comment.findUnique({ where: { id: item.commentId } })) return; // reentrega

  const contato = await contatoPor(conta, item.fromId, { username: item.fromUsername, source: "comentario" });
  await db.comment.create({
    data: {
      id: item.commentId,
      accountId: conta.id,
      mediaId: item.mediaId,
      mediaProductType: item.mediaProductType,
      fromIgsid: item.fromId,
      fromUsername: item.fromUsername,
      text: item.text,
      parentId: item.parentId,
      createdAt: new Date(item.timestamp),
    },
  });

  const automacao = (await ativas(conta, "COMMENT", automacaoEmTeste(item, contato))).find((a) => {
    const cfg = a.triggerConfig as unknown as TriggerConfig;
    const midiaOk = cfg.mediaScope !== "specific" || (cfg.mediaIds ?? []).includes(item.mediaId);
    const respostaOk = cfg.includeReplies || !item.parentId;
    return midiaOk && respostaOk && bateComPalavraChave(item.text, cfg.keywords, cfg.match);
  });
  if (!automacao) return;

  await db.comment.update({ where: { id: item.commentId }, data: { automationId: automacao.id } });
  if (contato.automationPaused || (await emEspera(automacao, contato))) return;

  const cfg = automacao.triggerConfig as unknown as TriggerConfig;
  if (cfg.publicReplyEnabled && (cfg.publicReplies ?? []).some((r) => r.trim())) {
    const conf = await lerConfiguracoes();
    const simulado = ehSimulado(conta, contato);
    const min = simulado ? 0 : conf.atrasoRespostaPublicaMin;
    const max = simulado ? 1 : Math.max(conf.atrasoRespostaPublicaMax, min);
    const atraso = (min + Math.random() * (max - min)) * 1000;
    await enfileirar(
      "comment.reply",
      { commentId: item.commentId, automationId: automacao.id },
      { runAt: new Date(Date.now() + atraso), maxAttempts: 3, lockKey: `contato:${conta.igUserId}:${contato.igsid}` },
    );
  }

  await iniciarRun(automacao, contato, { commentId: item.commentId, commentCreatedAt: new Date(item.timestamp) });
}

// --- cliques ---

/** Devolve true se o payload era de um botão do manyfork. */
async function tratarClique(conta: Account, contato: Contact, payload: string | undefined): Promise<boolean> {
  const p = lerPayload(payload);
  if (!p) return false;
  const run = await db.flowRun.findUnique({ where: { id: p.runId }, include: { automation: true } });
  if (!run || run.contactId !== contato.id) return true;

  if (run.status === "WAITING_BUTTON" && run.currentNodeId === p.noId) {
    await avancar(run.id, { tipo: "clique", noId: p.noId, botaoId: p.botaoId });
    return true;
  }

  // Botão de mensagem antiga: segue a partir do destino daquele botão numa
  // execução nova (como no ManyChat, botão velho continua funcionando).
  if (run.automation.status !== "ACTIVE" || contato.automationPaused) return true;
  const flow = run.automation.flow as unknown as Flow;
  const no = flow.nodes.find((n) => n.id === p.noId);
  if (!no) return true;
  if (no.type === "followGate" && p.botaoId === BOTAO_GATE) {
    await iniciarRun(run.automation, contato, { inicio: no.id });
    return true;
  }
  const destino = destinoDe(flow, no.id, `btn:${p.botaoId}`);
  if (destino) await iniciarRun(run.automation, contato, { inicio: destino.id });
  return true;
}

/** Texto digitado igual ao título de um botão conta como clique (desktop não mostra resposta rápida). */
async function textoComoClique(contato: Contact, texto: string): Promise<{ run: FlowRun; noId: string; botaoId: string } | null> {
  const alvo = normalizar(texto);
  if (!alvo) return null;
  const esperando = await db.flowRun.findMany({
    where: { contactId: contato.id, status: "WAITING_BUTTON" },
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: { automation: true },
  });
  for (const run of esperando) {
    const flow = run.automation.flow as unknown as Flow;
    const no = flow.nodes.find((n) => n.id === run.currentNodeId);
    if (!no) continue;
    if (no.type === "message") {
      const d = no.data as NodeDataMap["message"];
      const b = [...d.buttons.filter((x) => x.kind === "next"), ...d.quickReplies].find((x) => normalizar(x.title) === alvo);
      if (b) return { run, noId: no.id, botaoId: b.id };
    } else if (no.type === "followGate") {
      const d = no.data as NodeDataMap["followGate"];
      if (normalizar(d.buttonTitle) === alvo) return { run, noId: no.id, botaoId: BOTAO_GATE };
    }
  }
  return null;
}

// --- mensagens ---

function tipoDaMensagem(item: Extract<ItemEntrada, { kind: "message" }>): string {
  if (item.quickReplyPayload) return "clique";
  if (item.storyMention) return "mencao_story";
  if (item.replyToStory) return "resposta_story";
  if (item.text) return "texto";
  return item.attachments?.[0]?.type ?? "anexo";
}

async function tratarMensagem(conta: Account, item: Extract<ItemEntrada, { kind: "message" }>) {
  if (await db.message.findUnique({ where: { mid: item.mid } })) return; // reentrega
  let contato = await contatoPor(conta, item.senderId, { source: item.storyMention ? "mencao_story" : item.replyToStory ? "story" : "direct" });
  contato = await marcarEntrada(contato, item.timestamp);
  const simulado = ehSimulado(conta, contato);
  await db.message.create({
    data: {
      accountId: conta.id,
      contactId: contato.id,
      direction: "IN",
      mid: item.mid,
      kind: tipoDaMensagem(item),
      text: item.text ?? item.storyMention?.url ?? item.attachments?.[0]?.url ?? null,
      payload: { replyToStory: item.replyToStory, attachments: item.attachments, quickReply: item.quickReplyPayload } as object,
      simulated: simulado,
      createdAt: new Date(item.timestamp),
    },
  });
  await talvezBuscarPerfil(conta, contato);

  if (item.quickReplyPayload && (await tratarClique(conta, contato, item.quickReplyPayload))) return;
  if (contato.automationPaused) return;

  const emTeste = automacaoEmTeste(item, contato);

  if (item.storyMention) {
    for (const a of await ativas(conta, "STORY_MENTION", emTeste)) {
      if (!(await emEspera(a, contato))) {
        await iniciarRun(a, contato);
        return;
      }
    }
    return;
  }

  const texto = item.text ?? "";

  if (item.replyToStory) {
    const a = (await ativas(conta, "STORY_REPLY", emTeste)).find((x) => {
      const cfg = x.triggerConfig as unknown as TriggerConfig;
      return bateComPalavraChave(texto, cfg.keywords, cfg.match);
    });
    if (a) {
      if (!(await emEspera(a, contato))) await iniciarRun(a, contato);
      return;
    }
  }

  await tratarTexto(conta, contato, texto, emTeste);
}

async function tratarTexto(conta: Account, contato: Contact, texto: string, emTeste?: string) {
  // 1. resposta a uma pergunta do fluxo
  if (texto) {
    const pergunta = await db.flowRun.findFirst({
      where: { contactId: contato.id, status: "WAITING_INPUT" },
      orderBy: { updatedAt: "desc" },
    });
    if (pergunta) {
      await avancar(pergunta.id, { tipo: "texto", texto });
      return;
    }
    // 2. digitou o título de um botão
    const clique = await textoComoClique(contato, texto);
    if (clique) {
      await avancar(clique.run.id, { tipo: "clique", noId: clique.noId, botaoId: clique.botaoId });
      return;
    }
    // 3. palavra-chave no direct
    const a = (await ativas(conta, "DM_KEYWORD", emTeste)).find((x) => {
      const cfg = x.triggerConfig as unknown as TriggerConfig;
      return bateComPalavraChave(texto, cfg.keywords, cfg.match);
    });
    if (a && !(await emEspera(a, contato))) {
      await iniciarRun(a, contato);
      return;
    }
  }
  // 4. fluxo travado esperando a janela reabrir
  const travado = await db.flowRun.findFirst({
    where: { contactId: contato.id, status: "WAITING_INBOUND" },
    orderBy: { updatedAt: "desc" },
  });
  if (travado) {
    await avancar(travado.id);
    return;
  }
  // 5. resposta padrão
  for (const padrao of await ativas(conta, "DEFAULT_REPLY", emTeste)) {
    if (!(await emEspera(padrao, contato))) {
      await iniciarRun(padrao, contato);
      return;
    }
  }
}

async function tratarPostback(conta: Account, item: Extract<ItemEntrada, { kind: "postback" }>) {
  if (item.mid && (await db.message.findUnique({ where: { mid: item.mid } }))) return;
  let contato = await contatoPor(conta, item.senderId, { source: "direct" });
  contato = await marcarEntrada(contato, item.timestamp);
  await db.message.create({
    data: {
      accountId: conta.id,
      contactId: contato.id,
      direction: "IN",
      mid: item.mid ?? null,
      kind: "clique",
      text: item.title ?? null,
      payload: { postback: item.payload },
      simulated: ehSimulado(conta, contato),
      createdAt: new Date(item.timestamp),
    },
  });
  await talvezBuscarPerfil(conta, contato);
  if (await tratarClique(conta, contato, item.payload)) return;
  if (contato.automationPaused) return;
  // Postback que não é do manyfork (ex.: quebra-gelo): trata o título como texto.
  await tratarTexto(conta, contato, item.title ?? item.payload);
}

async function tratarEco(conta: Account, item: Extract<ItemEntrada, { kind: "echo" }>) {
  if (await db.message.findUnique({ where: { mid: item.mid } })) return; // eco de mensagem do próprio manyfork
  const contato = await contatoPor(conta, item.recipientId, { source: "direct" });
  await db.message.create({
    data: {
      accountId: conta.id,
      contactId: contato.id,
      direction: "OUT",
      mid: item.mid,
      kind: "manual",
      text: item.text ?? null,
      external: true,
      simulated: ehSimulado(conta, contato),
      createdAt: new Date(item.timestamp),
    },
  });
  const cfg = await lerConfiguracoes();
  if (cfg.pausarAoResponderManual && !contato.automationPaused) {
    await db.contact.update({ where: { id: contato.id }, data: { automationPaused: true } });
  }
}
