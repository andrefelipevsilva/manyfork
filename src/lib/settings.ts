import { db } from "./db";

// Configurações editáveis no painel (tabela settings). Tudo tem padrão.

export type Configuracoes = {
  /** DMs automáticas por hora (a Meta corta acima de ~200/h por conta). */
  limiteDmsHora: number;
  /** Respostas públicas em comentário por hora. */
  limiteRespostasPublicasHora: number;
  /** Espera aleatória antes da resposta pública (segundos), pra não parecer robô. */
  atrasoRespostaPublicaMin: number;
  atrasoRespostaPublicaMax: number;
  /** Se você responder pelo app do Instagram, pausa a automação daquele contato. */
  pausarAoResponderManual: boolean;
};

export const PADRAO: Configuracoes = {
  limiteDmsHora: 180,
  limiteRespostasPublicasHora: 150,
  atrasoRespostaPublicaMin: 4,
  atrasoRespostaPublicaMax: 25,
  pausarAoResponderManual: false,
};

const CHAVE = "configuracoes";

export async function lerConfiguracoes(): Promise<Configuracoes> {
  const s = await db.setting.findUnique({ where: { key: CHAVE } });
  return { ...PADRAO, ...((s?.value as Partial<Configuracoes> | undefined) ?? {}) };
}

export async function salvarConfiguracoes(parcial: Partial<Configuracoes>): Promise<Configuracoes> {
  const atual = await lerConfiguracoes();
  const novo = { ...atual, ...parcial };
  await db.setting.upsert({ where: { key: CHAVE }, create: { key: CHAVE, value: novo }, update: { value: novo } });
  return novo;
}
