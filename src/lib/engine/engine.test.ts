import type { Account } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { GraphError } from "@/lib/instagram/graph";
import { drenarChave } from "@/lib/jobs";
import { enfileirar } from "@/lib/queue";
import { salvarConfiguracoes } from "@/lib/settings";
import {
  MetaFalsa,
  chegou,
  criarAutomacao,
  criarConta,
  drenar,
  fluxo,
  limparBanco,
  no,
  payloadsDe,
  textoDe,
  webhookComentario,
  webhookEco,
  webhookMensagem,
  webhookPostback,
} from "@/test/helpers";
import { substituirTransporteMeta } from "./transport";

let conta: Account;
let meta: MetaFalsa;

beforeEach(async () => {
  await limparBanco();
  conta = await criarConta();
  meta = new MetaFalsa().ligar();
});

afterAll(async () => {
  substituirTransporteMeta(null);
  await db.$disconnect();
});

/** Fluxo típico de "comenta a palavra": DM 1 com botão → DM 2 com link. */
async function automacaoAgentes() {
  const dm1 = no("message", {
    text: "Opa! Clica no botão que eu te mando o link 👇",
    buttons: [{ id: "quero", title: "Quero os agentes", kind: "next" }],
    quickReplies: [],
  });
  const dm2 = no("message", {
    text: "Tá aqui, {{nome|amigo}}!",
    buttons: [{ id: "link", title: "Abrir o kit", kind: "url", url: "https://exemplo.com/material" }],
    quickReplies: [],
  });
  return criarAutomacao(
    conta,
    "COMMENT",
    { keywords: ["agentes"], match: "contains", mediaScope: "any", publicReplyEnabled: true, publicReplies: ["Te mandei no direct 📩"] },
    fluxo([dm1, dm2], [["gatilho", dm1.id], [dm1.id, dm2.id, "btn:quero"]]),
  );
}

