import { Prisma, type Account, type Automation, type Contact, type EventType, type FlowRun, type RunStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { adicionarAoBrevo } from "../brevo";
import { db } from "../db";
import { env } from "../env";
import { GraphError, type Destinatario, type MensagemMeta } from "../instagram/graph";
import { enfileirar } from "../queue";
import { lerConfiguracoes } from "../settings";
import { normalizar } from "./keywords";
import { renderizar } from "./render";
import { ehSimulado, transportePara } from "./transport";
import { TRIGGER_NODE_ID, mensagemTemRamos, type Flow, type FlowNode, type NodeDataMap } from "./types";

// Executa um fluxo nó a nó até ele precisar esperar (clique, resposta,
// tempo ou a pessoa escrever). Sempre roda dentro da trava do contato.

export const JANELA_MS = 24 * 60 * 60 * 1000;
const MARGEM_JANELA_MS = 2 * 60 * 1000;
const RESPOSTA_PRIVADA_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PASSOS = 60;

export const STATUS_TERMINAIS: RunStatus[] = ["DONE", "FAILED", "CANCELLED", "EXPIRED"];

export type Entrada =
  | { tipo: "clique"; noId: string; botaoId: string }
  | { tipo: "texto"; texto: string }
  | { tipo: "retomar" };

type Resultado =
  | { tipo: "seguir"; saida: string }
  | { tipo: "esperar"; status: "WAITING_BUTTON" | "WAITING_INPUT" | "WAITING_DELAY"; ate?: Date }
  | { tipo: "bloqueado" }
  | { tipo: "adiar"; ate: Date }
  | { tipo: "falhou"; erro: string }
  | { tipo: "ignorar" };

type EstadoRun = { tentativas?: Record<string, number> };

type Ctx = {
  run: FlowRun;
  automacao: Automation;
  conta: Account;
  contato: Contact;
  flow: Flow;
  estado: EstadoRun;
  simulado: boolean;
};

// --- payload dos botões ---

const PREFIXO_PAYLOAD = "mf1";

export function payloadBotao(runId: string, noId: string, botaoId: string): string {
  return [PREFIXO_PAYLOAD, runId, noId, botaoId].join(":");
}

export function lerPayload(p: string | undefined | null): { runId: string; noId: string; botaoId: string } | null {
  if (!p) return null;
  const partes = p.split(":");
  if (partes.length !== 4 || partes[0] !== PREFIXO_PAYLOAD) return null;
  return { runId: partes[1], noId: partes[2], botaoId: partes[3] };
}

export const BOTAO_GATE = "gate";

// --- utilidades ---

export function janelaAberta(contato: Pick<Contact, "lastInboundAt">, agora = Date.now()): boolean {
  return Boolean(contato.lastInboundAt && agora - contato.lastInboundAt.getTime() < JANELA_MS - MARGEM_JANELA_MS);
}

export function destinoDe(flow: Flow, noId: string, saida: string): FlowNode | undefined {
  const e = flow.edges.find((x) => x.source === noId && (x.sourceHandle ?? "next") === saida);
  return e ? flow.nodes.find((n) => n.id === e.target) : undefined;
}

export async function registrarEvento(
  ctx: Pick<Ctx, "conta" | "automacao" | "contato" | "simulado"> & { run?: FlowRun },
  type: EventType,
  extras: { nodeId?: string; meta?: Prisma.InputJsonValue } = {},
) {
  await db.event.create({
    data: {
      accountId: ctx.conta.id,
      automationId: ctx.automacao.id,
      contactId: ctx.contato.id,
      runId: ctx.run?.id,
      nodeId: extras.nodeId,
      type,
      meta: extras.meta,
      simulated: ctx.simulado,
    },
  });
}

function lockKeyDo(conta: Account, contato: Contact) {
  return `contato:${conta.igUserId}:${contato.igsid}`;
}

async function linkRastreado(ctx: Ctx, noId: string, botaoId: string, url: string): Promise<string> {
  const existente = await db.trackedLink.findUnique({
    where: { automationId_nodeId_buttonId_url: { automationId: ctx.automacao.id, nodeId: noId, buttonId: botaoId, url } },
  });
  const link =
    existente ??
    (await db.trackedLink.create({
      data: { id: randomBytes(6).toString("base64url"), automationId: ctx.automacao.id, nodeId: noId, buttonId: botaoId, url },
    }));
  return `${env.appUrl()}/r/${link.id}/${ctx.contato.id}`;
}

// --- envio ---

type ResultadoEnvio = { ok: true } | { ok: false; r: Resultado };

async function enviar(
  ctx: Ctx,
  noId: string,
  msg: MensagemMeta,
  registro: { kind: string; text?: string },
  opcoes: { alternativasPrivadas?: MensagemMeta[]; soComJanela?: boolean } = {},
): Promise<ResultadoEnvio> {
  const agora = Date.now();
  let para: Destinatario;
  let privada = false;
  if (janelaAberta(ctx.contato, agora)) {
    para = { id: ctx.contato.igsid };
  } else if (
    !opcoes.soComJanela &&
    ctx.run.commentId &&
    !ctx.run.privateReplyUsed &&
    ctx.run.commentCreatedAt &&
    agora - ctx.run.commentCreatedAt.getTime() < RESPOSTA_PRIVADA_MS - 60 * 60 * 1000
  ) {
    para = { comment_id: ctx.run.commentId };
    privada = true;
  } else {
    return { ok: false, r: { tipo: "bloqueado" } };
  }

  if (!ctx.simulado) {
    const cfg = await lerConfiguracoes();
    const naUltimaHora = await db.message.count({
      where: {
        accountId: ctx.conta.id,
        direction: "OUT",
        external: false,
        simulated: false,
        error: null,
        createdAt: { gte: new Date(agora - 60 * 60 * 1000) },
      },
    });
    if (naUltimaHora >= cfg.limiteDmsHora) {
      return { ok: false, r: { tipo: "adiar", ate: new Date(agora + 5 * 60 * 1000) } };
    }
  }

  const t = transportePara(ctx.conta, ctx.contato);
  let enviada = msg;
  let mid: string | undefined;
  try {
    // Se a Meta recusar o formato na resposta privada (botão, resposta
    // rápida), tenta as versões mais simples: o efeito é o mesmo, a resposta
    // da pessoa abre a conversa e "digitar o título" conta como clique.
    const formatos = [msg, ...(privada ? (opcoes.alternativasPrivadas ?? []) : [])];
    for (let i = 0; ; i++) {
      enviada = formatos[i];
      try {
        mid = (await t.enviar(ctx.conta, para, enviada)).mid;
        break;
      } catch (e) {
        const ultimo = i === formatos.length - 1;
        if (ultimo || !(e instanceof GraphError) || !e.parametroInvalido) throw e;
      }
    }
  } catch (e) {
    const ge = e instanceof GraphError ? e : null;
    if (ge?.janelaFechada) {
      if (privada) {
        ctx.run = await db.flowRun.update({ where: { id: ctx.run.id }, data: { privateReplyUsed: true } });
      }
      return { ok: false, r: { tipo: "bloqueado" } };
    }
    if (ge?.limiteDeTaxa) return { ok: false, r: { tipo: "adiar", ate: new Date(Date.now() + 15 * 60 * 1000) } };
    // Queda de rede ou 5xx da Meta: o job tenta de novo (com espera crescente).
    if (!ge || (ge.status >= 500 && !ge.destinatarioIndisponivel && !ge.tokenInvalido)) throw e;
    const erro = `Meta ${ge.code ?? ge.status}${ge.subcode ? `/${ge.subcode}` : ""}: ${ge.message}`;
    await db.message.create({
      data: {
        accountId: ctx.conta.id,
        contactId: ctx.contato.id,
        direction: "OUT",
        kind: registro.kind,
        text: registro.text,
        payload: enviada as Prisma.InputJsonValue,
        runId: ctx.run.id,
        automationId: ctx.automacao.id,
        simulated: ctx.simulado,
        error: erro.slice(0, 1000),
      },
    });
    await registrarEvento(ctx, "MESSAGE_FAILED", { nodeId: noId, meta: { erro: erro.slice(0, 500) } });
    return { ok: false, r: { tipo: "falhou", erro } };
  }

  if (privada) {
    ctx.run = await db.flowRun.update({ where: { id: ctx.run.id }, data: { privateReplyUsed: true } });
  }
  await db.message.create({
    data: {
      accountId: ctx.conta.id,
      contactId: ctx.contato.id,
      direction: "OUT",
      mid: mid ?? null,
      kind: privada ? `${registro.kind}_privada` : registro.kind,
      text: registro.text,
      payload: enviada as Prisma.InputJsonValue,
      runId: ctx.run.id,
      automationId: ctx.automacao.id,
      simulated: ctx.simulado,
    },
  });
  ctx.contato = await db.contact.update({ where: { id: ctx.contato.id }, data: { lastOutboundAt: new Date() } });
  await registrarEvento(ctx, "MESSAGE_SENT", { nodeId: noId, meta: { privada } });
  return { ok: true };
}

/** Versões mais simples da mensagem pra resposta privada, da mais rica ao texto puro. */
export function alternativasPrivadas(texto: string, links: string[], opcoes: { title: string; payload: string }[]): MensagemMeta[] {
  const base = [texto, ...links].join("\n\n");
  if (!opcoes.length) return links.length ? [{ text: base }] : [];
  const titulos = opcoes.map((o) => `"${o.title}"`);
  const quais = titulos.length > 1 ? `${titulos.slice(0, -1).join(", ")} ou ${titulos[titulos.length - 1]}` : titulos[0];
  return [
    { text: base, quick_replies: opcoes.map((o) => ({ content_type: "text" as const, title: o.title, payload: o.payload })) },
    { text: `${base}\n\n👉 Responda ${quais} aqui.` },
  ];
}

async function montarMensagem(ctx: Ctx, no: FlowNode<"message">): Promise<{ msg: MensagemMeta; alternativas: MensagemMeta[]; texto: string }> {
  const d = no.data;
  const texto = renderizar(d.text, ctx.contato);
  const rastrear = d.trackLinks !== false;

  if (d.buttons.length > 0) {
    const botoes = await Promise.all(
      d.buttons.map(async (b) =>
        b.kind === "url"
          ? { type: "web_url" as const, url: rastrear ? await linkRastreado(ctx, no.id, b.id, b.url) : b.url, title: b.title }
          : { type: "postback" as const, title: b.title, payload: payloadBotao(ctx.run.id, no.id, b.id) },
      ),
    );
    const msg: MensagemMeta = { attachment: { type: "template", payload: { template_type: "button", text: texto, buttons: botoes } } };
    const links = botoes.filter((b) => b.type === "web_url").map((b) => `${b.title}: ${(b as { url: string }).url}`);
    const opcoes = botoes.filter((b) => b.type === "postback").map((b) => ({ title: b.title, payload: (b as { payload: string }).payload }));
    return { msg, alternativas: alternativasPrivadas(texto, links, opcoes), texto };
  }
  if (d.quickReplies.length > 0) {
    const opcoes = d.quickReplies.map((q) => ({ title: q.title, payload: payloadBotao(ctx.run.id, no.id, q.id) }));
    return {
      msg: { text: texto, quick_replies: opcoes.map((o) => ({ content_type: "text", title: o.title, payload: o.payload })) },
      alternativas: alternativasPrivadas(texto, [], opcoes).slice(1),
      texto,
    };
  }
  return { msg: { text: texto }, alternativas: [], texto };
}

async function mensagemComBotaoUnico(ctx: Ctx, noId: string, texto: string, tituloBotao: string, botaoId: string) {
  const payload = payloadBotao(ctx.run.id, noId, botaoId);
  const msg: MensagemMeta = {
    attachment: { type: "template", payload: { template_type: "button", text: texto, buttons: [{ type: "postback", title: tituloBotao, payload }] } },
  };
  return enviar(ctx, noId, msg, { kind: "botao", text: texto }, { alternativasPrivadas: alternativasPrivadas(texto, [], [{ title: tituloBotao, payload }]) });
}

// --- segue? ---

async function segueAConta(ctx: Ctx): Promise<boolean> {
  try {
    const perfil = await transportePara(ctx.conta, ctx.contato).perfil(ctx.conta, ctx.contato);
    ctx.contato = await db.contact.update({
      where: { id: ctx.contato.id },
      data: {
        followsUs: perfil.is_user_follow_business ?? null,
        ...(perfil.name ? { name: perfil.name } : {}),
        ...(perfil.username ? { username: perfil.username } : {}),
        ...(perfil.profile_pic ? { profilePic: perfil.profile_pic } : {}),
        ...(perfil.follower_count !== undefined ? { followerCount: perfil.follower_count } : {}),
        profileFetchedAt: new Date(),
      },
    });
    return perfil.is_user_follow_business === true;
  } catch {
    // Sem consentimento (a pessoa ainda não falou no direct) a Meta não
    // devolve o perfil: trata como "não sei" = não segue.
    return ctx.contato.followsUs === true;
  }
}

// --- validação de resposta ---

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarResposta(texto: string, tipo: NodeDataMap["ask"]["validation"]): string | null {
  const t = texto.trim();
  if (!t) return null;
  switch (tipo) {
    case "email": {
      const achado = t.match(/[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>().,;]{2,}/);
      const e = (achado?.[0] ?? t).toLowerCase();
      return RE_EMAIL.test(e) ? e : null;
    }
    case "phone": {
      const dig = t.replace(/\D/g, "");
      return dig.length >= 10 && dig.length <= 13 ? dig : null;
    }
    case "number": {
      const n = Number(t.replace(",", "."));
      return Number.isFinite(n) ? String(n) : null;
    }
    default:
      return t.slice(0, 500);
  }
}

function valorAtual(contato: Contact, saveTo: NodeDataMap["ask"]["saveTo"]): string | undefined {
  if (saveTo === "email") return contato.email ?? undefined;
  if (saveTo === "phone") return contato.phone ?? undefined;
  const v = ((contato.fields ?? {}) as Record<string, unknown>)[saveTo.slice(6)];
  return v === undefined || v === null || v === "" ? undefined : String(v);
}

async function gravarResposta(ctx: Ctx, saveTo: NodeDataMap["ask"]["saveTo"], valor: string) {
  if (saveTo === "email") {
    ctx.contato = await db.contact.update({ where: { id: ctx.contato.id }, data: { email: valor } });
  } else if (saveTo === "phone") {
    ctx.contato = await db.contact.update({ where: { id: ctx.contato.id }, data: { phone: valor } });
  } else {
    const campos = { ...((ctx.contato.fields ?? {}) as Record<string, unknown>), [saveTo.slice(6)]: valor };
    ctx.contato = await db.contact.update({ where: { id: ctx.contato.id }, data: { fields: campos as Prisma.InputJsonValue } });
  }
}

// --- etiquetas e condição ---

async function aplicarEtiquetas(ctx: Ctx, add: string[], remove: string[]) {
  for (const nome of add.map((x) => x.trim()).filter(Boolean)) {
    const tag = await db.tag.upsert({
      where: { accountId_name: { accountId: ctx.conta.id, name: nome } },
      create: { accountId: ctx.conta.id, name: nome },
      update: {},
    });
    await db.contactTag.upsert({
      where: { contactId_tagId: { contactId: ctx.contato.id, tagId: tag.id } },
      create: { contactId: ctx.contato.id, tagId: tag.id },
      update: {},
    });
  }
  const tirar = remove.map((x) => x.trim()).filter(Boolean);
  if (tirar.length) {
    await db.contactTag.deleteMany({ where: { contactId: ctx.contato.id, tag: { name: { in: tirar } } } });
  }
}

async function avaliarCondicao(ctx: Ctx, regra: NodeDataMap["condition"]["rule"]): Promise<boolean> {
  switch (regra.type) {
    case "follows":
      return segueAConta(ctx);
    case "hasEmail":
      return Boolean(ctx.contato.email);
    case "hasTag": {
      const n = await db.contactTag.count({ where: { contactId: ctx.contato.id, tag: { name: regra.tag.trim() } } });
      return n > 0;
    }
    case "field": {
      const v = valorAtual(ctx.contato, `field:${regra.field}`);
      if (regra.op === "exists") return v !== undefined;
      if (v === undefined) return false;
      const alvo = normalizar(regra.value ?? "");
      return regra.op === "equals" ? normalizar(v) === alvo : normalizar(v).includes(alvo);
    }
  }
}

// --- nós ---

function tentativas(ctx: Ctx, noId: string): number {
  return ctx.estado.tentativas?.[noId] ?? 0;
}

function contarTentativa(ctx: Ctx, noId: string, valor: number) {
  ctx.estado = { ...ctx.estado, tentativas: { ...(ctx.estado.tentativas ?? {}), [noId]: valor } };
}

function esperaEmMs(d: NodeDataMap["delay"], simulado: boolean): number {
  const ms = d.amount * (d.unit === "hours" ? 3_600_000 : d.unit === "minutes" ? 60_000 : 1000);
  // No simulador ninguém quer esperar horas: toda espera vira no máximo 3 s.
  return simulado ? Math.min(ms, 3000) : ms;
}

async function entrarNo(ctx: Ctx, no: FlowNode): Promise<Resultado> {
  switch (no.type) {
    case "trigger":
      return { tipo: "seguir", saida: "next" };

    case "message": {
      const n = no as FlowNode<"message">;
      // Imagem vai antes do texto, mas só com a janela aberta: a resposta
      // privada ao comentário aceita uma mensagem só.
      if (n.data.imageUrl && janelaAberta(ctx.contato)) {
        const img = await enviar(ctx, no.id, { attachment: { type: "image", payload: { url: n.data.imageUrl } } }, { kind: "imagem", text: n.data.imageUrl }, { soComJanela: true });
        if (!img.ok && img.r.tipo !== "bloqueado") return img.r;
      }
      const { msg, alternativas, texto } = await montarMensagem(ctx, n);
      const envio = await enviar(ctx, no.id, msg, { kind: n.data.buttons.length ? "botao" : "texto", text: texto }, { alternativasPrivadas: alternativas });
      if (!envio.ok) return envio.r;
      return mensagemTemRamos(n.data) ? { tipo: "esperar", status: "WAITING_BUTTON" } : { tipo: "seguir", saida: "next" };
    }

    case "delay":
      return { tipo: "esperar", status: "WAITING_DELAY", ate: new Date(Date.now() + esperaEmMs(no.data as NodeDataMap["delay"], ctx.simulado)) };

    case "condition":
      return { tipo: "seguir", saida: (await avaliarCondicao(ctx, (no.data as NodeDataMap["condition"]).rule)) ? "yes" : "no" };

    case "followGate": {
      const d = no.data as NodeDataMap["followGate"];
      if (await segueAConta(ctx)) {
        await registrarEvento(ctx, "FOLLOW_GATE_PASSED", { nodeId: no.id });
        return { tipo: "seguir", saida: "yes" };
      }
      const envio = await mensagemComBotaoUnico(ctx, no.id, renderizar(d.askText, ctx.contato), d.buttonTitle, BOTAO_GATE);
      if (!envio.ok) return envio.r;
      contarTentativa(ctx, no.id, 1);
      return { tipo: "esperar", status: "WAITING_BUTTON" };
    }

    case "ask": {
      const d = no.data as NodeDataMap["ask"];
      if (d.skipIfFilled && valorAtual(ctx.contato, d.saveTo) !== undefined) return { tipo: "seguir", saida: "ok" };
      const texto = renderizar(d.question, ctx.contato);
      const envio = await enviar(ctx, no.id, { text: texto }, { kind: "pergunta", text: texto });
      if (!envio.ok) return envio.r;
      contarTentativa(ctx, no.id, 0);
      return { tipo: "esperar", status: "WAITING_INPUT", ate: new Date(Date.now() + JANELA_MS) };
    }

    case "tag": {
      const d = no.data as NodeDataMap["tag"];
      await aplicarEtiquetas(ctx, d.add, d.remove);
      return { tipo: "seguir", saida: "next" };
    }

    case "brevo": {
      const d = no.data as NodeDataMap["brevo"];
      if (!ctx.contato.email) return { tipo: "seguir", saida: "next" };
      if (ctx.simulado) {
        await registrarEvento(ctx, "BREVO_SYNCED", { nodeId: no.id, meta: { simulado: true, listId: d.listId } });
        return { tipo: "seguir", saida: "next" };
      }
      const r = await adicionarAoBrevo(ctx.contato.email, ctx.contato.name ?? ctx.contato.username, d.listId);
      await registrarEvento(ctx, "BREVO_SYNCED", { nodeId: no.id, meta: r.ok ? { listId: d.listId } : { listId: d.listId, erro: r.erro ?? "" } });
      return { tipo: "seguir", saida: "next" };
    }
  }
  return { tipo: "falhou", erro: `Tipo de passo desconhecido: ${(no as FlowNode).type}` };
}

async function retomarNo(ctx: Ctx, no: FlowNode, entrada: Entrada): Promise<Resultado> {
  const status = ctx.run.status;

  if (status === "WAITING_DELAY") {
    return entrada.tipo === "retomar" ? { tipo: "seguir", saida: "next" } : { tipo: "ignorar" };
  }

  if (status === "WAITING_BUTTON" && entrada.tipo === "clique" && entrada.noId === no.id) {
    if (no.type === "message") {
      const d = no.data as NodeDataMap["message"];
      const botao = [...d.buttons.filter((b) => b.kind === "next"), ...d.quickReplies].find((b) => b.id === entrada.botaoId);
      if (!botao) return { tipo: "ignorar" };
      await registrarEvento(ctx, "BUTTON_CLICK", { nodeId: no.id, meta: { botao: botao.title } });
      return { tipo: "seguir", saida: `btn:${botao.id}` };
    }
    if (no.type === "followGate" && entrada.botaoId === BOTAO_GATE) {
      const d = no.data as NodeDataMap["followGate"];
      await registrarEvento(ctx, "BUTTON_CLICK", { nodeId: no.id, meta: { botao: d.buttonTitle } });
      if (await segueAConta(ctx)) {
        await registrarEvento(ctx, "FOLLOW_GATE_PASSED", { nodeId: no.id });
        return { tipo: "seguir", saida: "yes" };
      }
      const feitas = tentativas(ctx, no.id);
      if (feitas >= Math.max(1, d.maxAttempts)) {
        await registrarEvento(ctx, "FOLLOW_GATE_BLOCKED", { nodeId: no.id });
        return { tipo: "seguir", saida: "no" };
      }
      const envio = await mensagemComBotaoUnico(ctx, no.id, renderizar(d.retryText || d.askText, ctx.contato), d.buttonTitle, BOTAO_GATE);
      if (!envio.ok) return envio.r;
      contarTentativa(ctx, no.id, feitas + 1);
      return { tipo: "esperar", status: "WAITING_BUTTON" };
    }
    return { tipo: "ignorar" };
  }

  if (status === "WAITING_INPUT" && entrada.tipo === "texto" && no.type === "ask") {
    const d = no.data as NodeDataMap["ask"];
    const valor = validarResposta(entrada.texto, d.validation);
    if (valor !== null) {
      await gravarResposta(ctx, d.saveTo, valor);
      await registrarEvento(ctx, "INPUT_CAPTURED", { nodeId: no.id, meta: { campo: d.saveTo } });
      return { tipo: "seguir", saida: "ok" };
    }
    const feitas = tentativas(ctx, no.id) + 1;
    if (feitas >= Math.max(1, d.maxAttempts)) return { tipo: "seguir", saida: "fail" };
    contarTentativa(ctx, no.id, feitas);
    const texto = renderizar(d.retryText || d.question, ctx.contato);
    const envio = await enviar(ctx, no.id, { text: texto }, { kind: "pergunta", text: texto });
    if (!envio.ok) return envio.r;
    return { tipo: "esperar", status: "WAITING_INPUT", ate: new Date(Date.now() + JANELA_MS) };
  }

  return { tipo: "ignorar" };
}

// --- laço principal ---

async function carregar(runId: string): Promise<Ctx | null> {
  const run = await db.flowRun.findUnique({
    where: { id: runId },
    include: { automation: { include: { account: true } }, contact: true },
  });
  if (!run) return null;
  const { automation, contact, ...soRun } = run;
  const { account, ...soAutomacao } = automation;
  return {
    run: soRun as FlowRun,
    automacao: soAutomacao as Automation,
    conta: account,
    contato: contact,
    flow: automation.flow as unknown as Flow,
    estado: (run.state ?? {}) as EstadoRun,
    simulado: ehSimulado(account, contact),
  };
}

async function finalizar(ctx: Ctx, status: RunStatus, erro?: string) {
  ctx.run = await db.flowRun.update({
    where: { id: ctx.run.id },
    data: { status, error: erro?.slice(0, 1000), finishedAt: new Date(), waitingUntil: null, state: ctx.estado as Prisma.InputJsonValue },
  });
  await registrarEvento(ctx, "RUN_FINISHED", { meta: { status } });
}

/**
 * Avança a execução. Sem `entrada`, entra no nó atual (início, reenvio após
 * limite de taxa, ou janela que reabriu). Com `entrada`, retoma o nó que
 * estava esperando (clique, texto, fim da espera).
 */
export async function avancar(runId: string, entrada?: Entrada): Promise<void> {
  const ctx = await carregar(runId);
  if (!ctx || STATUS_TERMINAIS.includes(ctx.run.status)) return;

  // Esperando a janela reabrir: qualquer sinal da pessoa faz entrar de novo no nó.
  let pendente: Entrada | undefined = ctx.run.status === "WAITING_INBOUND" || ctx.run.status === "RUNNING" ? undefined : entrada ?? { tipo: "retomar" };

  for (let passos = 0; passos < MAX_PASSOS; passos++) {
    const no = ctx.flow.nodes.find((n) => n.id === ctx.run.currentNodeId);
    if (!no) return finalizar(ctx, "DONE");

    let r: Resultado;
    try {
      r = pendente ? await retomarNo(ctx, no, pendente) : await entrarNo(ctx, no);
    } catch (e) {
      // erro passageiro: guarda o estado e deixa o job tentar de novo
      await db.flowRun.update({ where: { id: ctx.run.id }, data: { state: ctx.estado as Prisma.InputJsonValue } });
      throw e;
    }
    pendente = undefined;

    switch (r.tipo) {
      case "ignorar":
        return;
      case "seguir": {
        const prox = destinoDe(ctx.flow, no.id, r.saida);
        if (!prox) return finalizar(ctx, "DONE");
        ctx.run = await db.flowRun.update({
          where: { id: ctx.run.id },
          data: { currentNodeId: prox.id, status: "RUNNING", waitingUntil: null, stepCount: { increment: 1 }, state: ctx.estado as Prisma.InputJsonValue },
        });
        continue;
      }
      case "esperar": {
        ctx.run = await db.flowRun.update({
          where: { id: ctx.run.id },
          data: { status: r.status, waitingUntil: r.ate ?? null, state: ctx.estado as Prisma.InputJsonValue },
        });
        if (r.status === "WAITING_DELAY" && r.ate) {
          await enfileirar(
            "run.advance",
            { runId: ctx.run.id, esperado: { noId: no.id, status: "WAITING_DELAY" } },
            { runAt: r.ate, lockKey: lockKeyDo(ctx.conta, ctx.contato) },
          );
        }
        return;
      }
      case "bloqueado":
        ctx.run = await db.flowRun.update({
          where: { id: ctx.run.id },
          data: { status: "WAITING_INBOUND", waitingUntil: new Date(Date.now() + 7 * JANELA_MS), state: ctx.estado as Prisma.InputJsonValue },
        });
        return;
      case "adiar":
        ctx.run = await db.flowRun.update({ where: { id: ctx.run.id }, data: { status: "RUNNING", state: ctx.estado as Prisma.InputJsonValue } });
        await enfileirar("run.advance", { runId: ctx.run.id }, { runAt: r.ate, lockKey: lockKeyDo(ctx.conta, ctx.contato) });
        return;
      case "falhou":
        return finalizar(ctx, "FAILED", r.erro);
    }
  }
  return finalizar(ctx, "FAILED", "O fluxo passou de 60 passos seguidos (laço sem espera?).");
}

/** Começa uma execução nova. `inicio` permite começar no meio (botão antigo). */
export async function iniciarRun(
  automacao: Automation,
  contato: Contact,
  origem: { commentId?: string; commentCreatedAt?: Date; inicio?: string } = {},
): Promise<FlowRun> {
  // Pergunta antiga sem resposta não pode roubar o texto do fluxo novo.
  await db.flowRun.updateMany({
    where: { contactId: contato.id, status: "WAITING_INPUT" },
    data: { status: "CANCELLED", finishedAt: new Date(), waitingUntil: null },
  });
  const run = await db.flowRun.create({
    data: {
      automationId: automacao.id,
      contactId: contato.id,
      currentNodeId: origem.inicio ?? TRIGGER_NODE_ID,
      commentId: origem.commentId,
      commentCreatedAt: origem.commentCreatedAt,
    },
  });
  const conta = await db.account.findUniqueOrThrow({ where: { id: automacao.accountId } });
  if (!origem.inicio) {
    await registrarEvento({ conta, automacao, contato, run, simulado: ehSimulado(conta, contato) }, "TRIGGERED", {
      meta: origem.commentId ? { comentario: origem.commentId } : undefined,
    });
  }
  await avancar(run.id);
  return run;
}
