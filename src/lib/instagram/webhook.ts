// Converte o corpo do webhook da Meta (object = "instagram") numa lista de
// itens simples. Cada item é processado num job próprio, travado por contato.

export type ItemEntrada =
  | {
      kind: "comment";
      accountIgId: string;
      commentId: string;
      mediaId: string;
      mediaProductType?: string;
      fromId: string;
      fromUsername?: string;
      text: string;
      parentId?: string;
      timestamp: number;
      /** Só simulador: testa esta automação mesmo em rascunho. */
      simAutomacaoId?: string;
    }
  | {
      kind: "message";
      accountIgId: string;
      senderId: string;
      mid: string;
      text?: string;
      quickReplyPayload?: string;
      replyToStory?: { id?: string; url?: string };
      storyMention?: { url?: string };
      attachments?: { type: string; url?: string }[];
      timestamp: number;
      simAutomacaoId?: string;
    }
  | { kind: "echo"; accountIgId: string; recipientId: string; mid: string; text?: string; timestamp: number }
  | { kind: "postback"; accountIgId: string; senderId: string; mid?: string; payload: string; title?: string; timestamp: number };

type EventoMessaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number | string;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    quick_reply?: { payload?: string };
    reply_to?: { story?: { id?: string; url?: string }; mid?: string };
    attachments?: { type?: string; payload?: { url?: string } }[];
  };
  postback?: { mid?: string; title?: string; payload?: string };
};

function ts(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  // A Meta manda ora em segundos, ora em milissegundos.
  return n < 1e12 ? n * 1000 : n;
}

function deMessaging(contaId: string, ev: EventoMessaging): ItemEntrada[] {
  const quando = ts(ev.timestamp);
  if (ev.postback?.payload) {
    const senderId = ev.sender?.id;
    if (!senderId || senderId === contaId) return [];
    return [{ kind: "postback", accountIgId: contaId, senderId, mid: ev.postback.mid, payload: ev.postback.payload, title: ev.postback.title, timestamp: quando }];
  }
  const m = ev.message;
  if (!m?.mid || m.is_deleted) return [];
  if (m.is_echo) {
    const recipientId = ev.recipient?.id;
    if (!recipientId) return [];
    return [{ kind: "echo", accountIgId: contaId, recipientId, mid: m.mid, text: m.text, timestamp: quando }];
  }
  const senderId = ev.sender?.id;
  if (!senderId || senderId === contaId) return [];
  const anexos = (m.attachments ?? []).map((a) => ({ type: a.type ?? "desconhecido", url: a.payload?.url }));
  const mencao = anexos.find((a) => a.type === "story_mention");
  return [
    {
      kind: "message",
      accountIgId: contaId,
      senderId,
      mid: m.mid,
      text: m.text,
      quickReplyPayload: m.quick_reply?.payload,
      replyToStory: m.reply_to?.story ? { id: m.reply_to.story.id, url: m.reply_to.story.url } : undefined,
      storyMention: mencao ? { url: mencao.url } : undefined,
      attachments: anexos.length ? anexos : undefined,
      timestamp: quando,
    },
  ];
}

export function extrairItens(corpo: unknown): ItemEntrada[] {
  const c = corpo as { object?: string; entry?: unknown[] };
  if (!c || c.object !== "instagram" || !Array.isArray(c.entry)) return [];
  const itens: ItemEntrada[] = [];

  for (const bruto of c.entry) {
    const entrada = bruto as { id?: string; time?: number; messaging?: EventoMessaging[]; changes?: { field?: string; value?: any }[] };
    const contaId = String(entrada.id ?? "");
    if (!contaId) continue;

    for (const ev of entrada.messaging ?? []) itens.push(...deMessaging(contaId, ev));

    for (const mudanca of entrada.changes ?? []) {
      const v = mudanca.value ?? {};
      if (mudanca.field === "comments" || mudanca.field === "live_comments") {
        const fromId = v.from?.id ? String(v.from.id) : "";
        if (!v.id || !fromId || typeof v.text !== "string") continue;
        itens.push({
          kind: "comment",
          accountIgId: contaId,
          commentId: String(v.id),
          mediaId: String(v.media?.id ?? ""),
          mediaProductType: v.media?.media_product_type,
          fromId,
          fromUsername: v.from?.username,
          text: v.text,
          parentId: v.parent_id ? String(v.parent_id) : undefined,
          timestamp: ts(entrada.time),
        });
      } else if (mudanca.field === "messages" || mudanca.field === "messaging_postbacks") {
        // O botão "Testar" do painel da Meta manda mensagens dentro de changes.
        itens.push(...deMessaging(contaId, v as EventoMessaging));
      }
    }
  }
  return itens;
}

/** Chave da trava do job: um contato por vez. */
export function chaveDoContato(item: ItemEntrada): string {
  const pessoa =
    item.kind === "comment" ? item.fromId : item.kind === "echo" ? item.recipientId : item.senderId;
  return `contato:${item.accountIgId}:${pessoa}`;
}