describe("comentário → DM", () => {
  it("responde em privado com botão, e o clique manda o link", async () => {
    const auto = await automacaoAgentes();
    await chegou(webhookComentario({ id: "c1", texto: "quero os AGENTES!", de: "u1", username: "maria" }));

    // 1ª mensagem vai como resposta privada ao comentário, com botão
    expect(meta.enviadas).toHaveLength(1);
    expect(meta.enviadas[0].para).toEqual({ comment_id: "c1" });
    expect(textoDe(meta.enviadas[0].msg)).toContain("Clica no botão");
    const [payload] = payloadsDe(meta.enviadas[0].msg);
    expect(payload).toMatch(/^mf1:/);

    const run = await db.flowRun.findFirstOrThrow({ where: { automationId: auto.id } });
    expect(run.status).toBe("WAITING_BUTTON");
    expect(run.privateReplyUsed).toBe(true);

    // resposta pública fica agendada (com atraso aleatório)
    await drenar({ tudo: true });
    expect(meta.respostas).toEqual([{ commentId: "c1", texto: "Te mandei no direct 📩" }]);

    // o clique abre a janela e libera a 2ª mensagem, direto pro IGSID
    await chegou(webhookPostback({ de: "u1", payload, titulo: "Quero os agentes" }));
    expect(meta.enviadas).toHaveLength(2);
    expect(meta.enviadas[1].para).toEqual({ id: "u1" });
    expect(textoDe(meta.enviadas[1].msg)).toBe("Tá aqui, maria!");
    const botao = (meta.enviadas[1].msg as any).attachment.payload.buttons[0];
    expect(botao.url).toMatch(/^https:\/\/teste\.manyfork\.local\/r\/[\w-]+\/c/);

    expect((await db.flowRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("DONE");
    const tipos = (await db.event.findMany({ where: { automationId: auto.id } })).map((e) => e.type);
    expect(tipos).toEqual(expect.arrayContaining(["TRIGGERED", "MESSAGE_SENT", "BUTTON_CLICK", "PUBLIC_REPLY", "RUN_FINISHED"]));
  });

  it("não dispara sem a palavra-chave nem em post fora da lista", async () => {
    await criarAutomacao(conta, "COMMENT", { keywords: ["agentes"], mediaScope: "specific", mediaIds: ["midiaX"] }, fluxo([], []));
    await chegou(webhookComentario({ id: "c1", texto: "agentes", de: "u1", midia: "midia1" }));
    await chegou(webhookComentario({ id: "c2", texto: "lindo vídeo", de: "u2", midia: "midiaX" }));
    expect(await db.flowRun.count()).toBe(0);
    expect(await db.comment.count()).toBe(2);
  });

  it("ignora reentrega do mesmo comentário e comentário da própria conta", async () => {
    await automacaoAgentes();
    const corpo = webhookComentario({ id: "c1", texto: "agentes", de: "u1" });
    await chegou(corpo);
    await chegou(corpo);
    await chegou(webhookComentario({ id: "c2", texto: "agentes", de: "17841400000000001", username: "minha.conta" }));
    expect(meta.enviadas).toHaveLength(1);
  });

  it("resposta a outro comentário só conta se includeReplies", async () => {
    await automacaoAgentes();
    await chegou(webhookComentario({ id: "c9", texto: "agentes", de: "u1", parent: "c0" }));
    expect(meta.enviadas).toHaveLength(0);
  });

  it("sem botão na 1ª mensagem, a 2ª espera a pessoa escrever", async () => {
    const m1 = no("message", { text: "Primeira", buttons: [], quickReplies: [] });
    const m2 = no("message", { text: "Segunda", buttons: [], quickReplies: [] });
    await criarAutomacao(conta, "COMMENT", { keywords: ["x"] }, fluxo([m1, m2], [["gatilho", m1.id], [m1.id, m2.id]]));
    await chegou(webhookComentario({ id: "c1", texto: "x", de: "u1" }));
    expect(meta.enviadas.map((e) => textoDe(e.msg))).toEqual(["Primeira"]);
    const run = await db.flowRun.findFirstOrThrow();
    expect(run.status).toBe("WAITING_INBOUND");

    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "oi?" }));
    expect(meta.enviadas.map((e) => textoDe(e.msg))).toEqual(["Primeira", "Segunda"]);
    expect((await db.flowRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("DONE");
  });

  it("se a Meta recusar o modelo com botão na resposta privada, manda texto com resposta rápida", async () => {
    await automacaoAgentes();
    meta.erros.push((para, msg) => ("comment_id" in para && "attachment" in msg ? new GraphError("Invalid parameter", 400, 100) : null));
    await chegou(webhookComentario({ id: "c1", texto: "agentes", de: "u1" }));
    expect(meta.enviadas).toHaveLength(1);
    const msg = meta.enviadas[0].msg as any;
    expect(msg.text).toContain("Clica no botão");
    expect(msg.quick_replies[0].title).toBe("Quero os agentes");

    // a pessoa toca na resposta rápida (chega como mensagem, não postback)
    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "Quero os agentes", quickReply: msg.quick_replies[0].payload }));
    expect(meta.enviadas).toHaveLength(2);
  });

  it("se a Meta recusar botão E resposta rápida, manda texto pedindo pra responder o título", async () => {
    await automacaoAgentes();
    meta.erros.push((para, msg) => ("comment_id" in para && ("attachment" in msg || "quick_replies" in msg) ? new GraphError("Invalid parameter", 400, 100) : null));
    await chegou(webhookComentario({ id: "c1", texto: "agentes", de: "u1" }));
    expect(meta.enviadas).toHaveLength(1);
    expect(textoDe(meta.enviadas[0].msg)).toMatch(/Responda "Quero os agentes" aqui\.$/);
    expect(await db.flowRun.findFirstOrThrow().then((r) => r.status)).toBe("WAITING_BUTTON");

    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "Quero os agentes" }));
    expect(meta.enviadas).toHaveLength(2);
    expect(meta.enviadas[1].para).toEqual({ id: "u1" });
  });

  it("botão antigo continua funcionando depois do fluxo terminar", async () => {
    await automacaoAgentes();
    await chegou(webhookComentario({ id: "c1", texto: "agentes", de: "u1" }));
    const [payload] = payloadsDe(meta.enviadas[0].msg);
    await chegou(webhookPostback({ de: "u1", payload }));
    await chegou(webhookPostback({ de: "u1", payload }));
    expect(meta.enviadas).toHaveLength(3);
    expect(await db.flowRun.count()).toBe(2);
  });

  it("digitar o título do botão vale como clique", async () => {
    await automacaoAgentes();
    await chegou(webhookComentario({ id: "c1", texto: "agentes", de: "u1" }));
    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "quero os agentes" }));
    expect(meta.enviadas).toHaveLength(2);
  });

  it("intervalo entre disparos para o mesmo contato", async () => {
    const m = no("message", { text: "Oi", buttons: [], quickReplies: [] });
    await criarAutomacao(conta, "COMMENT", { keywords: ["x"], cooldownMinutes: 60 }, fluxo([m], [["gatilho", m.id]]));
    await chegou(webhookComentario({ id: "c1", texto: "x", de: "u1" }));
    await chegou(webhookComentario({ id: "c2", texto: "x", de: "u1" }));
    expect(meta.enviadas).toHaveLength(1);
  });
});

