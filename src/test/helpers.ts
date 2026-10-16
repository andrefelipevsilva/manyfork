import type { Account, Automation, Prisma } from "@prisma/client";
import { cifrar } from "@/lib/crypto";
import { db } from "@/lib/db";
import { substituirTransporteMeta, type Transporte } from "@/lib/engine/transport";
import { TRIGGER_NODE_ID, type Flow, type FlowNode, type TriggerConfig } from "@/lib/engine/types";
import { GraphError, type Destinatario, type MensagemMeta } from "@/lib/instagram/graph";
import { executarJob } from "@/lib/jobs";

export const IG_CONTA = "17841400000000001";

export async function limparBanco() {
  await db.$executeRawUnsafe(
    `TRUNCATE accounts, contacts, tags, contact_tags, automations, flow_runs, messages, comments, events, tracked_links, webhook_events, jobs, settings, login_attempts CASCADE`,
  );
}

export async function criarConta(): Promise<Account> {
  return db.account.create({
    data: { igUserId: IG_CONTA, username: "minha.conta", accessTokenEnc: cifrar("token-falso"), tokenExpiresAt: new Date(Date.now() + 50 * 86400000) },
  });
}

/** Dublê da Meta: guarda o que foi enviado e deixa programar erros. */
export class MetaFalsa implements Transporte {
  enviadas: { para: Destinatario; msg: MensagemMeta }[] = [];
  respostas: { commentId: string; texto: string }[] = [];
  segue = new Map<string, boolean>();
  erros: ((para: Destinatario, msg: MensagemMeta) => GraphError | null)[] = [];
  private n = 0;

  async enviar(_c: Account, para: Destinatario, msg: MensagemMeta) {
    for (const regra of this.erros) {
      const e = regra(para, msg);
      if (e) throw e;
    }
    this.enviadas.push({ para, msg });
    return { mid: `mid_${++this.n}` };
  }
  async responderComentario(_c: Account, commentId: string, texto: string) {
    this.respostas.push({ commentId, texto });
    return { id: `reply_${++this.n}` };
  }
  async perfil(_c: Account, contato: { igsid: string }) {
    if (!this.segue.has(contato.igsid)) throw new GraphError("User consent is required to access user profile", 400, 100);
    return { is_user_follow_business: this.segue.get(contato.igsid) };
  }
  ligar() {
    substituirTransporteMeta(this);
    return this;
  }
}

/** Texto (ou texto do modelo de botão) de uma mensagem enviada. */
export function textoDe(msg: MensagemMeta): string {
  if ("text" in msg) return msg.text;
  if (msg.attachment.type === "template") return msg.attachment.payload.text;
  return `[imagem ${msg.attachment.payload.url}]`;
}

export function payloadsDe(msg: MensagemMeta): string[] {
  const rapidas = "quick_replies" in msg ? (msg.quick_replies ?? []).map((q) => q.payload) : [];
  if ("attachment" in msg && msg.attachment.type === "template") {
    return [...msg.attachment.payload.buttons.flatMap((b) => (b.type === "postback" ? [b.payload] : [])), ...rapidas];
  }
  return rapidas;
}

/** Executa os jobs pendentes já vencidos (ou todos, com `tudo`). */
export async function drenar(opcoes: { tudo?: boolean } = {}) {
  for (let i = 0; i < 200; i++) {
    const job = await db.job.findFirst({
      // +1 s de folga: o relógio do Postgres no Docker do Windows anda uns ms à frente.
      where: { status: "PENDING", ...(opcoes.tudo ? {} : { runAt: { lte: new Date(Date.now() + 1000) } }) },
      orderBy: { createdAt: "asc" },
    });
    if (!job) return;
    await db.job.update({ where: { id: job.id }, data: { status: "RUNNING", attempts: { increment: 1 } } });
    await executarJob(job);
    await db.job.update({ where: { id: job.id }, data: { status: "DONE", finishedAt: new Date() } });
  }
  throw new Error("drenar: jobs demais (laço?)");
}

