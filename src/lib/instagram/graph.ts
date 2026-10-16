import { env } from "../env";

// Cliente mínimo da Instagram API with Instagram Login (graph.instagram.com).
// Docs: developers.facebook.com/docs/instagram-platform

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
    readonly corpo?: unknown,
  ) {
    super(message);
    this.name = "GraphError";
  }

  /** Fora da janela de 24 h, ou resposta privada já usada/expirada. */
  get janelaFechada(): boolean {
    return (
      this.subcode === 2534022 ||
      this.subcode === 2534023 ||
      /outside (of )?(the )?allowed window|24 hour|already (been )?replied|private repl/i.test(this.message)
    );
  }

  get limiteDeTaxa(): boolean {
    return [4, 17, 32, 613].includes(this.code ?? -1) || this.status === 429;
  }

  get tokenInvalido(): boolean {
    return this.code === 190;
  }

  /** Pessoa bloqueou, saiu, ou não aceita mensagem. Não adianta tentar de novo. */
  get destinatarioIndisponivel(): boolean {
    return this.code === 551 || this.subcode === 2534014 || /isn't available|not available right now/i.test(this.message);
  }

  /** Erro de parâmetro (ex.: modelo de botão recusado na resposta privada). */
  get parametroInvalido(): boolean {
    return this.code === 100 && !this.destinatarioIndisponivel;
  }
}

type Metodo = "GET" | "POST" | "DELETE";

export async function graph<T>(
  metodo: Metodo,
  caminho: string,
  token: string,
  opcoes: { query?: Record<string, string>; corpo?: unknown; base?: string } = {},
): Promise<T> {
  const base = opcoes.base ?? `https://graph.instagram.com/${env.graphVersion()}`;
  const url = new URL(caminho.startsWith("http") ? caminho : `${base}${caminho}`);
  for (const [k, v] of Object.entries(opcoes.query ?? {})) url.searchParams.set(k, v);

  const resp = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await resp.text();
  let dados: unknown = undefined;
  try {
    dados = texto ? JSON.parse(texto) : undefined;
  } catch {
    dados = texto;
  }
  if (!resp.ok) {
    const e = (dados as { error?: { message?: string; code?: number; error_subcode?: number } } | undefined)?.error;
    throw new GraphError(e?.message ?? `HTTP ${resp.status}`, resp.status, e?.code, e?.error_subcode, dados);
  }
  return dados as T;
}

// --- Mensagens ---

export type Destinatario = { id: string } | { comment_id: string };

export type MensagemMeta =
  | { text: string; quick_replies?: { content_type: "text"; title: string; payload: string }[] }
  | {
      attachment: {
        type: "template";
        payload: {
          template_type: "button";
          text: string;
          buttons: ({ type: "web_url"; url: string; title: string } | { type: "postback"; title: string; payload: string })[];
        };
      };
      quick_replies?: { content_type: "text"; title: string; payload: string }[];
    }
  | { attachment: { type: "image"; payload: { url: string } } };

export async function enviarMensagem(token: string, igUserId: string, recipient: Destinatario, message: MensagemMeta) {
  return graph<{ recipient_id?: string; message_id?: string }>("POST", `/${igUserId}/messages`, token, {
    corpo: { recipient, message },
  });
}

export async function responderComentario(token: string, commentId: string, texto: string) {
  return graph<{ id: string }>("POST", `/${commentId}/replies`, token, { query: { message: texto } });
}

export type PerfilUsuario = {
  name?: string;
  username?: string;
  profile_pic?: string;
  follower_count?: number;
  is_user_follow_business?: boolean;
  is_business_follow_user?: boolean;
};

/** Só funciona depois que a pessoa mandou mensagem/clicou (consentimento). */
export async function perfilDoUsuario(token: string, igsid: string) {
  return graph<PerfilUsuario>("GET", `/${igsid}`, token, {
    query: { fields: "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user" },
  });
}

export type Midia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
};

export async function listarMidias(token: string, depois?: string) {
  return graph<{ data: Midia[]; paging?: { cursors?: { after?: string }; next?: string } }>("GET", "/me/media", token, {
    query: {
      fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp",
      limit: "24",
      ...(depois ? { after: depois } : {}),
    },
  });
}

// --- Conta e webhooks ---

export type Eu = { user_id: string; id?: string; username: string; name?: string; profile_picture_url?: string; account_type?: string };

export async function quemSouEu(token: string) {
  return graph<Eu>("GET", "/me", token, { query: { fields: "user_id,username,name,profile_picture_url,account_type" } });
}

export const CAMPOS_WEBHOOK = ["comments", "messages", "messaging_postbacks", "message_reactions", "messaging_seen"];

export async function assinarWebhooks(token: string) {
  return graph<{ success: boolean }>("POST", "/me/subscribed_apps", token, {
    query: { subscribed_fields: CAMPOS_WEBHOOK.join(",") },
  });
}

export async function webhooksAssinados(token: string) {
  return graph<{ data: { subscribed_fields?: string[] }[] }>("GET", "/me/subscribed_apps", token);
}