describe("direct", () => {
  it("palavra-chave no direct + pergunta de e-mail com nova tentativa", async () => {
    const ask = no("ask", {
      question: "Qual seu melhor e-mail?",
      saveTo: "email",
      validation: "email",
      retryText: "Hmm, não parece e-mail. Manda de novo?",
      maxAttempts: 3,
      skipIfFilled: false,
    });
    const ok = no("message", { text: "Anotado: {{email}}", buttons: [], quickReplies: [] });
    const tag = no("tag", { add: ["lead"], remove: [] });
    await criarAutomacao(conta, "DM_KEYWORD", { keywords: ["guia"] }, fluxo([ask, ok, tag], [["gatilho", ask.id], [ask.id, ok.id, "ok"], [ok.id, tag.id]]));

    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "quero o GUIA" }));
    await chegou(webhookMensagem({ de: "u1", mid: "m2", texto: "meu email é esse" }));
    await chegou(webhookMensagem({ de: "u1", mid: "m3", texto: "pode mandar em Fulano@Exemplo.com, valeu" }));

    expect(meta.enviadas.map((e) => textoDe(e.msg))).toEqual([
      "Qual seu melhor e-mail?",
      "Hmm, não parece e-mail. Manda de novo?",
      "Anotado: fulano@exemplo.com",
    ]);
    const contato = await db.contact.findFirstOrThrow({ include: { tags: { include: { tag: true } } } });
    expect(contato.email).toBe("fulano@exemplo.com");
    expect(contato.tags.map((t) => t.tag.name)).toEqual(["lead"]);
  });

  it("resposta padrão respeita o intervalo de 24 h", async () => {
    const m = no("message", { text: "Já te respondo!", buttons: [], quickReplies: [] });
    await criarAutomacao(conta, "DEFAULT_REPLY", { keywords: [], match: "any" }, fluxo([m], [["gatilho", m.id]]));
    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "oi" }));
    await chegou(webhookMensagem({ de: "u1", mid: "m2", texto: "tudo bem?" }));
    expect(meta.enviadas).toHaveLength(1);
  });

  it("resposta a story e menção em story", async () => {
    const r = no("message", { text: "Valeu pela resposta no story!", buttons: [], quickReplies: [] });
    const m = no("message", { text: "Obrigado pela menção!", buttons: [], quickReplies: [] });
    await criarAutomacao(conta, "STORY_REPLY", { keywords: [], match: "any" }, fluxo([r], [["gatilho", r.id]]));
    await criarAutomacao(conta, "STORY_MENTION", { keywords: [], match: "any" }, fluxo([m], [["gatilho", m.id]]));
    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "🔥", story: true }));
    await chegou(webhookMensagem({ de: "u2", mid: "m2", mencao: true }));
    expect(meta.enviadas.map((e) => textoDe(e.msg))).toEqual(["Valeu pela resposta no story!", "Obrigado pela menção!"]);
  });

  it("eco da própria mensagem é ignorado; mensagem manual pelo app é registrada", async () => {
    const m = no("message", { text: "Oi", buttons: [], quickReplies: [] });
    await criarAutomacao(conta, "DM_KEYWORD", { keywords: ["oi"] }, fluxo([m], [["gatilho", m.id]]));
    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "oi" }));
    await chegou(webhookEco({ para: "u1", mid: "mid_1", texto: "Oi" }));
    await chegou(webhookEco({ para: "u1", mid: "manual1", texto: "respondi pelo celular" }));
    const saidas = await db.message.findMany({ where: { direction: "OUT" }, orderBy: { createdAt: "asc" } });
    expect(saidas.map((s) => [s.text, s.external])).toEqual([
      ["Oi", false],
      ["respondi pelo celular", true],
    ]);
  });

  it("contato com automação pausada não recebe nada", async () => {
    const m = no("message", { text: "Oi", buttons: [], quickReplies: [] });
    await criarAutomacao(conta, "DM_KEYWORD", { keywords: ["oi"] }, fluxo([m], [["gatilho", m.id]]));
    await db.contact.create({ data: { accountId: conta.id, igsid: "u1", automationPaused: true } });
    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "oi" }));
    expect(meta.enviadas).toHaveLength(0);
  });
});

describe("segue? (follow gate)", () => {
  it("pede pra seguir, confere de novo no clique e libera", async () => {
    const abre = no("message", { text: "Clica aqui", buttons: [{ id: "b", title: "Quero", kind: "next" }], quickReplies: [] });
    const gate = no("followGate", { askText: "Me segue e clica no botão", buttonTitle: "Já segui", retryText: "Ainda não apareceu aqui", maxAttempts: 3 });
    const link = no("message", { text: "Link liberado", buttons: [], quickReplies: [] });
    const nao = no("message", { text: "Sem follow, sem link", buttons: [], quickReplies: [] });
    await criarAutomacao(
      conta,
      "COMMENT",
      { keywords: ["kit"] },
      fluxo([abre, gate, link, nao], [["gatilho", abre.id], [abre.id, gate.id, "btn:b"], [gate.id, link.id, "yes"], [gate.id, nao.id, "no"]]),
    );

    await chegou(webhookComentario({ id: "c1", texto: "kit", de: "u1" }));
    meta.segue.set("u1", false);
    await chegou(webhookPostback({ de: "u1", payload: payloadsDe(meta.enviadas[0].msg)[0] }));
    expect(textoDe(meta.enviadas[1].msg)).toBe("Me segue e clica no botão");

    await chegou(webhookPostback({ de: "u1", payload: payloadsDe(meta.enviadas[1].msg)[0] }));
    expect(textoDe(meta.enviadas[2].msg)).toBe("Ainda não apareceu aqui");

    meta.segue.set("u1", true);
    await chegou(webhookPostback({ de: "u1", payload: payloadsDe(meta.enviadas[2].msg)[0] }));
    expect(textoDe(meta.enviadas[3].msg)).toBe("Link liberado");
    expect(await db.contact.findFirstOrThrow().then((c) => c.followsUs)).toBe(true);
  });
});