let seq = 0;
export function no<K extends FlowNode["type"]>(type: K, data: FlowNode<K>["data"], id = `n${++seq}`): FlowNode<K> {
  return { id, type, position: { x: 0, y: 0 }, data };
}

export function fluxo(nos: FlowNode[], ligacoes: [string, string, string?][]): Flow {
  return {
    nodes: [no("trigger", {}, TRIGGER_NODE_ID), ...nos],
    edges: ligacoes.map(([source, target, handle], i) => ({ id: `e${i}`, source, target, sourceHandle: handle ?? "next" })),
  };
}

export async function criarAutomacao(
  conta: Account,
  triggerType: Automation["triggerType"],
  cfg: Partial<TriggerConfig>,
  flow: Flow,
  extra: Partial<Prisma.AutomationUncheckedCreateInput> = {},
) {
  return db.automation.create({
    data: {
      accountId: conta.id,
      name: "teste",
      status: "ACTIVE",
      triggerType,
      triggerConfig: { keywords: [], match: "contains", ...cfg } as Prisma.InputJsonValue,
      flow: flow as unknown as Prisma.InputJsonValue,
      ...extra,
    },
  });
}

// --- webhooks de exemplo (formato da Meta) ---

export function webhookComentario(o: { id: string; texto: string; de: string; username?: string; midia?: string; parent?: string }) {
  return {
    object: "instagram",
    entry: [
      {
        id: IG_CONTA,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: "comments",
            value: {
              from: { id: o.de, username: o.username ?? "fulano" },
              media: { id: o.midia ?? "midia1", media_product_type: "REELS" },
              id: o.id,
              text: o.texto,
              ...(o.parent ? { parent_id: o.parent } : {}),
            },
          },
        ],
      },
    ],
  };
}

export function webhookMensagem(o: { de: string; mid: string; texto?: string; quickReply?: string; story?: boolean; mencao?: boolean }) {
  return {
    object: "instagram",
    entry: [
      {
        id: IG_CONTA,
        time: Date.now(),
        messaging: [
          {
            sender: { id: o.de },
            recipient: { id: IG_CONTA },
            timestamp: Date.now(),
            message: {
              mid: o.mid,
              ...(o.texto !== undefined ? { text: o.texto } : {}),
              ...(o.quickReply ? { quick_reply: { payload: o.quickReply } } : {}),
              ...(o.story ? { reply_to: { story: { id: "story1", url: "https://cdn/story1" } } } : {}),
              ...(o.mencao ? { attachments: [{ type: "story_mention", payload: { url: "https://cdn/mencao" } }] } : {}),
            },
          },
        ],
      },
    ],
  };
}

export function webhookPostback(o: { de: string; payload: string; titulo?: string; mid?: string }) {
  return {
    object: "instagram",
    entry: [
      {
        id: IG_CONTA,
        time: Date.now(),
        messaging: [
          {
            sender: { id: o.de },
            recipient: { id: IG_CONTA },
            timestamp: Date.now(),
            postback: { mid: o.mid ?? `pb_${Math.random()}`, title: o.titulo ?? "Botão", payload: o.payload },
          },
        ],
      },
    ],
  };
}

export function webhookEco(o: { para: string; mid: string; texto: string }) {
  return {
    object: "instagram",
    entry: [
      {
        id: IG_CONTA,
        time: Date.now(),
        messaging: [{ sender: { id: IG_CONTA }, recipient: { id: o.para }, timestamp: Date.now(), message: { mid: o.mid, text: o.texto, is_echo: true } }],
      },
    ],
  };
}

/** Simula a chegada do webhook: grava, enfileira e processa tudo que venceu. */
export async function chegou(corpo: unknown) {
  const ev = await db.webhookEvent.create({ data: { payload: corpo as Prisma.InputJsonValue } });
  await db.job.create({ data: { type: "webhook", payload: { webhookEventId: ev.id }, runAt: new Date() } });
  await drenar();
}
