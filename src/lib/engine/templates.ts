import type { TriggerType } from "@prisma/client";
import { TRIGGER_NODE_ID, type Flow, type FlowEdge, type FlowNode, type TriggerConfig } from "./types";

// Modelos prontos pra começar uma automação.

export type Modelo = {
  id: string;
  titulo: string;
  descricao: string;
  triggerType: TriggerType;
  nome: string;
  triggerConfig: TriggerConfig;
  flow: Flow;
};

const gatilho = (x = 40, y = 160): FlowNode => ({ id: TRIGGER_NODE_ID, type: "trigger", position: { x, y }, data: {} });
const liga = (source: string, target: string, sourceHandle = "next"): FlowEdge => ({ id: `${source}-${sourceHandle}-${target}`, source, target, sourceHandle });

const RESPOSTAS_PUBLICAS = ["Te mandei no direct 📩", "Enviado! Olha o direct 👀", "Chegou no seu direct, confere lá"];

export const MODELOS: Modelo[] = [
  {
    id: "comentario-link",
    titulo: "Comentário → link no direct",
    descricao: "Quem comenta a palavra-chave recebe uma DM com botão; ao clicar, chega o link. Responde o comentário em público.",
    triggerType: "COMMENT",
    nome: "Comenta QUERO → link no direct",
    triggerConfig: {
      keywords: ["quero"],
      match: "contains",
      mediaScope: "any",
      includeReplies: false,
      publicReplyEnabled: true,
      publicReplies: RESPOSTAS_PUBLICAS,
      cooldownMinutes: 60,
    },
    flow: {
      nodes: [
        gatilho(),
        {
          id: "abertura",
          type: "message",
          position: { x: 340, y: 120 },
          data: {
            text: "Opa! Vi seu comentário. O material que eu prometi no vídeo tá pronto. Clica no botão que eu te mando o link 👇",
            buttons: [{ id: "quero", title: "Quero o material", kind: "next" }],
            quickReplies: [],
          },
        },
        {
          id: "link",
          type: "message",
          position: { x: 700, y: 120 },
          data: {
            text: "Tá aqui! Depois me conta o que achou 🤝",
            buttons: [{ id: "abrir", title: "Abrir o link", kind: "url", url: "https://exemplo.com" }],
            quickReplies: [],
            trackLinks: true,
          },
        },
      ],
      edges: [liga(TRIGGER_NODE_ID, "abertura"), liga("abertura", "link", "btn:quero")],
    },
  },
  {
    id: "comentario-seguidor",
    titulo: "Link só pra quem segue",
    descricao: "Igual ao anterior, mas confere se a pessoa te segue antes de mandar o link. Se não segue, pede o follow.",
    triggerType: "COMMENT",
    nome: "Comenta LINK → só pra seguidor",
    triggerConfig: {
      keywords: ["link"],
      match: "contains",
      mediaScope: "any",
      publicReplyEnabled: true,
      publicReplies: RESPOSTAS_PUBLICAS,
      cooldownMinutes: 60,
    },
    flow: {
      nodes: [
        gatilho(),
        {
          id: "abertura",
          type: "message",
          position: { x: 340, y: 120 },
          data: { text: "Opa! Clica aqui que eu te mando 👇", buttons: [{ id: "quero", title: "Quero receber", kind: "next" }], quickReplies: [] },
        },
        {
          id: "segue",
          type: "followGate",
          position: { x: 700, y: 120 },
          data: {
            askText: "Esse material é exclusivo pra quem me segue. Me segue aqui no @ e depois clica no botão 👇",
            buttonTitle: "Já segui ✅",
            retryText: "Ainda não apareceu aqui que você me segue 🤔 Confere e clica de novo.",
            maxAttempts: 3,
          },
        },
        {
          id: "link",
          type: "message",
          position: { x: 1060, y: 40 },
          data: { text: "Valeu por seguir! Tá aqui 👇", buttons: [{ id: "abrir", title: "Abrir", kind: "url", url: "https://exemplo.com" }], quickReplies: [], trackLinks: true },
        },
        {
          id: "desistiu",
          type: "message",
          position: { x: 1060, y: 320 },
          data: { text: "Sem problema! Quando seguir, é só comentar de novo no post que eu te mando.", buttons: [], quickReplies: [] },
        },
      ],
      edges: [liga(TRIGGER_NODE_ID, "abertura"), liga("abertura", "segue", "btn:quero"), liga("segue", "link", "yes"), liga("segue", "desistiu", "no")],
    },
  },
  {
    id: "comentario-email",
    titulo: "Comentário → pede e-mail → Brevo",
    descricao: "Captura o e-mail no direct, grava no contato e manda pra uma lista do Brevo (que dispara a sequência de e-mails).",
    triggerType: "COMMENT",
    nome: "Comenta → e-mail → Brevo",
    triggerConfig: {
      keywords: ["guia"],
      match: "contains",
      mediaScope: "any",
      publicReplyEnabled: true,
      publicReplies: RESPOSTAS_PUBLICAS,
      cooldownMinutes: 60,
    },
    flow: {
      nodes: [
        gatilho(),
        {
          id: "abertura",
          type: "message",
          position: { x: 340, y: 120 },
          data: { text: "Opa! Te mando o material por e-mail. Bora? 👇", buttons: [{ id: "bora", title: "Bora", kind: "next" }], quickReplies: [] },
        },
        {
          id: "email",
          type: "ask",
          position: { x: 700, y: 120 },
          data: {
            question: "Qual o seu melhor e-mail?",
            saveTo: "email",
            validation: "email",
            retryText: "Hmm, isso não parece um e-mail 🤔 Manda de novo?",
            maxAttempts: 3,
            skipIfFilled: true,
          },
        },
        { id: "brevo", type: "brevo", position: { x: 1060, y: 40 }, data: { listId: 0 } },
        { id: "tag", type: "tag", position: { x: 1400, y: 40 }, data: { add: ["lead-guia"], remove: [] } },
        {
          id: "pronto",
          type: "message",
          position: { x: 1740, y: 40 },
          data: { text: "Pronto! Chegou no {{email}}. Se não achar, olha no spam 😉", buttons: [], quickReplies: [] },
        },
        {
          id: "falhou",
          type: "message",
          position: { x: 1060, y: 320 },
          data: { text: "Sem problema! Quando quiser, é só me mandar o e-mail aqui.", buttons: [], quickReplies: [] },
        },
      ],
      edges: [
        liga(TRIGGER_NODE_ID, "abertura"),
        liga("abertura", "email", "btn:bora"),
        liga("email", "brevo", "ok"),
        liga("brevo", "tag"),
        liga("tag", "pronto"),
        liga("email", "falhou", "fail"),
      ],
    },
  },
  {
    id: "dm-palavra",
    titulo: "Palavra-chave no direct",
    descricao: "Quem manda a palavra no direct recebe a resposta na hora (ex.: 'LINK', 'PREÇO').",
    triggerType: "DM_KEYWORD",
    nome: "Direct: LINK",
    triggerConfig: { keywords: ["link"], match: "contains", cooldownMinutes: 10 },
    flow: {
      nodes: [
        gatilho(),
        {
          id: "resposta",
          type: "message",
          position: { x: 340, y: 120 },
          data: { text: "Tá na mão 👇", buttons: [{ id: "abrir", title: "Abrir", kind: "url", url: "https://exemplo.com" }], quickReplies: [], trackLinks: true },
        },
      ],
      edges: [liga(TRIGGER_NODE_ID, "resposta")],
    },
  },
  {
    id: "story-resposta",
    titulo: "Resposta a story",
    descricao: "Responde automaticamente quem reage ou responde seus stories (com ou sem palavra-chave).",
    triggerType: "STORY_REPLY",
    nome: "Resposta a story",
    triggerConfig: { keywords: [], match: "any", cooldownMinutes: 6 * 60 },
    flow: {
      nodes: [
        gatilho(),
        { id: "resposta", type: "message", position: { x: 340, y: 120 }, data: { text: "Valeu por responder o story! 🙌", buttons: [], quickReplies: [] } },
      ],
      edges: [liga(TRIGGER_NODE_ID, "resposta")],
    },
  },
  {
    id: "story-mencao",
    titulo: "Agradecer menção no story",
    descricao: "Quando alguém te marca no story, manda um agradecimento no direct.",
    triggerType: "STORY_MENTION",
    nome: "Agradece menção",
    triggerConfig: { keywords: [], match: "any", cooldownMinutes: 24 * 60 },
    flow: {
      nodes: [
        gatilho(),
        { id: "resposta", type: "message", position: { x: 340, y: 120 }, data: { text: "Opa, vi que você me marcou! Valeu demais 🙏", buttons: [], quickReplies: [] } },
      ],
      edges: [liga(TRIGGER_NODE_ID, "resposta")],
    },
  },
  {
    id: "padrao",
    titulo: "Resposta padrão",
    descricao: "Quando nenhuma automação bate, avisa que você já responde (no máximo uma vez por dia por pessoa).",
    triggerType: "DEFAULT_REPLY",
    nome: "Resposta padrão",
    triggerConfig: { keywords: [], match: "any", cooldownMinutes: 24 * 60 },
    flow: {
      nodes: [
        gatilho(),
        {
          id: "resposta",
          type: "message",
          position: { x: 340, y: 120 },
          data: { text: "Oi, {{primeiro_nome|tudo bem}}? Recebi sua mensagem e te respondo assim que puder 🙌", buttons: [], quickReplies: [] },
        },
      ],
      edges: [liga(TRIGGER_NODE_ID, "resposta")],
    },
  },
  {
    id: "branco",
    titulo: "Em branco",
    descricao: "Só o gatilho de comentário. Monte o fluxo do zero.",
    triggerType: "COMMENT",
    nome: "Nova automação",
    triggerConfig: { keywords: [], match: "contains", mediaScope: "any", publicReplyEnabled: false, publicReplies: [], cooldownMinutes: 60 },
    flow: { nodes: [gatilho()], edges: [] },
  },
];

export const ROTULO_GATILHO: Record<TriggerType, string> = {
  COMMENT: "Comentário em post ou reel",
  DM_KEYWORD: "Palavra-chave no direct",
  STORY_REPLY: "Resposta a story",
  STORY_MENTION: "Menção em story",
  DEFAULT_REPLY: "Resposta padrão",
};
