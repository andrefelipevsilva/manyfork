import type { Account, Contact } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { decifrar } from "../crypto";
import {
  enviarMensagem,
  perfilDoUsuario,
  responderComentario,
  type Destinatario,
  type MensagemMeta,
  type PerfilUsuario,
} from "../instagram/graph";

// Camada de saída. A de verdade fala com a Meta; a do simulador só devolve
// ids falsos (o histórico é gravado pelo motor do mesmo jeito nos dois casos).

export interface Transporte {
  enviar(conta: Account, para: Destinatario, msg: MensagemMeta): Promise<{ mid?: string }>;
  responderComentario(conta: Account, commentId: string, texto: string): Promise<{ id: string }>;
  perfil(conta: Account, contato: Contact): Promise<PerfilUsuario>;
}

export const PREFIXO_SIMULADO = "sim_";

export function ehSimulado(conta: Pick<Account, "simulated">, contato?: Pick<Contact, "igsid"> | null): boolean {
  return conta.simulated || Boolean(contato?.igsid.startsWith(PREFIXO_SIMULADO));
}

const transporteMeta: Transporte = {
  async enviar(conta, para, msg) {
    const r = await enviarMensagem(decifrar(conta.accessTokenEnc), conta.igUserId, para, msg);
    return { mid: r.message_id };
  },
  async responderComentario(conta, commentId, texto) {
    return responderComentario(decifrar(conta.accessTokenEnc), commentId, texto);
  },
  async perfil(conta, contato) {
    return perfilDoUsuario(decifrar(conta.accessTokenEnc), contato.igsid);
  },
};

const transporteSimulado: Transporte = {
  async enviar() {
    return { mid: `sim_mid_${randomUUID()}` };
  },
  async responderComentario() {
    return { id: `sim_reply_${randomUUID()}` };
  },
  async perfil(_conta, contato) {
    const f = (contato.fields ?? {}) as Record<string, unknown>;
    return {
      username: contato.username ?? undefined,
      name: contato.name ?? undefined,
      is_user_follow_business: f.sim_segue === true,
    };
  },
};

let substitutoMeta: Transporte | null = null;

/** Só pros testes: troca a Meta por um dublê. */
export function substituirTransporteMeta(t: Transporte | null) {
  substitutoMeta = t;
}

export function transportePara(conta: Account, contato?: Contact | null): Transporte {
  if (ehSimulado(conta, contato)) return transporteSimulado;
  return substitutoMeta ?? transporteMeta;
}