describe("simulador", () => {
  it("testa automação em rascunho só pro contato simulado, sem chamar a Meta", async () => {
    const m = no("message", { text: "Rascunho respondendo", buttons: [], quickReplies: [] });
    const rascunho = await criarAutomacao(conta, "DM_KEYWORD", { keywords: ["teste"] }, fluxo([m], [["gatilho", m.id]]), { status: "DRAFT" });
    const sim = await db.contact.create({ data: { accountId: conta.id, igsid: "sim_abc", username: "fake" } });

    // seguidor de verdade: rascunho não dispara
    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "teste" }));
    expect(meta.enviadas).toHaveLength(0);

    // simulado escolhendo a automação: dispara, mas nada vai pra Meta
    const k = `contato:${conta.igUserId}:${sim.igsid}`;
    await enfileirar("inbound", { item: { kind: "message", accountIgId: conta.igUserId, senderId: sim.igsid, mid: "s1", text: "teste", timestamp: Date.now(), simAutomacaoId: rascunho.id } }, { lockKey: k });
    await drenarChave(k);
    expect(meta.enviadas).toHaveLength(0);
    const saida = await db.message.findFirstOrThrow({ where: { contactId: sim.id, direction: "OUT" } });
    expect(saida.text).toBe("Rascunho respondendo");
    expect(saida.simulated).toBe(true);
    expect(await db.event.count({ where: { simulated: false } })).toBe(0);
  });
});

describe("limites e espera", () => {
  it("passou do limite por hora: adia em vez de mandar", async () => {
    await salvarConfiguracoes({ limiteDmsHora: 1 });
    const m1 = no("message", { text: "Um", buttons: [], quickReplies: [] });
    const m2 = no("message", { text: "Dois", buttons: [], quickReplies: [] });
    await criarAutomacao(conta, "DM_KEYWORD", { keywords: ["oi"] }, fluxo([m1, m2], [["gatilho", m1.id], [m1.id, m2.id]]));
    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "oi" }));
    expect(meta.enviadas.map((e) => textoDe(e.msg))).toEqual(["Um"]);
    const adiado = await db.job.findFirstOrThrow({ where: { type: "run.advance", status: "PENDING" } });
    expect(adiado.runAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
  });

  it("espera agenda a continuação e ignora job velho", async () => {
    const m1 = no("message", { text: "Agora", buttons: [], quickReplies: [] });
    const d = no("delay", { amount: 10, unit: "minutes" });
    const m2 = no("message", { text: "Depois", buttons: [], quickReplies: [] });
    await criarAutomacao(conta, "DM_KEYWORD", { keywords: ["oi"] }, fluxo([m1, d, m2], [["gatilho", m1.id], [m1.id, d.id], [d.id, m2.id]]));
    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "oi" }));
    const run = await db.flowRun.findFirstOrThrow();
    expect(run.status).toBe("WAITING_DELAY");
    expect(meta.enviadas).toHaveLength(1);
    await drenar({ tudo: true });
    expect(meta.enviadas.map((e) => textoDe(e.msg))).toEqual(["Agora", "Depois"]);
    await drenar({ tudo: true });
    expect(meta.enviadas).toHaveLength(2);
  });

  it("pessoa indisponível: execução falha sem travar a fila", async () => {
    const m = no("message", { text: "Oi", buttons: [], quickReplies: [] });
    await criarAutomacao(conta, "DM_KEYWORD", { keywords: ["oi"] }, fluxo([m], [["gatilho", m.id]]));
    meta.erros.push(() => new GraphError("This person isn't available right now.", 400, 551));
    await chegou(webhookMensagem({ de: "u1", mid: "m1", texto: "oi" }));
    const run = await db.flowRun.findFirstOrThrow();
    expect(run.status).toBe("FAILED");
    expect(await db.message.count({ where: { direction: "OUT", error: { not: null } } })).toBe(1);
  });
});
